"""Explicit, key-safe live verification. Never prints a service key or upstream request URL."""
import asyncio
import json
import logging
from pathlib import Path
import sys

import httpx

from .kma import KmaClient
from .regions import Regions
from .service import WeatherService
from .settings import Settings


async def verify() -> int:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    settings = Settings.load()
    if not settings.service_key:
        print(json.dumps({"ok": False, "code": "service_not_configured"}))
        return 2
    regions = Regions()
    selected = [regions.by_id[identifier] for identifier in ("1144000000", "1168000000")]
    async with httpx.AsyncClient(timeout=httpx.Timeout(15, connect=5), follow_redirects=False) as client:
        service = WeatherService(settings, KmaClient(settings.service_key, client), regions)
        result = await service.weather(selected, 36)
        # A second request should reuse the same underlying datasets, not invent updated timestamps.
        again = await service.weather(selected, 36)
    summary = {"ok": all(location.status == "available" for location in result.locations),
               "isSample": result.is_sample,
               "locations": [{"id": location.location.id, "status": location.status,
                              "forecastPoints": len(location.forecast.points) if location.forecast else 0,
                              "currentPoints": len(location.current.points) if location.current else 0,
                              "forecastFreshness": location.forecast.freshness if location.forecast else None,
                              "errors": [error.code for error in location.errors]} for location in result.locations],
               "cacheReused": all(a.forecast and b.forecast and a.forecast.fetched_at == b.forecast.fetched_at
                                  for a, b in zip(result.locations, again.locations))}
    output = Path(__file__).with_name(".cache")
    output.mkdir(exist_ok=True)
    (output / "live-weather.json").write_text(result.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
    (output / "live-check.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))
    return 0 if summary["ok"] and summary["cacheReused"] else 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(verify()))
    except Exception as error:
        # External transport errors can embed URLs. Deliberately redact exception messages.
        print(json.dumps({"ok": False, "code": "verification_failed", "errorType": type(error).__name__}))
        sys.exit(1)
