"""Single-host persistent cache and atomic accounting of upstream request attempts."""
from datetime import date, timedelta
from pathlib import Path
import sqlite3
from threading import RLock

from .models import Dataset


class BudgetExhausted(Exception):
    pass


class BudgetUnavailable(Exception):
    pass


class WeatherCacheStore:
    def __init__(self, path: Path | None = None, entries: int = 512, byte_limit: int = 64 * 1024 * 1024):
        self.lock = RLock()
        self.entries, self.byte_limit = entries, byte_limit
        try:
            if path:
                path.parent.mkdir(parents=True, exist_ok=True)
            self.db = sqlite3.connect(str(path) if path else ":memory:", timeout=2, check_same_thread=False)
            self.db.execute("PRAGMA journal_mode=WAL")
            self.db.executescript("""
                CREATE TABLE IF NOT EXISTS weather_v1 (
                    kind TEXT, x INTEGER, y INTEGER, payload TEXT NOT NULL,
                    touched INTEGER NOT NULL, PRIMARY KEY(kind,x,y));
                CREATE TABLE IF NOT EXISTS upstream_usage_v1 (day TEXT PRIMARY KEY, attempts INTEGER NOT NULL);
            """)
        except (OSError, sqlite3.Error):
            # Cache failure must not masquerade as live weather. A configured quota fails closed below.
            if getattr(self, "db", None):
                self.db.close()
            self.db = None

    def load(self, kind: str, x: int, y: int) -> Dataset | None:
        if self.db is None:
            return None
        try:
            with self.lock:
                row = self.db.execute("SELECT payload FROM weather_v1 WHERE kind=? AND x=? AND y=?", (kind, x, y)).fetchone()
            if not row:
                return None
            data = Dataset.model_validate_json(row[0])
            expected = "representative_observation" if kind == "current" else "hourly_forecast"
            dates = [data.issued_at, data.fetched_at, data.expires_at] + [p.valid_at for p in data.points]
            if data.kind != expected or data.provider != "kma_data_go_kr" or not data.points or not all(d.tzinfo for d in dates):
                return None
            return data
        except (ValueError, sqlite3.Error):
            return None

    def save(self, kind: str, x: int, y: int, data: Dataset) -> None:
        if self.db is None:
            return
        payload = data.model_dump_json(by_alias=True)
        if len(payload.encode("utf-8")) > 2_000_000:
            return
        try:
            with self.lock, self.db:
                # Monotonic ordering within the DB, independent of host wall-clock corrections.
                order = self.db.execute("SELECT COALESCE(MAX(touched),0)+1 FROM weather_v1").fetchone()[0]
                self.db.execute("INSERT OR REPLACE INTO weather_v1 VALUES(?,?,?,?,?)", (kind, x, y, payload, order))
                self.db.execute("DELETE FROM weather_v1 WHERE rowid NOT IN (SELECT rowid FROM weather_v1 ORDER BY touched DESC LIMIT ?)", (self.entries,))
                while self.db.execute("SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM weather_v1").fetchone()[0] > self.byte_limit:
                    self.db.execute("DELETE FROM weather_v1 WHERE rowid=(SELECT rowid FROM weather_v1 ORDER BY touched LIMIT 1)")
        except sqlite3.Error:
            pass

    def reserve(self, day: date, limit: int | None) -> None:
        """Reserve before each HTTP page; failed attempts count and cannot exceed the local cap."""
        if self.db is None:
            if limit is not None:
                raise BudgetUnavailable()
            return
        try:
            with self.lock, self.db:
                self.db.execute("INSERT OR IGNORE INTO upstream_usage_v1 VALUES(?,0)", (day.isoformat(),))
                changed = self.db.execute("UPDATE upstream_usage_v1 SET attempts=attempts+1 WHERE day=? AND (? IS NULL OR attempts < ?)", (day.isoformat(), limit, limit))
                if changed.rowcount != 1:
                    raise BudgetExhausted()
                self.db.execute("DELETE FROM upstream_usage_v1 WHERE day < ?", ((day - timedelta(days=31)).isoformat(),))
        except sqlite3.Error:
            if limit is not None:
                raise BudgetUnavailable() from None

    def attempts(self, day: date) -> int:
        if self.db is None:
            raise BudgetUnavailable()
        with self.lock:
            row = self.db.execute("SELECT attempts FROM upstream_usage_v1 WHERE day=?", (day.isoformat(),)).fetchone()
        return row[0] if row else 0

    def close(self):
        if self.db:
            self.db.close()
