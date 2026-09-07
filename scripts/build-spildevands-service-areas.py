#!/usr/bin/env python3
"""Build verified wastewater geographies for Dansk spildevandskort.

Authoritative geometry basis: Plandata.dk WFS, adopted sewer catchments.

Two products are generated from the same current source:
1. service-areas.geojson.gz: one dissolved current sewered footprint per current
   wastewater operator.
2. spildevandsoplande-1..4.geojson.gz: the detailed map layer, dissolved only by
   municipality + legacy map brand + current sewer type. This preserves the
   existing visual structure while adding sewer types 4 and 6 and excluding
   type 5 (Ukloakeret).

Known private catchments (ejerkode=2) are excluded. Ownership is not yet
populated nationwide in Plandata; unknown ownership is therefore retained and
reported rather than guessed away.
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
SERVICE_SIMPLIFY_TOLERANCE = 0.00008  # ca. 5–9 m in Denmark
CATCHMENT_SIMPLIFY_TOLERANCE = 0.00003  # ca. 2–3 m; preserve existing detail
SEWER_TYPE_LABELS = {
    1: "Fælleskloakeret",
    2: "Separatkloakeret",
    3: "Kun spildevand",
    4: "Kun overfladevand",
    6: "Andet",
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_gzip_json(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def write_gzip_json(path: Path, value):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with path.open("wb") as fh:
        with gzip.GzipFile(filename="", mode="wb", fileobj=fh, compresslevel=9, mtime=0) as gz:
            gz.write(raw)
    return len(raw), path.stat().st_size


def load_static_catchments():
    features = []
    for i in range(1, 5):
        features.extend(read_gzip_json(DATA_DIR / f"spildevandsoplande-{i}.geojson.gz").get("features", []))
    return features


def build_static_metadata(static_features):
    brand_by_code = {}
    display_name_by_code = {}
    local_brand_by_code = {}
    conflicts = defaultdict(set)
    local_conflicts = defaultdict(set)
    for feature in static_features:
        p = feature.get("properties") or {}
        code = p.get("municipalityCode")
        brand_id = p.get("brandId")
        if code is None or not brand_id:
            continue
        code = int(code)
        conflicts[code].add(brand_id)
        brand_by_code[code] = brand_id
        if p.get("municipality"):
            display_name_by_code[code] = p["municipality"]
        if p.get("localBrand"):
            local_conflicts[code].add(str(p["localBrand"]))
    ambiguous = {k: sorted(v) for k, v in conflicts.items() if len(v) > 1}
    if ambiguous:
        raise RuntimeError(f"Ambiguous municipality -> brand mappings: {ambiguous}")
    if len(brand_by_code) != 97:
        raise RuntimeError(f"Expected 97 Plandata municipalities in static mapping, got {len(brand_by_code)}")
    for code, values in local_conflicts.items():
        if len(values) == 1:
            local_brand_by_code[code] = next(iter(values))
    return brand_by_code, display_name_by_code, local_brand_by_code


def parse_current_operator_map():
    text = (MAP_DIR / "current-operators.js").read_text(encoding="utf-8")
    pairs = re.findall(r'\["([^"]+)",\{\s*operatorBrandId:"([^"]+)"', text)
    return dict(pairs)


def fetch_wfs_features():
    session = requests.Session()
    session.headers.update({"Accept": "application/json", "User-Agent": "Dansk-spildevandskort-boundary-builder/1.1"})
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


def simplify_valid(geom, tolerance):
    if not geom.is_valid:
        geom = geom.buffer(0)
    geom = geom.simplify(tolerance, preserve_topology=True)
    if not geom.is_valid:
        geom = geom.buffer(0)
    if geom.is_empty:
        return None
    return geom


def ownership_label(known_public, known_mixed, unknown):
    if unknown and not known_public and not known_mixed:
        return "Ikke angivet i kilden"
    if unknown:
        return "Ejerforhold delvist oplyst i kilden"
    if known_mixed:
        return "Delt offentligt/privat ejerskab"
    return "Ejet af offentligt forsyningsselskab"


def write_balanced_catchment_chunks(features, chunk_count=4):
    ordered = sorted(
        features,
        key=lambda f: (
            str(f["properties"].get("brandId", "")),
            int(f["properties"].get("municipalityCode", 0)),
            int(f["properties"].get("sewerTypeCode", 0)),
        ),
    )
    sizes = [len(json.dumps(f, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) for f in ordered]
    total = sum(sizes)
    target = max(1, total / chunk_count)
    chunks = [[]]
    running = 0
    for feature, size in zip(ordered, sizes):
        remaining_features = len(ordered) - sum(len(c) for c in chunks)
        remaining_chunks = chunk_count - len(chunks)
        if len(chunks) < chunk_count and chunks[-1] and running >= target and remaining_features >= remaining_chunks:
            chunks.append([])
            running = 0
        chunks[-1].append(feature)
        running += size
    while len(chunks) < chunk_count:
        chunks.append([])

    output = []
    for i, chunk in enumerate(chunks, 1):
        fc = {"type": "FeatureCollection", "name": f"spildevandsoplande_{i}", "features": chunk}
        raw_bytes, compressed_bytes = write_gzip_json(DATA_DIR / f"spildevandsoplande-{i}.geojson.gz", fc)
        output.append({"file": f"spildevandsoplande-{i}.geojson.gz", "features": len(chunk), "rawBytes": raw_bytes, "compressedBytes": compressed_bytes})
    return output


def main():
    brands_doc = load_json(DATA_DIR / "brands.json")
    brands = {b["id"]: b for b in brands_doc["brands"]}
    old_static_features = load_static_catchments()
    municipality_to_legacy, municipality_display, local_brand_by_code = build_static_metadata(old_static_features)
    current_operator_map = parse_current_operator_map()

    raw_features, number_matched = fetch_wfs_features()

    service_groups = defaultdict(list)
    service_stats = defaultdict(lambda: {
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
    detail_groups = defaultdict(list)
    detail_stats = defaultdict(lambda: {
        "sourceFeatureCount": 0,
        "knownPublicCount": 0,
        "knownMixedCount": 0,
        "unknownOwnershipCount": 0,
        "knownPrivateExcludedCount": 0,
        "latestSourceUpdate": None,
    })

    excluded_unsewered = 0
    excluded_private = 0
    qualifying_features = 0
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
            service_stats[operator_id]["knownPrivateExcludedCount"] += 1
            detail_stats[(legacy_brand_id, municipality_code, sewer_code)]["knownPrivateExcludedCount"] += 1
            continue

        geom = clean_geometry(feature.get("geometry"))
        if geom is None:
            invalid_or_empty += 1
            continue
        qualifying_features += 1

        service_groups[operator_id].append(geom)
        ss = service_stats[operator_id]
        ss["sourceFeatureCount"] += 1
        ss["municipalities"].add((municipality_code, municipality_display.get(municipality_code) or p.get("komnavn") or str(municipality_code)))
        ss["legacyBrandIds"].add(legacy_brand_id)
        ss["sewerTypeCodes"].add(sewer_code)

        detail_key = (legacy_brand_id, municipality_code, sewer_code)
        detail_groups[detail_key].append(geom)
        ds = detail_stats[detail_key]
        ds["sourceFeatureCount"] += 1

        for s in (ss, ds):
            if owner_code == 1:
                s["knownPublicCount"] += 1
            elif owner_code == 3:
                s["knownMixedCount"] += 1
            else:
                s["unknownOwnershipCount"] += 1
            updated = p.get("datoopdt")
            if updated and (s["latestSourceUpdate"] is None or str(updated) > str(s["latestSourceUpdate"])):
                s["latestSourceUpdate"] = updated

    if missing_mapping:
        raise RuntimeError(f"Missing municipality mappings for qualifying features: {dict(missing_mapping)}")

    service_features = []
    for operator_id in sorted(service_groups):
        print(f"Service union {operator_id}: {len(service_groups[operator_id])} source polygons", flush=True)
        geom = simplify_valid(unary_union(service_groups[operator_id]), SERVICE_SIMPLIFY_TOLERANCE)
        if geom is None:
            raise RuntimeError(f"Empty service-area union for {operator_id}")
        s = service_stats[operator_id]
        brand = brands.get(operator_id) or brands.get(next(iter(s["legacyBrandIds"]))) or {}
        service_features.append({
            "type": "Feature",
            "properties": {
                "operatorBrandId": operator_id,
                "operatorName": brand.get("name", operator_id),
                "legacyBrandIds": sorted(s["legacyBrandIds"]),
                "municipalities": [name for _, name in sorted(s["municipalities"])],
                "sourceFeatureCount": s["sourceFeatureCount"],
                "sewerTypeCodes": sorted(s["sewerTypeCodes"]),
                "knownPublicCount": s["knownPublicCount"],
                "knownMixedCount": s["knownMixedCount"],
                "unknownOwnershipCount": s["unknownOwnershipCount"],
                "knownPrivateExcludedCount": s["knownPrivateExcludedCount"],
                "latestSourceUpdate": s["latestSourceUpdate"],
                "boundaryBasis": "Plandata vedtagne kloakoplande; eksisterende kloaktype 1,2,3,4,6; type 5 (ukloakeret) ekskluderet",
                "ownershipNote": "Plandata-ejerforhold er endnu ikke udfyldt landsdækkende; kendte private kloakoplande er ekskluderet, øvrige ukendte er medtaget.",
            },
            "geometry": mapping(geom),
        })

    service_collection = {"type": "FeatureCollection", "name": "current_sewered_service_areas", "features": service_features}
    service_raw_bytes, service_compressed_bytes = write_gzip_json(DATA_DIR / "service-areas.geojson.gz", service_collection)

    detailed_features = []
    for legacy_brand_id, municipality_code, sewer_code in sorted(detail_groups):
        key = (legacy_brand_id, municipality_code, sewer_code)
        print(f"Catchment union {legacy_brand_id}/{municipality_code}/type-{sewer_code}: {len(detail_groups[key])}", flush=True)
        geom = simplify_valid(unary_union(detail_groups[key]), CATCHMENT_SIMPLIFY_TOLERANCE)
        if geom is None:
            raise RuntimeError(f"Empty detailed union for {key}")
        s = detail_stats[key]
        brand = brands.get(legacy_brand_id) or {}
        label = SEWER_TYPE_LABELS[sewer_code]
        detailed_features.append({
            "type": "Feature",
            "properties": {
                "brandName": brand.get("name", legacy_brand_id),
                "localBrand": local_brand_by_code.get(municipality_code),
                "color": brand.get("color", "#7f9ca4"),
                "municipality": municipality_display.get(municipality_code) or str(municipality_code),
                "sewerType": label,
                "displayType": label,
                "ownership": ownership_label(s["knownPublicCount"], s["knownMixedCount"], s["unknownOwnershipCount"]),
                "sourceUpdated": s["latestSourceUpdate"],
                "brandId": legacy_brand_id,
                "municipalityCode": municipality_code,
                "sewerTypeCode": sewer_code,
                "sourceFeatureCount": s["sourceFeatureCount"],
                "knownPublicCount": s["knownPublicCount"],
                "knownMixedCount": s["knownMixedCount"],
                "unknownOwnershipCount": s["unknownOwnershipCount"],
                "knownPrivateExcludedCount": s["knownPrivateExcludedCount"],
                "planStatus": "Vedtaget",
            },
            "geometry": mapping(geom),
        })

    chunk_meta = write_balanced_catchment_chunks(detailed_features, 4)
    sewer_type_feature_counts = {str(code): sum(1 for f in detailed_features if f["properties"]["sewerTypeCode"] == code) for code in sorted(CURRENT_SEWER_CODES)}
    sewer_type_source_counts = {str(code): sum(f["properties"]["sourceFeatureCount"] for f in detailed_features if f["properties"]["sewerTypeCode"] == code) for code in sorted(CURRENT_SEWER_CODES)}

    service_meta = {
        "source": "Plandata.dk WFS – theme_pdk_kloakopland_vedtaget",
        "sourceUrl": WFS_URL,
        "numberMatched": number_matched,
        "rawFeatureCount": len(raw_features),
        "qualifyingSeweredFeatureCount": qualifying_features,
        "serviceAreaFeatureCount": len(service_features),
        "includedCurrentSewerTypeCodes": sorted(CURRENT_SEWER_CODES),
        "excludedCurrentSewerTypeCodes": [5],
        "excludedUnseweredFeatureCount": excluded_unsewered,
        "excludedKnownPrivateFeatureCount": excluded_private,
        "invalidOrEmptyGeometryCount": invalid_or_empty,
        "ownershipPolicy": "Known private (ejerkode=2) excluded; public (1), mixed (3), and ownership-unknown included. Ownership is not yet populated nationwide in Plandata.",
        "mappingPolicy": "Municipality-to-utility mapping inherited from the source-audited map registry; legacy IDs merged through current-operators.js where the current operator changed.",
        "simplifyToleranceDegrees": SERVICE_SIMPLIFY_TOLERANCE,
        "uncompressedBytes": service_raw_bytes,
        "compressedBytes": service_compressed_bytes,
    }
    (DATA_DIR / "service-areas-meta.json").write_text(json.dumps(service_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    catchment_meta = {
        "source": "Plandata.dk WFS – theme_pdk_kloakopland_vedtaget",
        "sourceUrl": WFS_URL,
        "numberMatched": number_matched,
        "rawFeatureCount": len(raw_features),
        "qualifyingSeweredFeatureCount": qualifying_features,
        "detailedFeatureCount": len(detailed_features),
        "includedCurrentSewerTypeCodes": sorted(CURRENT_SEWER_CODES),
        "excludedCurrentSewerTypeCodes": [5],
        "excludedUnseweredFeatureCount": excluded_unsewered,
        "excludedKnownPrivateFeatureCount": excluded_private,
        "invalidOrEmptyGeometryCount": invalid_or_empty,
        "sewerTypeAggregateCounts": sewer_type_feature_counts,
        "sewerTypeSourceCounts": sewer_type_source_counts,
        "simplifyToleranceDegrees": CATCHMENT_SIMPLIFY_TOLERANCE,
        "chunks": chunk_meta,
        "visualPolicy": "Preserve existing municipality/type polygon presentation; add current types 4 and 6, exclude type 5 and known private areas.",
    }
    (DATA_DIR / "catchment-areas-meta.json").write_text(json.dumps(catchment_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"service": service_meta, "detailed": catchment_meta}, ensure_ascii=False, indent=2))
    if len(service_features) < 60 or len(service_features) > 80:
        raise RuntimeError(f"Unexpected service-area feature count: {len(service_features)}")
    if len(detailed_features) < 250 or len(detailed_features) > 500:
        raise RuntimeError(f"Unexpected detailed catchment aggregate count: {len(detailed_features)}")
    if not any(f["properties"]["sewerTypeCode"] == 4 for f in detailed_features):
        raise RuntimeError("No type-4 catchments generated")
    if not any(f["properties"]["sewerTypeCode"] == 6 for f in detailed_features):
        raise RuntimeError("No type-6 catchments generated")
    if any(f["properties"]["sewerTypeCode"] == 5 for f in detailed_features):
        raise RuntimeError("Type-5 catchment leaked into output")
    if invalid_or_empty:
        print(f"WARNING: {invalid_or_empty} invalid/empty qualifying geometries omitted", file=sys.stderr)


if __name__ == "__main__":
    main()
