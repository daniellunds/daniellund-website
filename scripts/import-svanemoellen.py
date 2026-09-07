"""Refresh HOFOR's public map geometry. Requires pyproj; no service URLs or credentials are persisted."""
import datetime
import json
from pathlib import Path
from urllib.request import urlopen
from pyproj import Transformer

CONFIG = 'https://www.hofor.dk/septima/map_svanemoellen_skybrudstunnel/map_sst.json'
SOURCE = 'https://www.hofor.dk/baeredygtige-byer/udviklingsprojekter/skybrudssikring/svanemoelle-skybrudstunnel/'
LAYERS = {'tunnel_samlet': 'Boret tunnelstrækning', 'gravet_ledning': 'Gravet tunnelstrækning', 'toemmeledning': 'Rør til renseanlæg', 'byggeplads_skakt': 'Byggeplads med skakt'}
transform = Transformer.from_crs('EPSG:25832', 'EPSG:4326', always_xy=True)

def coordinates(value):
    if isinstance(value[0], (int, float)):
        lon, lat = transform.transform(value[0], value[1])
        assert 12.4 < lon < 12.7 and 55.65 < lat < 55.8
        return [round(lon, 7), round(lat, 7)]
    return [coordinates(v) for v in value]

def main():
    with urlopen(CONFIG, timeout=30) as response:
        config = json.load(response)
    features = []
    counts = {}
    for layer in config['map']['layer']:
        key = layer['id']
        if key not in LAYERS:
            continue
        with urlopen(layer['features_host'], timeout=30) as response:
            raw = json.load(response)
        assert raw['crs']['properties']['name'] == 'urn:ogc:def:crs:EPSG::25832'
        counts[key] = len(raw['features'])
        for item in raw['features']:
            geometry = item['geometry']
            if geometry['type'] == 'GeometryCollection':
                assert all(g['type'] == 'LineString' for g in geometry['geometries'])
                geometry = {'type': 'MultiLineString', 'coordinates': [g['coordinates'] for g in geometry['geometries']]}
            assert geometry['type'] in ('Point', 'LineString', 'MultiLineString')
            props = item.get('properties', {})
            features.append({'type': 'Feature', 'id': key + ':' + str(item['featureId']),
                'properties': {'component': key, 'label': props.get('SkaktNavn') or LAYERS[key]},
                'geometry': {'type': geometry['type'], 'coordinates': coordinates(geometry['coordinates'])}})
    assert set(counts) == set(LAYERS) and all(counts.values())
    output = {'type': 'FeatureCollection', 'metadata': {'projectKey': 'svanemoellen',
        'sourceUrl': SOURCE, 'mapConfigUrl': CONFIG, 'retrievedAt': datetime.date.today().isoformat(),
        'sourceCrs': 'EPSG:25832', 'outputCrs': 'EPSG:4326', 'counts': counts,
        'note': 'HOFORs offentlige projektkort. Viser offentliggjort tracé og byggepladser, ikke en landmåling eller driftsstatus.'},
        'features': features}
    target = Path(__file__).resolve().parents[1] / 'labs/spildevandskort/data/svanemoellen.geojson'
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('Imported public map geometry:', counts)

if __name__ == '__main__':
    main()
