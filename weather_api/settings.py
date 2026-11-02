from dataclasses import dataclass, field
import os
from pathlib import Path
from urllib.parse import unquote

from dotenv import dotenv_values


@dataclass(frozen=True)
class Settings:
    service_key: str = field(default="", repr=False)
    forecast_stale_seconds: int = 21600
    current_stale_seconds: int = 1200
    failure_backoff_seconds: int = 30
    cache_entries: int = 512
    cache_db_path: Path | None = None
    daily_request_limit: int | None = None

    @classmethod
    def load(cls) -> "Settings":
        # Only this service's ignored file is read; never inherit the legacy backend .env.
        values = dotenv_values(Path(__file__).with_name(".env"))
        key = os.environ.get("KMA_SERVICE_KEY") or values.get("KMA_SERVICE_KEY") or ""
        raw_limit = os.environ.get("KMA_DAILY_REQUEST_LIMIT") or values.get("KMA_DAILY_REQUEST_LIMIT") or ""
        if raw_limit.strip() and (not raw_limit.strip().isascii() or not raw_limit.strip().isdigit()):
            raise ValueError("KMA_DAILY_REQUEST_LIMIT must be positive or blank")
        limit = int(raw_limit) if raw_limit.strip() else None
        if limit is not None and limit <= 0:
            raise ValueError("KMA_DAILY_REQUEST_LIMIT must be positive or blank")
        return cls(service_key=unquote(key.strip()), daily_request_limit=limit,
                   cache_db_path=Path(__file__).with_name(".cache") / "weather.sqlite3")
