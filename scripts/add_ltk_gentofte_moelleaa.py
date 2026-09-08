import io
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

from pypdf import PdfReader

ROOT = Path("labs/spildevandskort")
RELATION_PATH = ROOT / "data/wwtp-catchment-relations.json"
UI_PATH = ROOT / "wwtp-catchments.js"
QA_PATH = Path("scripts/qa_wwtp_catchment_pilot.py")

LTK_URL = "https://www.ltk.dk/media/5zzf1jim/kf-spildevandsplan-2014-2018-vers-10-2-2021.pdf"
GENTOFTE_URL = "https://spildevandsplan.gentofte.dk/media/za2ntrde/bilag-1-oplandsoversigt-tlg.pdf"
PLANDATA_WFS = "https://geoserver.plandata.dk/geoserver/wfs"


def fetch_bytes(url, timeout=120):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "daniellund-spildevandskort-builder/1.0"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def keynorm(value):
    return re.sub(r"[^a-z0-9æøå]", "", str(value or "").lower())


def pick(properties, candidates):
    normalized = {keynorm(key): value for key, value in properties.items()}
    for candidate in candidates:
        key = keynorm(candidate)
        if key in normalized:
            return normalized[key]
    return None


def current_ltk_rows():
    start = 0
    rows = []
    while True:
        query = urllib.parse.urlencode(
            {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": "pdk:theme_pdk_kloakopland_vedtaget",
                "outputFormat": "application/json",
                "srsName": "EPSG:4326",
                "count": 5000,
                "startIndex": start,
            }
        )
        data = json.loads(fetch_bytes(f"{PLANDATA_WFS}?{query}").decode("utf-8"))
        features = data.get("features", [])
        for feature in features:
            properties = feature.get("properties") or {}
            municipality = pick(
                properties,
                ["kommunekode", "kommune_kode", "komnr", "komkode", "kommunenr", "kommuneid"],
            )
            try:
                municipality = int(float(municipality))
            except (TypeError, ValueError):
                continue
            if municipality != 173:
                continue
            plan_number = str(
                pick(properties, ["plannr", "plannummer", "plan_nr", "oplandnr", "oplandnummer"])
                or ""
            ).strip()
            sewer_code = pick(
                properties,
                ["nuvkode", "nuv_kode", "kloaktype", "kloak_type", "sewertype", "kloaktypekode"],
            )
            try:
                sewer_code = int(float(sewer_code))
            except (TypeError, ValueError):
                sewer_code = None
            rows.append((plan_number, sewer_code))
        if len(features) < 5000:
            break
        start += len(features)
    return rows


def source_backed_ltk_mv_codes():
    reader = PdfReader(io.BytesIO(fetch_bytes(LTK_URL)))
    # Bilag 7, the catchment table, is in this range in the published PDF.
    text = "\n".join((page.extract_text() or "") for page in reader.pages[76:87])
    mv_codes = {
        match.group(1).upper()
        for match in re.finditer(
            r"(?<![A-Za-z0-9._-])([A-ZÆØÅ]{1,4}[A-ZÆØÅ0-9._-]*\d[A-ZÆØÅ0-9._-]*)\s+MV\b",
            text,
            re.I,
        )
    }
    rows = current_ltk_rows()
    matched = sorted(
        {
            plan_number
            for plan_number, sewer_code in rows
            if plan_number.upper() in mv_codes and sewer_code not in (4, 5)
        }
    )
    excluded = {
        plan_number
        for plan_number, sewer_code in rows
        if plan_number.upper() in mv_codes and sewer_code in (4, 5)
    }
    current_codes = {plan_number.upper() for plan_number, _ in rows}
    missing = sorted(mv_codes - current_codes)

    assert len(mv_codes) == 270, len(mv_codes)
    assert len(matched) == 267, len(matched)
    assert not excluded, excluded
    assert missing == ["LY73", "RÅ01", "RÅ02"], missing
    assert {"TA22", "TA25"}.issubset(set(matched)), matched
    return matched


