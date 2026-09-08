import io, json, re, urllib.parse, urllib.request
from pathlib import Path
from pypdf import PdfReader

REPO=Path('.')
REL=REPO/'labs/spildevandskort/data/wwtp-catchment-relations.json'
PLAN2017='https://spildevandsplan2017.rudersdal.dk/media/6/download?inline='
CURRENT2025='https://rudersdal.dk/media/3605/download?inline='
MUNICIPALITY=230

def get_bytes(url,timeout=90):
    req=urllib.request.Request(url,headers={'User-Agent':'daniellund-spildevandskort-rudersdal/1.0'})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return r.read()

def get_json(url,timeout=90):
    return json.loads(get_bytes(url,timeout).decode('utf-8'))

def keynorm(v):
    return re.sub(r'[^a-z0-9æøå]','',str(v or '').lower())

def pick(props,candidates):
    by={keynorm(k):v for k,v in props.items()}
    for c in candidates:
        k=keynorm(c)
        if k in by:return by[k]
    return None

def norm(v):
    return re.sub(r'\s+','',str(v or '')).upper()

# Read the 2017 *plan* table, not merely status. Select only pages explicitly headed Mølleåværket.
pdf=get_bytes(PLAN2017)
reader=PdfReader(io.BytesIO(pdf))
moelle_pages=[]
for i,page in enumerate(reader.pages):
    text=page.extract_text() or ''
    if re.search(r'Kloakerede\s+områder\s+til\s+renseanlæg\s*:\s*Mølleåværket\s+Renseanlæg',text,re.I):
        moelle_pages.append({'page':i+1,'text':text})
if not moelle_pages:
    raise RuntimeError('Could not identify Mølleåværket pages in official 2017 plan table')
moelle_text='\n'.join(x['text'] for x in moelle_pages)

# Scan current adopted Plandata catchments and retain current wastewater-carrying Rudersdal plan numbers.
base='https://geoserver.plandata.dk/geoserver/wfs'
current={}
start=0
while True:
    qs=urllib.parse.urlencode({'service':'WFS','version':'2.0.0','request':'GetFeature','typeNames':'pdk:theme_pdk_kloakopland_vedtaget','outputFormat':'application/json','srsName':'EPSG:4326','count':5000,'startIndex':start})
    data=get_json(base+'?'+qs)
    feats=data.get('features',[])
    for f in feats:
        p=f.get('properties') or {}
        mc=pick(p,['kommunekode','kommune_kode','komnr','komkode','kommunenr','kommuneid'])
        try:mc=int(float(mc))
        except:continue
        if mc!=MUNICIPALITY:continue
        pn=pick(p,['plannr','plannummer','plan_nr','oplandnr','oplandnummer'])
        if pn is None:continue
        sewer=pick(p,['nuvkode','nuv_kode','kloaktype','kloak_type','sewertype','kloaktypekode'])
        try:sewer=int(float(sewer))
        except:sewer=None
        n=norm(pn)
        current.setdefault(n,{'raw':str(pn).strip(),'codes':set()})['codes'].add(sewer)
    if len(feats)<5000:break
    start+=len(feats)

matched=[]
for n,info in current.items():
    if info['codes'] and all(c in (4,5) for c in info['codes'] if c is not None):
        continue
    raw=info['raw']
    # Exact token match against only Mølleåværket pages in the official planned-conditions table.
    pat=r'(?<![A-Za-z0-9.])'+re.escape(raw)+r'(?![A-Za-z0-9.])'
    if re.search(pat,moelle_text,re.I):
        matched.append(raw)
matched=sorted(set(matched),key=lambda x:(re.sub(r'\d','',x),[int(z) for z in re.findall(r'\d+',x)] or [0],x))
if len(matched)<250:
    raise RuntimeError(f'Unexpectedly low current Rudersdal/Mølleåværket match count: {len(matched)}')

# Update relation table with dual evidence: detailed planned catchment table + current 2025 continuity/current-plant source.
data=json.loads(REL.read_text(encoding='utf-8'))
plant=next(p for p in data['plants'] if p['plantKey']=='moelleaavaerket')
plant['relations']=[r for r in plant['relations'] if int(r.get('municipalityCode',plant.get('municipalityCode',-1)))!=MUNICIPALITY]
sources=[
    (PLAN2017,'Rudersdal Kommune – Spildevandsplan 2017, Deloplande plan: Mølleåværket Renseanlæg'),
    (CURRENT2025,'Rudersdal Kommune – Spildevandsplan 2025, aktuelt plangrundlag bygger på 2017 og fastholder Mølleåværket som renseanlæg for kommunen')
]
for url,label in sources:
    plant['relations'].append({'municipalityCode':MUNICIPALITY,'planNumbers':matched,'sourceUrl':url,'sourceLabel':label})
data['version']=max(int(data.get('version',0))+1,10)
if 'Rudersdal' not in data.get('scope',''):
    data['scope']=data.get('scope','').rstrip()+' and Rudersdal'
REL.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

out={
    'municipalityCode':MUNICIPALITY,
    'official2017PlanPages':[x['page'] for x in moelle_pages],
    'currentPlandataPlanNumberCount':len(current),
    'matchedCurrentWastewaterPlanNumbers':matched,
    'matchedCount':len(matched),
    'sources':[x[0] for x in sources],
    'method':'Exact current Plandata plannr matched to pages explicitly headed Mølleåværket Renseanlæg in Rudersdal 2017 planned-conditions table; current 2025 official planning material states Spildevandsplan 2025 builds on Spildevandsplan 2017 and continues routing Rudersdal wastewater to the same five treatment plants. Sewer-only filtering is re-applied by the main builder using current nuvkode.'
}
Path('.github/audits').mkdir(parents=True,exist_ok=True)
Path('.github/audits/rudersdal-moelleaa-match.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('RUDERSDAL_MOELLEAA_MATCH',len(matched),'PAGES',out['official2017PlanPages'])
