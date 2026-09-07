#!/usr/bin/env python3
"""Rebuild the detailed adopted sewer-catchment layer used by Dansk spildevandskort.

The browser-facing layer keeps the existing four gzip chunk filenames, but the
geometry is rebuilt from the current Plandata WFS source. Included current sewer
types are 1, 2, 3, 4 and 6. Type 5 (Ukloakeret) and explicitly private
catchments (ejerkode=2) are excluded.

Features are dissolved by municipality + legacy map brand + current sewer type.
This preserves the existing map interaction model while covering the complete
current sewered footprint and keeping the payload practical for mobile browsers.
"""
from __future__ import annotations

import gzip
import json
import time
from collections import Counter, defaultdict
from pathlib import Path

import requests
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
MAP_DIR = ROOT / "labs" / "spildevandskort"
DATA_DIR = MAP_DIR / "data"
WFS_URL = "https://geoserver.plandata.dk/geoserver/wfs"
TYPE_NAME = "pdk:theme_pdk_kloakopland_vedtaget"
PAGE_SIZE = 5000
INCLUDED_CODES = {1, 2, 3, 4, 6}
PRIVATE_OWNER_CODE = 2
SIMPLIFY_TOLERANCE = 0.00002


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_old_features():
    out = []
    for i in range(1, 5):
        with gzip.open(DATA_DIR / f"spildevandsoplande-{i}.geojson.gz", "rt", encoding="utf-8") as fh:
            out.extend(json.load(fh).get("features", []))
    return out


def build_registry(old_features):
    by_code = {}
    local_brand = {}
    conflicts = defaultdict(set)
    for f in old_features:
        p = f.get("properties") or {}
        code = p.get("municipalityCode")
        bid = p.get("brandId")
        if code is None or not bid:
            continue
        code = int(code)
        conflicts[code].add(bid)
        by_code[code] = bid
        if p.get("localBrand"):
            local_brand[code] = p["localBrand"]
    ambiguous = {k: sorted(v) for k, v in conflicts.items() if len(v) > 1}
    if ambiguous:
        raise RuntimeError(f"Ambiguous municipality registry: {ambiguous}")
    if len(by_code) != 97:
        raise RuntimeError(f"Expected 97 Plandata municipalities, got {len(by_code)}")
    return by_code, local_brand


def fetch_all():
    session = requests.Session()
    session.headers.update({"Accept": "application/json", "User-Agent": "Dansk-spildevandskort-catchment-builder/2.0"})
    out = []
    expected = None
    start = 0
    while True:
        params = {
            "service": "WFS", "version": "2.0.0", "request": "GetFeature",
            "typeNames": TYPE_NAME, "outputFormat": "application/json",
            "srsName": "EPSG:4326", "count": PAGE_SIZE, "startIndex": start,
        }
        for attempt in range(4):
            try:
                r = session.get(WFS_URL, params=params, timeout=120)
                r.raise_for_status()
                data = r.json()
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        features = data.get("features", [])
        if expected is None:
            try: expected = int(data.get("numberMatched"))
            except (TypeError, ValueError): expected = None
        out.extend(features)
        print(f"Plandata {len(out)}" + (f" / {expected}" if expected else ""), flush=True)
        if not features or len(features) < PAGE_SIZE or (expected and len(out) >= expected):
            break
        start += len(features)
    return out, expected


def geom(raw):
    if not raw: return None
    g = shape(raw)
    if g.is_empty: return None
    if not g.is_valid: g = g.buffer(0)
    return None if g.is_empty else g


def mode(values):
    vals = [v for v in values if v not in (None, "")]
    return Counter(vals).most_common(1)[0][0] if vals else None


def write_gzip(path: Path, obj):
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with path.open("wb") as fh:
        with gzip.GzipFile(filename="", mode="wb", fileobj=fh, compresslevel=9, mtime=0) as gz:
            gz.write(raw)
    return len(raw), path.stat().st_size


