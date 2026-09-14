"""Build the reviewed Brøndby subset; never infer a complete Avedøre catchment.

Run from repository root with an optional downloaded WFS response as argv[1].
The explicit whitelist is reviewed against Brøndby's 2025 catchment table.
New source names require review before inclusion.
"""
import hashlib
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = Path('labs/spildevandskort/data')
NAMES = set('''Ragnesminde N|Ragnesminde S|Vesterled|Østbrovej|Vibeholm|Priorparken|BV Landsby|Stadion|Korsdalsvej|Prøvensvej|Nygårdsparken nord|Nygårdsparken syd|BØ Landsby fælles|BØ Landsby sep|Lindelund syd|Lindelund nord|Avedøre Havnevej|Baunedammen|Kolonihaver vest|Sdr. Ringvej nord|Sdr. Ringvej syd|Sydgårdsvej|Kolonihaver|Midlergårdsvej|Nybovej|Genbrug og VF|Brøndbyvester Boulevard|Stranden vest|Hyttebovej|Strandesplanaden V|Strandesplanden Ø|Stranden øst fælles|Stranden øst sep|Lundedammen|Dammene|Roskildevej vest|Roskildevej øst|Skovengen|Brøndby Havn|Strandparken'''.split('|'))
SOURCES = [
    {'label': 'Brøndby Spildevandsplan 2025 – Kloakering i Brøndby', 'url': 'https://brondby.viewer.dkplan.niras.dk/plan/95#/25478'},
    {'label': 'Brøndby Spildevandsplan 2025 – oplandsskema', 'url': 'https://brondby.viewer.dkplan.niras.dk/media/kuunoayo/kloakoplandsskema-spildevandsplan-2025.pdf'},
    {'label': 'Plandata.dk – vedtagne kloakoplande', 'url': 'https://geoserver.plandata.dk/geoserver/wfs'},
]
QUERY = 'https://geoserver.plandata.dk/geoserver/wfs?' + urllib.parse.urlencode({
    'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature',
    'typeNames': 'pdk:theme_pdk_kloakopland_vedtaget', 'outputFormat': 'application/json',
    'srsName': 'EPSG:4326', 'count': 1000, 'CQL_FILTER': 'komnr=153',
})


def main():
    raw = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(QUERY, timeout=60).read()
    data = json.loads(raw)
    assert len(data['features']) == int(data['numberMatched']), 'Incomplete WFS response'
    groups, excluded = {}, []
    for f in data['features']:
        p = f['properties']
        assert p['komnr'] == 153
        name = p['plannr']
        if name not in NAMES or p['nuvkode'] not in (1, 2, 3):
            excluded.append({'name': name, 'sewerTypeCode': p['nuvkode'], 'elementId': p['elementid']})
            continue
        g = shape(f['geometry'])
        assert g.is_valid and not g.is_empty, (name, 'Invalid source geometry')
        groups.setdefault(name, []).append(f)
    assert set(groups) == NAMES, 'Reviewed catchment missing from current source'
    features = []
    for name, rows in sorted(groups.items()):
        geom = unary_union([shape(f['geometry']) for f in rows])
        assert geom.is_valid and geom.geom_type in ('Polygon', 'MultiPolygon')
        features.append({'type': 'Feature', 'properties': {
            'plantKey': 'avedoere', 'plantName': 'Renseanlæg Avedøre',
            'municipalityCode': 153, 'municipality': 'Brøndby', 'planNumber': name,
            'sourceFeatureCount': len(rows), 'elementIds': [f['properties']['elementid'] for f in rows],
            'sewerTypeCodes': sorted({f['properties']['nuvkode'] for f in rows}),
            'sources': SOURCES, 'coverageStatus': 'documented-pilot',
        }, 'geometry': mapping(geom)})
    info = {
        'plantName': 'Renseanlæg Avedøre', 'isCompleteCatchment': False,
        'puls': {'id': 'Renseanlaeg.426fe009-d383-4e55-b365-9cd7dbe1abdb', 'name': 'Spildevandscenter Avedøre'},
        'requestedPlanNumbers': sorted(NAMES),
        'coverageNote': 'Viser 40 dokumenterede deloplande i Brøndby Kommune. Avedøres øvrige oplandskommuner er endnu ikke med. Motorvejsoplande, Lillegården og Kirkebjerg Nord afventer særskilt afklaring. Områder med samletank er udeladt.',
    }
    output = {'type': 'FeatureCollection', 'features': features, 'plants': {'avedoere': info},
        'audit': {'checkedAt': datetime.now(timezone.utc).isoformat(), 'sourceQuery': QUERY,
        'sourceSha256': hashlib.sha256(raw).hexdigest(), 'sourceFeatureCount': len(data['features']),
        'includedSourceFeatureCount': sum(len(rows) for rows in groups.values()), 'excluded': excluded,
        'method': 'Exact reviewed plan names + municipality 153 + current sewer codes 1/2/3. Geometry dissolved by name without simplification. Municipal plan establishes receiving plant; table establishes reviewed areas. No municipal boundary substitution.'}}
    (ROOT / 'avedoere-brondby-catchment.geojson').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('AVEDOERE_BRONDBY', len(features), 'catchments;', output['audit']['includedSourceFeatureCount'], 'source features;', len(excluded), 'excluded')


if __name__ == '__main__':
    main()