def update_relations(matches):
    data = json.loads(RELATION_PATH.read_text(encoding="utf-8"))
    data["version"] = 9
    data["scope"] = (
        "Pilot: source-backed wastewater catchments for Lynetten, Damhusåen and Mølleåværket "
        "across Copenhagen, Gentofte, Frederiksberg, Herlev, Rødovre, Lyngby-Taarbæk and Gladsaxe"
    )
    plants = {plant["plantKey"]: plant for plant in data["plants"]}
    plant = plants["moelleaavaerket"]

    def relation_municipality(relation):
        return int(relation.get("municipalityCode", plant.get("municipalityCode", -1)))

    # Idempotent replacement of this expansion's source-backed relations.
    plant["relations"] = [
        relation
        for relation in plant["relations"]
        if not (
            relation_municipality(relation) == 173
            and "Bilag 7 kloakoplandsskema" in relation.get("sourceLabel", "")
        )
        and not (
            relation_municipality(relation) == 157
            and "Sandtoft" in relation.get("sourceLabel", "")
        )
    ]
    plant["relations"].append(
        {
            "municipalityCode": 173,
            "planNumbers": matches,
            "sourceUrl": LTK_URL,
            "sourceLabel": (
                "Lyngby-Taarbæk Kommune – Spildevandsplan 2014-2018, "
                "Bilag 7 kloakoplandsskema (MV = Mølleåværket)"
            ),
        }
    )
    plant["relations"].append(
        {
            "municipalityCode": 157,
            "planNumbers": ["Sandtoften"],
            "sourceUrl": GENTOFTE_URL,
            "sourceLabel": "Gentofte Kommune – Bilag 1, Sandtoftens opland → Mølleåværket",
        }
    )
    RELATION_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def update_ui():
    source = UI_PATH.read_text(encoding="utf-8")
    if "planNumberPreview" not in source:
        source = source.replace(
            "    const municipalityCount=unique(features.map(f=>f.properties?.municipalityCode)).length;",
            "    const planNumberPreview=planNumbers.length>24?`${planNumbers.slice(0,24).join(', ')} · +${planNumbers.length-24} flere`:planNumbers.join(', ');\n"
            "    const municipalityCount=unique(features.map(f=>f.properties?.municipalityCode)).length;",
        )
        source = source.replace(
            "${esc(planNumbers.join(', '))}",
            "${esc(planNumberPreview)}",
        )
    UI_PATH.write_text(source, encoding="utf-8")


def update_qa():
    source = QA_PATH.read_text(encoding="utf-8")
    if "relations=json.loads((ROOT/'wwtp-catchment-relations.json')" not in source:
        source = source.replace(
            "meta=json.loads((ROOT/'wwtp-catchment-pilot-meta.json').read_text(encoding='utf-8'))",
            "meta=json.loads((ROOT/'wwtp-catchment-pilot-meta.json').read_text(encoding='utf-8'))\n"
            "relations=json.loads((ROOT/'wwtp-catchment-relations.json').read_text(encoding='utf-8'))",
        )
    source = source.replace(
        "assert len(features)>=145,len(features)",
        "assert len(features)>=413,len(features)",
    )
    if "assert plans(rows(157,'moelleaavaerket'))=={'SANDTOFTEN'}" not in source:
        source = source.replace(
            "assert gentofte_expected.issubset(plans(gentofte))",
            "assert gentofte_expected.issubset(plans(gentofte))\n"
            "assert plans(rows(157,'moelleaavaerket'))=={'SANDTOFTEN'}",
        )

    start_marker = "# Lyngby-Taarbæk documented LR catchments -> Lynetten."
    end_marker = "# Gladsaxe: all 18 current Plandata catchments have source-backed receiving plants."
    start = source.index(start_marker)
    end = source.index(end_marker)
    replacement = """# Lyngby-Taarbæk documented LR catchments -> Lynetten.
ltk_expected={'ER01','ER02','ER03','ER04','NY02','TA01','TA02','TA03','TA04','TA05','TA06','TA07','TA08','TA09','TA10','TA11','TA12','TA13','TA14','TA15','TA16','TA17','TA18','TA19','TA20','TA21','TA23','TA24','TA26'}
ltk_lyn=rows(173,'lynetten')
assert len(ltk_lyn)==29,len(ltk_lyn)
assert plans(ltk_lyn)==ltk_expected
assert not {'TA22','TA25'}.intersection(plans(ltk_lyn))

# Lyngby-Taarbæk Bilag 7 rows marked MV -> Mølleåværket.
mol_rel=next(p for p in relations['plants'] if p['plantKey']=='moelleaavaerket')
ltk_mv_rel=set()
for rel in mol_rel['relations']:
    if int(rel.get('municipalityCode',mol_rel.get('municipalityCode',-1)))==173:
        ltk_mv_rel.update(''.join(str(pn).split()).upper() for pn in rel.get('planNumbers',[]))
ltk_mv=rows(173,'moelleaavaerket')
assert len(ltk_mv_rel)==267,len(ltk_mv_rel)
assert len(ltk_mv)==267,len(ltk_mv)
assert plans(ltk_mv)==ltk_mv_rel
assert {'TA22','TA25'}.issubset(plans(ltk_mv))
assert not plans(ltk_lyn).intersection(plans(ltk_mv))

"""
    source = source[:start] + replacement + source[end:]
    QA_PATH.write_text(source, encoding="utf-8")


def main():
    matches = source_backed_ltk_mv_codes()
    update_relations(matches)
    update_ui()
    update_qa()
    print("MØLLEÅVÆRKET_EXPANSION_READY", {"ltk": len(matches), "gentofte": 1})


if __name__ == "__main__":
    main()
