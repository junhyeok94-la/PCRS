from collections import OrderedDict, deque
from contextlib import asynccontextmanager
import logging
from time import monotonic

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
import httpx

from .kma import KmaClient, now_kst
from .cache import WeatherCacheStore
from .models import NearbyRegion, RegionSearch, WeatherEnvelope, WeatherRequest
from .regions import Regions
from .service import WeatherService
from .settings import Settings


def create_app(settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None, clock=None) -> FastAPI:
    settings = settings or Settings.load()
    regions = Regions()
    # HTTPX INFO logs include the URL containing the upstream secret.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(15, connect=5), transport=transport,
            limits=httpx.Limits(max_connections=8, max_keepalive_connections=4), follow_redirects=False,
        ) as client:
            kwargs = {"clock": clock} if clock is not None else {}
            store = WeatherCacheStore(settings.cache_db_path, settings.cache_entries)
            app.state.weather = WeatherService(settings, KmaClient(settings.service_key, client, store,
                settings.daily_request_limit, clock or now_kst), regions, store=store, **kwargs)
            try:
                yield
            finally:
                store.close()

    app = FastAPI(title="Thermal Guide Weather API", version="0.1.0", lifespan=lifespan)
    requests: OrderedDict[str, deque] = OrderedDict()

    @app.middleware("http")
    async def local_rate_limit(request: Request, call_next):
        # Initial local-service guard, not a substitute for a production gateway. Do not trust XFF.
        if request.url.path.startswith("/v1/"):
            identity = request.client.host if request.client else "unknown"
            now = monotonic()
            window = requests.setdefault(identity, deque())
            requests.move_to_end(identity)
            while window and window[0] <= now - 60:
                window.popleft()
            if len(window) >= 60:
                return JSONResponse({"error": {"code": "request_rate_limited"}}, status_code=429, headers={"Retry-After": "60"})
            window.append(now)
            while len(requests) > 1024:
                requests.popitem(last=False)
        return await call_next(request)

    @app.get("/health")
    async def health():
        return {"service": "thermal-guide-weather", "status": "ok", "schemaVersion": "1.0"}

    @app.get("/ready")
    async def ready():
        budget_ready = settings.daily_request_limit is None or app.state.weather.store.db is not None
        is_ready = bool(settings.service_key) and budget_ready
        return JSONResponse({"ready": is_ready}, status_code=200 if is_ready else 503)

    @app.get("/v1/regions", response_model=RegionSearch)
    async def search_regions(q: str = Query(min_length=2, max_length=60), limit: int = Query(default=15, ge=1, le=30)):
        return {"regions": [region.model_dump(by_alias=True) for region in regions.search(q.strip(), limit)]}

    @app.get("/v1/regions/nearby", response_model=NearbyRegion)
    async def nearby(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180)):
        result = regions.nearest(latitude, longitude)
        if result is None:
            raise HTTPException(404, detail={"code": "region_not_found"})
        region, distance = result
        return {"region": region.model_dump(by_alias=True), "matchKind": "nearest_representative_point",
                "distanceKm": round(distance, 2), "requiresConfirmation": True}

    @app.post("/v1/weather", response_model=WeatherEnvelope, responses={503: {"model": WeatherEnvelope}})
    async def weather(payload: WeatherRequest, request: Request):
        selected = []
        for identifier in dict.fromkeys(payload.region_ids):
            region = regions.by_id.get(identifier)
            if region is None:
                raise HTTPException(422, detail={"code": "unknown_region_id"})
            selected.append(region)
        result = await request.app.state.weather.weather(selected, payload.hours)
        all_failed = all(location.status == "unavailable" for location in result.locations)
        return JSONResponse(result.model_dump(mode="json", by_alias=True), status_code=503 if all_failed else 200,
                            headers={"Cache-Control": "no-store"})

    return app


app = create_app()
