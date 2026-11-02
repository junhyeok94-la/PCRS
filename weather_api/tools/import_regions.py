"""Convert the official guide's XLSX to a small runtime CSV using only the standard library."""
import argparse
import csv
from hashlib import sha256
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def import_regions(source: Path, output: Path):
    with zipfile.ZipFile(source) as guide:
        name = next(name for name in guide.namelist() if name.lower().endswith(".xlsx"))
        workbook = guide.read(name)
    with zipfile.ZipFile(io.BytesIO(workbook)) as book:
        strings = ["".join(node.itertext()) for node in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        sheet = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))
        result = []
        for row in sheet.findall("s:sheetData/s:row", NS)[1:]:
            values = {}
            for cell in row.findall("s:c", NS):
                column = "".join(c for c in cell.attrib["r"] if c.isalpha())
                value_node = cell.find("s:v", NS)
                value = value_node.text if value_node is not None else ""
                if cell.get("t") == "s" and value:
                    value = strings[int(value)]
                values[column] = value or ""
            if values.get("A") != "kor" or not values.get("B") or not values.get("F") or not values.get("G"):
                continue
            parts = [values.get(column, "").strip() for column in ("C", "D", "E")]
            try:
                result.append({"id": values["B"], "name": " ".join(part for part in parts if part),
                               "level": sum(bool(part) for part in parts), "grid_x": int(values["F"]), "grid_y": int(values["G"]),
                               "latitude": round(float(values["O"]), 7), "longitude": round(float(values["N"]), 7)})
            except (ValueError, KeyError):
                raise ValueError("Unexpected official spreadsheet format; do not silently omit a region") from None
    if len({r["id"] for r in result}) != len(result) or len(result) < 3000:
        raise ValueError("Unexpected region count or duplicate IDs")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(result[0]))
        writer.writeheader()
        writer.writerows(result)
    metadata = {"sourceUrl": "https://www.data.go.kr/data/15084084/openapi.do", "guideVersion": "261019",
                "sourceSha256": sha256(source.read_bytes()).hexdigest(), "workbookSha256": sha256(workbook).hexdigest(),
                "license": "공공누리 제1유형: 출처표시", "transformation": "전국 행정구역 이름·격자·대표 좌표를 CSV로 정규화",
                "regionCount": len(result)}
    output.with_suffix(".source.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"regionCount": len(result), "output": str(output)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).parents[1] / "data" / "regions.csv")
    args = parser.parse_args()
    import_regions(args.source, args.output)