def main():
    brands_doc = load_json(DATA_DIR / "brands.json")
    brands = {b["id"]: b for b in brands_doc["brands"]}
    old = load_old_features()
    municipality_to_brand, local_brands = build_registry(old)
    raw_features, expected = fetch_all()

    groups = defaultdict(lambda: {"geoms": [], "props": []})
    excluded_unsewered = excluded_private = invalid = missing_registry = 0

    for f in raw_features:
        p = f.get("properties") or {}
        try: sewer_code = int(p.get("nuvkode"))
        except (TypeError, ValueError): continue
        if sewer_code not in INCLUDED_CODES:
            if sewer_code == 5: excluded_unsewered += 1
            continue
        try: municipality_code = int(p.get("komnr"))
        except (TypeError, ValueError):
            missing_registry += 1; continue
        brand_id = municipality_to_brand.get(municipality_code)
        if not brand_id:
            missing_registry += 1; continue
        try: owner_code = int(p.get("ejerkode")) if p.get("ejerkode") is not None else None
        except (TypeError, ValueError): owner_code = None
        if owner_code == PRIVATE_OWNER_CODE:
            excluded_private += 1; continue
        g = geom(f.get("geometry"))
        if g is None:
            invalid += 1; continue
        bucket = groups[(municipality_code, brand_id, sewer_code)]
        bucket["geoms"].append(g)
        bucket["props"].append(p)

    if missing_registry:
        raise RuntimeError(f"Missing registry for {missing_registry} qualifying features")

    output = []
    for (municipality_code, brand_id, sewer_code), bucket in sorted(groups.items()):
        g = unary_union(bucket["geoms"])
        if not g.is_valid: g = g.buffer(0)
        g = g.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        if not g.is_valid: g = g.buffer(0)
        if g.is_empty: raise RuntimeError(f"Empty dissolved geometry {municipality_code}/{sewer_code}")
        props = bucket["props"]
        brand = brands.get(brand_id, {})
        municipality = mode([p.get("komnavn") for p in props]) or str(municipality_code)
        sewer_text = mode([p.get("nuvtekst") for p in props]) or f"Kloaktype {sewer_code}"
        owner_codes = sorted({p.get("ejerkode") for p in props if p.get("ejerkode") is not None})
        owner_texts = sorted({p.get("ejertekst") for p in props if p.get("ejertekst")})
        ownership = owner_texts[0] if len(owner_texts) == 1 else ("Blandede ejerforhold" if owner_texts else "Ikke angivet i kilden")
        updates = [str(p.get("datoopdt")) for p in props if p.get("datoopdt")]
        plan_numbers = sorted({str(p.get("plannr")) for p in props if p.get("plannr")})
        plan_ids = sorted({str(p.get("planid")) for p in props if p.get("planid")})
        doclinks = sorted({str(p.get("doklink")) for p in props if p.get("doklink")})
        weblinks = sorted({str(p.get("weblink")) for p in props if p.get("weblink")})
        output.append({
            "type": "Feature",
            "properties": {
                "brandId": brand_id,
                "brand": brand.get("name", brand_id),
                "brandName": brand.get("name", brand_id),
                "color": brand.get("color", "#657D84"),
                "localBrand": local_brands.get(municipality_code),
                "municipality": municipality.replace(" kommune", "").replace(" Kommune", ""),
                "municipalityCode": municipality_code,
                "sewerType": sewer_text,
                "displayType": sewer_text,
                "sewerTypeCode": sewer_code,
                "ownership": ownership,
                "ownerCodes": owner_codes,
                "sourceFeatureCount": len(props),
                "sourceUpdated": max(updates) if updates else None,
                "planStatus": "Vedtaget",
                "planTitle": plan_numbers[0] if len(plan_numbers) == 1 else (f"{len(plan_numbers)} vedtagne planoplande" if plan_numbers else "Vedtaget spildevandsplan"),
                "planNumbers": plan_numbers,
                "planIds": plan_ids,
                "documentLinks": doclinks[:8],
                "webLinks": weblinks[:8],
                "source": "Plandata.dk – vedtagne kloakoplande",
            },
            "geometry": mapping(g),
        })

    # Stable four-way split; app already loads these filenames in parallel.
    chunks = [[] for _ in range(4)]
    for i, feature in enumerate(output):
        chunks[i % 4].append(feature)
    sizes = []
    for i, features in enumerate(chunks, 1):
        sizes.append(write_gzip(DATA_DIR / f"spildevandsoplande-{i}.geojson.gz", {"type":"FeatureCollection","features":features}))

    meta = {
        "source": "Plandata.dk WFS – theme_pdk_kloakopland_vedtaget",
        "sourceUrl": WFS_URL,
        "numberMatched": expected,
        "rawFeatureCount": len(raw_features),
        "mapFeatureCount": len(output),
        "municipalityCount": len({f["properties"]["municipalityCode"] for f in output}),
        "includedCurrentSewerTypeCodes": sorted(INCLUDED_CODES),
        "excludedCurrentSewerTypeCodes": [5],
        "excludedUnseweredFeatureCount": excluded_unsewered,
        "excludedKnownPrivateFeatureCount": excluded_private,
        "invalidOrEmptyGeometryCount": invalid,
        "simplifyToleranceDegrees": SIMPLIFY_TOLERANCE,
        "chunkSizes": [{"uncompressedBytes": a, "compressedBytes": b} for a,b in sizes],
    }
    (DATA_DIR / "spildevandsoplande-meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))

    codes = {f["properties"]["sewerTypeCode"] for f in output}
    assert codes == INCLUDED_CODES, codes
    assert meta["municipalityCount"] == 97, meta["municipalityCount"]
    assert excluded_unsewered > 8000
    assert invalid == 0

if __name__ == "__main__":
    main()
