#!/usr/bin/env python3
"""Build current sewered service-area geometry for Dansk spildevandskort.

Authoritative geometry basis: Plandata.dk WFS, adopted sewer catchments.
Current service footprint includes current sewer types 1,2,3,4,6 and excludes
current type 5 (Ukloakeret). Known private catchments (ejerkode=2) are excluded.
Where ownership is not yet populated in Plandata, geometry is retained and
explicitly counted as ownership-unknown instead of being guessed away.

The existing static catchment chunks are used only as a stable municipality ->
legacy brand mapping. current-operators.js is then used to merge legacy IDs that
belong to the same current operator.
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import time
from collections import defaultdict
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
CURRENT_SEWER_CODES = {1, 2, 3, 4, 6}
PRIVATE_OWNER_CODE = 2
SIMPLIFY_TOLERANCE = 0.00008  # ca. 5–9 m in Denmark; topology preserved


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_static_catchments():
    features = []
    for i in range(1, 5):
        path = DATA_DIR / f"spildevandsoplande-{i}.geojson.gz"
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            features.extend(json.load(fh).get("features", []))
    return features


def build_municipality_brand_map(static_features):
    by_code = {}
    conflicts = defaultdict(set)
    for feature in static_features:
        p = feature.get("properties") or {}
        code = p.get("municipalityCode")
        brand_id = p.get("brandId")
        if code is None or not brand_id:
            continue
        code = int(code)
        conflicts[code].add(brand_id)
        by_code[code] = brand_id
    ambiguous = {k: sorted(v) for k, v in conflicts.items() if len(v) > 1}
    if ambiguous:
        raise RuntimeError(f"Ambiguous municipality -> brand mappings: {ambiguous}")
    if len(by_code) != 97:
        raise RuntimeError(f"Expected 97 Plandata municipalities in static mapping, got {len(by_code)}")
    return by_code


def parse_current_operator_map():
    text = (MAP_DIR / "current-operators.js").read_text(encoding="utf-8")
    pairs = re.findall(r'\["([^"]+)",\{\s*operatorBrandId:"([^"]+)"', text)
    return dict(pairs)


def fetch_wfs_features():
    session = requests.Session()
    session.headers.update({"Accept": "application/json", "User-Agent": "Dansk-spildevandskort-boundary-builder/1.0"})
    all_features = []
    start = 0
    expected = None
    while True:
        params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": TYPE_NAME,
            "outputFormat": "application/json",
            "srsName": "EPSG:4326",
            "count": str(PAGE_SIZE),
            "startIndex": str(start),
        }
        last_error = None
        for attempt in range(4):
            try:
                response = session.get(WFS_URL, params=params, timeout=120)
                response.raise_for_status()
                data = response.json()
                break
            except Exception as exc:
                last_error = exc
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        else:
            raise last_error  # pragma: no cover

        features = data.get("features", [])
        if expected is None:
            try:
                expected = int(data.get("numberMatched"))
            except (TypeError, ValueError):
                expected = None
        all_features.extend(features)
        print(f"Plandata: {len(all_features)}" + (f" / {expected}" if expected is not None else ""), flush=True)
        if not features or len(features) < PAGE_SIZE or (expected is not None and len(all_features) >= expected):
            break
        start += len(features)
    return all_features, expected


def clean_geometry(raw_geometry):
    if not raw_geometry:
        return None
    geom = shape(raw_geometry)
    if geom.is_empty:
        return None
    if not geom.is_valid:
        geom = geom.buffer(0)
    if geom.is_empty:
        return None
    return geom


def main():
    brands_doc = load_json(DATA_DIR / "brands.json")
    brands = {b["id"]: b for b in brands_doc["brands"]}
    static_features = load_static_catchments()
    municipality_to_legacy = build_municipality_brand_map(static_features)
    current_operator_map = parse_current_operator_map()

    raw_features, number_matched = fetch_wfs_features()
    groups = defaultdict(list)
    stats = defaultdict(lambda: {
        "sourceFeatureCount": 0,
        "knownPublicCount": 0,
        "knownMixedCount": 0,
        "unknownOwnershipCount": 0,
        "knownPrivateExcludedCount": 0,
        "municipalities": set(),
        "legacyBrandIds": set(),
        "sewerTypeCodes": set(),
        "latestSourceUpdate": None,
    })
    excluded_unsewered = 0
    excluded_private = 0
    missing_mapping = defaultdict(int)
    invalid_or_empty = 0

    for feature in raw_features:
        p = feature.get("properties") or {}
        try:
            sewer_code = int(p.get("nuvkode"))
        except (TypeError, ValueError):
            continue
        if sewer_code not in CURRENT_SEWER_CODES:
            if sewer_code == 5:
                excluded_unsewered += 1
            continue

        municipality_code = p.get("komnr")
        try:
            municipality_code = int(municipality_code)
        except (TypeError, ValueError):
            missing_mapping[str(municipality_code)] += 1
            continue
        legacy_brand_id = municipality_to_legacy.get(municipality_code)
        if not legacy_brand_id:
            missing_mapping[str(municipality_code)] += 1
            continue
        operator_id = current_operator_map.get(legacy_brand_id, legacy_brand_id)

        owner_code = p.get("ejerkode")
        try:
            owner_code = int(owner_code) if owner_code is not None else None
        except (TypeError, ValueError):
            owner_code = None
        if owner_code == PRIVATE_OWNER_CODE:
            excluded_private += 1
            stats[operator_id]["knownPrivateExcludedCount"] += 1
            continue

        geom = clean_geometry(feature.get("geometry"))
        if geom is None:
            invalid_or_empty += 1
            continue
        groups[operator_id].append(geom)
        s = stats[operator_id]
        s["sourceFeatureCount"] += 1
        if owner_code == 1:
            s["knownPublicCount"] += 1
        elif owner_code == 3:
            s["knownMixedCount"] += 1
        else:
            s["unknownOwnershipCount"] += 1
        s["municipalities"].add((municipality_code, p.get("komnavn") or str(municipality_code)))
        s["legacyBrandIds"].add(legacy_brand_id)
        s["sewerTypeCodes"].add(sewer_code)
        updated = p.get("datoopdt")
        if updated and (s["latestSourceUpdate"] is None or str(updated) > str(s["latestSourceUpdate"])):
            s["latestSourceUpdate"] = updated

    if missing_mapping:
        raise RuntimeError(f"Missing municipality mappings for qualifying features: {dict(missing_mapping)}")

    output_features = []
    for operator_id in sorted(groups):
        print(f"Union {operator_id}: {len(groups[operator_id])} source polygons", flush=True)
        geom = unary_union(groups[operator_id])
        if not geom.is_valid:
            geom = geom.buffer(0)
        geom = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            raise RuntimeError(f"Empty union for {operator_id}")

        s = stats[operator_id]
        brand = brands.get(operator_id) or brands.get(next(iter(s["legacyBrandIds"]))) or {}
        municipalities = [name for _, name in sorted(s["municipalities"])]
        ownership_note = (
            "Plandata-ejerforhold er endnu ikke udfyldt landsdækkende; kendte private kloakoplande er ekskluderet, øvrige ukendte er medtaget."
            if s["unknownOwnershipCount"]
            else "Kendte private kloakoplande er ekskluderet."
        )
        output_features.append({
            "type": "Feature",
            "properties": {
                "operatorBrandId": operator_id,
                "operatorName": brand.get("name", operator_id),
                "legacyBrandIds": sorted(s["legacyBrandIds"]),
                "municipalities": municipalities,
                "sourceFeatureCount": s["sourceFeatureCount"],
                "sewerTypeCodes": sorted(s["sewerTypeCodes"]),
                "knownPublicCount": s["knownPublicCount"],
                "knownMixedCount": s["knownMixedCount"],
                "unknownOwnershipCount": s["unknownOwnershipCount"],
                "knownPrivateExcludedCount": s["knownPrivateExcludedCount"],
                "latestSourceUpdate": s["latestSourceUpdate"],
                "boundaryBasis": "Plandata vedtagne kloakoplande; eksisterende kloaktype 1,2,3,4,6; type 5 (ukloakeret) ekskluderet",
                "ownershipNote": ownership_note,
            },
            "geometry": mapping(geom),
        })

    collection = {
        "type": "FeatureCollection",
        "name": "current_sewered_service_areas",
        "features": output_features,
    }
    raw = json.dumps(collection, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    out_path = DATA_DIR / "service-areas.geojson.gz"
    with out_path.open("wb") as fh:
        with gzip.GzipFile(filename="", mode="wb", fileobj=fh, compresslevel=9, mtime=0) as gz:
            gz.write(raw)

    meta = {
        "source": "Plandata.dk WFS – theme_pdk_kloakopland_vedtaget",
        "sourceUrl": WFS_URL,
        "numberMatched": number_matched,
        "rawFeatureCount": len(raw_features),
        "serviceAreaFeatureCount": len(output_features),
        "includedCurrentSewerTypeCodes": sorted(CURRENT_SEWER_CODES),
        "excludedCurrentSewerTypeCodes": [5],
        "excludedUnseweredFeatureCount": excluded_unsewered,
        "excludedKnownPrivateFeatureCount": excluded_private,
        "invalidOrEmptyGeometryCount": invalid_or_empty,
        "ownershipPolicy": "Known private (ejerkode=2) excluded; public (1), mixed (3), and ownership-unknown included. Ownership is not yet populated nationwide in Plandata.",
        "mappingPolicy": "Municipality-to-utility mapping inherited from the source-audited map registry; legacy IDs merged through current-operators.js where the current operator changed.",
        "simplifyToleranceDegrees": SIMPLIFY_TOLERANCE,
        "uncompressedBytes": len(raw),
        "compressedBytes": out_path.stat().st_size,
    }
    (DATA_DIR / "service-areas-meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(meta, ensure_ascii=False, indent=2))
    if len(output_features) < 60 or len(output_features) > 80:
        raise RuntimeError(f"Unexpected service-area feature count: {len(output_features)}")
    if invalid_or_empty:
        print(f"WARNING: {invalid_or_empty} invalid/empty qualifying geometries omitted", file=sys.stderr)


if __name__ == "__main__":
    main()
