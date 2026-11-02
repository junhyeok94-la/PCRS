import csv
import math
from pathlib import Path
import unicodedata

from .models import Region


def normalize(text: str) -> str:
    return "".join(unicodedata.normalize("NFKC", text).casefold().split())


class Regions:
    def __init__(self, source: Path | None = None):
        source = source or Path(__file__).with_name("data") / "regions.csv"
        with source.open(encoding="utf-8", newline="") as stream:
            self.items = [Region(
                id=row["id"], name=row["name"], level=int(row["level"]),
                grid_x=int(row["grid_x"]), grid_y=int(row["grid_y"]),
                latitude=float(row["latitude"]), longitude=float(row["longitude"]),
            ) for row in csv.DictReader(stream)]
        self.by_id = {item.id: item for item in self.items}
        aliases = {"서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
                   "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
                   "경기도": "경기", "강원특별자치도": "강원", "충청북도": "충북", "충청남도": "충남",
                   "전북특별자치도": "전북", "전라남도": "전남", "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주"}
        self.index = []
        for item in self.items:
            first, _, rest = item.name.partition(" ")
            alias = aliases.get(first, first) + rest
            self.index.append((item, normalize(item.name) + "|" + normalize(alias)))

    def search(self, query: str, limit: int = 15) -> list[Region]:
        # Administrative names only: no unverified reverse geocoding or street-address guesses.
        tokens = [normalize(word) for word in query.split() if normalize(word)]
        if not tokens:
            return []
        matches = [r for r, name in self.index if all(token in name for token in tokens)]
        exact = normalize(query)
        matches.sort(key=lambda r: (normalize(r.name) != exact, r.level, r.name))
        return matches[:limit]

    def nearest(self, latitude: float, longitude: float) -> tuple[Region, float] | None:
        # The nearest official representative point is NOT proof of a municipal boundary.
        def distance(region: Region) -> float:
            a, b = math.radians(latitude), math.radians(region.latitude)
            delta = math.radians(longitude - region.longitude)
            h = math.sin((a - b) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(delta / 2) ** 2
            return 6371 * 2 * math.asin(min(1, math.sqrt(h)))
        candidates = [(r, distance(r)) for r in self.items if r.level == 3]
        if not candidates:
            return None
        best = min(candidates, key=lambda item: item[1])
        return best if best[1] <= 50 else None
