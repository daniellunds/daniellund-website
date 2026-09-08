import json, urllib.request
from pathlib import Path

URL='https://api.dataforsyningen.dk/kommuner?format=geojson&udenforkommuneinddeling=false'
OUT=Path('labs/spildevandskort/data/municipalities.geojson')
req=urllib.request.Request(URL,headers={'User-Agent':'daniellund-spildevandskort-cache/1.0'})
with urllib.request.urlopen(req,timeout=120) as r:
    raw=json.load(r)
if raw.get('type')=='FeatureCollection':
    features=raw.get('features') or []
elif isinstance(raw,list):
    features=[x for x in raw if x.get('type')=='Feature']
else:
    raise RuntimeError('Unexpected Dataforsyningen response')
if len(features)!=98:
    raise RuntimeError(f'Expected 98 municipalities, got {len(features)}')
clean=[]
for f in features:
    p=f.get('properties') or {}
    name=p.get('navn') or p.get('name') or p.get('NAVN')
    if not name:
        raise RuntimeError('Municipality without name')
    clean.append({
        'type':'Feature',
        'properties':{'navn':name,'kode':p.get('kode') or p.get('KODE')},
        'geometry':f.get('geometry')
    })
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps({'type':'FeatureCollection','features':clean},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('MUNICIPALITY_CACHE_OK',len(clean),OUT.stat().st_size)
