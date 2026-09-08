import json, re, urllib.parse, urllib.request
from collections import defaultdict
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT=Path('labs/spildevandskort/data')
RELATIONS=ROOT/'wwtp-catchment-relations.json'
MAIN_PULS_IDS={
    'lynetten':'Renseanlaeg.8793f333-ad28-446d-8d0e-c9c854ca4a6d',
    'damhusaen':'Renseanlaeg.87c30072-633c-440b-b3a1-1b0f529acf6f',
    'moelleaavaerket':'Renseanlaeg.44f9a35f-2848-47f1-a82f-bdc2da36947c',
}

def norm(v):
    return re.sub(r'\s+','',str(v or '')).upper()

def keynorm(v):
    return re.sub(r'[^a-z0-9æøå]','',str(v or '').lower())

def pick(props,candidates):
    by={keynorm(k):v for k,v in props.items()}
    for c in candidates:
        if keynorm(c) in by:
            return by[keynorm(c)]
    return None

def get_json(url,timeout=90):
    req=urllib.request.Request(url,headers={'User-Agent':'daniellund-spildevandskort-builder/1.0'})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.load(r)

def main():
    relations=json.loads(RELATIONS.read_text(encoding='utf-8'))
    wanted={}
    relation_sources={}
    requested_relations=defaultdict(set)
    for plant in relations['plants']:
        pkey=plant['plantKey']
        default_mcode=plant.get('municipalityCode')
        for rel in plant['relations']:
            mcode=int(rel.get('municipalityCode',default_mcode))
            for pn in rel['planNumbers']:
                n=norm(pn)
                wanted[(mcode,n)]=pkey
                requested_relations[pkey].add((mcode,n))
                relation_sources.setdefault((pkey,mcode,n),[]).append({'label':rel['sourceLabel'],'url':rel['sourceUrl']})

    base='https://geoserver.plandata.dk/geoserver/wfs'
    page_size=5000
    start=0
    raw_count=0
    groups=defaultdict(list)
    sewer_codes=defaultdict(set)
    element_ids=defaultdict(list)
    matched_raw=0
    excluded_rainwater_only=0
    excluded_unsewered=0
    while True:
        qs=urllib.parse.urlencode({
            'service':'WFS','version':'2.0.0','request':'GetFeature',
            'typeNames':'pdk:theme_pdk_kloakopland_vedtaget',
            'outputFormat':'application/json','srsName':'EPSG:4326',
            'count':page_size,'startIndex':start
        })
        data=get_json(base+'?'+qs)
        feats=data.get('features',[])
        for f in feats:
            raw_count+=1
            p=f.get('properties') or {}
            pn=pick(p,['plannr','plannummer','plan_nr','oplandnr','oplandnummer'])
            if pn is None:
                continue
            mcode=pick(p,['kommunekode','kommune_kode','komnr','komkode','kommunenr','kommuneid'])
            try:
                mcode=int(float(mcode))
            except Exception:
                mcode=None
            pkey=wanted.get((mcode,norm(pn)))
            if not pkey:
                continue
            sewer=pick(p,['nuvkode','nuv_kode','kloaktype','kloak_type','sewertype','kloaktypekode'])
            try:
                sewer_i=int(float(sewer))
            except Exception:
                sewer_i=None
            if sewer_i==4:
                excluded_rainwater_only+=1
                continue
            if sewer_i==5:
                excluded_unsewered+=1
                continue
            try:
                geom=shape(f.get('geometry'))
                if geom.is_empty:
                    continue
                if not geom.is_valid:
                    geom=geom.buffer(0)
                geom=geom.simplify(0.00001,preserve_topology=True)
                if geom.is_empty:
                    continue
            except Exception as e:
                print('GEOMETRY_SKIP',f.get('id'),e)
                continue
            gkey=(pkey,mcode,norm(pn))
            groups[gkey].append(geom)
            sewer_codes[gkey].add(sewer_i)
            eid=pick(p,['elementid','element_id','id']) or f.get('id')
            if eid is not None:
                element_ids[gkey].append(str(eid))
            matched_raw+=1
        print('PLANDATA_PAGE',start,len(feats),'raw',raw_count,'matched',matched_raw)
        if len(feats)<page_size:
            break
        start+=len(feats)
        if start>100000:
            raise RuntimeError('Unexpected Plandata pagination')

    if not groups:
        raise RuntimeError('No WWTP catchment relations matched Plandata')

    plant_by_key={p['plantKey']:p for p in relations['plants']}
    features=[]
    found_relations=defaultdict(set)
    for (pkey,mcode,pn),geoms in sorted(groups.items()):
        merged=unary_union(geoms)
        if not merged.is_valid:
            merged=merged.buffer(0)
        found_relations[pkey].add((mcode,pn))
        features.append({
            'type':'Feature',
            'properties':{
                'plantKey':pkey,
                'plantName':plant_by_key[pkey]['plantName'],
                'municipalityCode':mcode,
                'planNumber':pn,
                'sourceFeatureCount':len(geoms),
                'sewerTypeCodes':sorted(x for x in sewer_codes[(pkey,mcode,pn)] if x is not None),
                'elementIds':element_ids[(pkey,mcode,pn)][:100],
                'sources':relation_sources.get((pkey,mcode,pn),[]),
                'coverageStatus':'documented-pilot'
            },
            'geometry':mapping(merged)
        })

    meta={
        'version':3,
        'coverageStatus':'partial-documented-pilot',
        'source':'Plandata.dk vedtagne kloakoplande + source-backed municipal wastewater plans',
        'rawPlandataFeaturesScanned':raw_count,
        'matchedRawFeatures':matched_raw,
        'mapFeatureCount':len(features),
        'excludedRainwaterOnlyMatches':excluded_rainwater_only,
        'excludedUnseweredMatches':excluded_unsewered,
        'plants':{}
    }
    for pkey,plant in plant_by_key.items():
        req=sorted(requested_relations[pkey])
        got=sorted(found_relations[pkey])
        missing=sorted(set(req)-set(got))
        puls_id=MAIN_PULS_IDS.get(pkey)
        meta['plants'][pkey]={
            'plantName':plant['plantName'],
            'requestedPlanNumbers':sorted({n for _,n in req}),
            'matchedPlanNumbers':sorted({n for _,n in got}),
            'missingPlanNumbers':sorted({n for _,n in missing}),
            'requestedRelations':[{'municipalityCode':mc,'planNumber':pn} for mc,pn in req],
            'matchedRelations':[{'municipalityCode':mc,'planNumber':pn} for mc,pn in got],
            'missingRelations':[{'municipalityCode':mc,'planNumber':pn} for mc,pn in missing],
            'puls':{'id':puls_id,'name':plant['plantName'],'featureId':puls_id} if puls_id else None,
            'isCompleteCatchment':False
        }

    (ROOT/'wwtp-catchment-pilot.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (ROOT/'wwtp-catchment-pilot-meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
    print('WWTP_PILOT_BUILT',json.dumps(meta,ensure_ascii=False))

if __name__=='__main__':
    main()
