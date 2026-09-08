import concurrent.futures, json, re, time
from collections import defaultdict
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

BASE='https://planer.kk.dk'
PROJECT_PREFIX='/spildevandsplan-2018/projekter/'
OUT=Path('labs/spildevandskort/data/kk-project-receiver-audit.json')
AUDIT=Path('labs/spildevandskort/data/lynetten-coverage-audit.json')
REL=Path('labs/spildevandskort/data/wwtp-catchment-relations.json')
UA='daniellund-spildevandskort-source-audit/1.0'

def norm(v): return re.sub(r'\s+','',str(v or '')).upper()

def get(url,timeout=30):
    r=requests.get(url,headers={'User-Agent':UA},timeout=timeout)
    r.raise_for_status(); return r

def sitemap_urls():
    urls=set()
    candidates=[BASE+'/sitemap.xml',BASE+'/sitemap_index.xml']
    seen=set()
    while candidates:
        u=candidates.pop(0)
        if u in seen: continue
        seen.add(u)
        try:r=get(u)
        except Exception:continue
        soup=BeautifulSoup(r.text,'xml')
        locs=[x.get_text(strip=True) for x in soup.find_all('loc')]
        for loc in locs:
            if loc.endswith('.xml') and urlparse(loc).netloc==urlparse(BASE).netloc:
                candidates.append(loc)
            elif PROJECT_PREFIX in urlparse(loc).path:
                urls.add(loc)
    return urls

def crawl_links():
    # Fallback if no sitemap: bounded same-site crawl under project prefix.
    start=[BASE+PROJECT_PREFIX,BASE+PROJECT_PREFIX+'byudvikling/',BASE+PROJECT_PREFIX+'afloebssystem/',BASE+PROJECT_PREFIX+'skybrudssikring/',BASE+PROJECT_PREFIX+'klimatilpasning-af-kloakken/']
    q=list(start); seen=set(); found=set()
    while q and len(seen)<1200:
        u=q.pop(0)
        if u in seen:continue
        seen.add(u)
        try:r=get(u,15)
        except Exception:continue
        soup=BeautifulSoup(r.text,'html.parser')
        for a in soup.find_all('a',href=True):
            v=urljoin(u,a['href']).split('#')[0].split('?')[0]
            p=urlparse(v)
            if p.netloc!=urlparse(BASE).netloc or not p.path.startswith(PROJECT_PREFIX):continue
            if p.path.lower().endswith(('.pdf','.jpg','.png','.zip')):continue
            found.add(v)
            if v not in seen and len(p.path.strip('/').split('/'))<=6:q.append(v)
    return found

def main():
    audit=json.loads(AUDIT.read_text(encoding='utf-8'))
    rel=json.loads(REL.read_text(encoding='utf-8'))
    current={}
    for row in audit['municipalities']['101']['catchments']:
        current[norm(row['planNumber'])]={'planNumber':row['planNumber'],'sewerTypes':row.get('sewerTypes') or []}
    classified={}
    for plant in rel['plants']:
        default=plant.get('municipalityCode')
        for rr in plant['relations']:
            mc=int(rr.get('municipalityCode',default))
            if mc!=101:continue
            for pn in rr.get('planNumbers',[]):classified[norm(pn)]=plant['plantKey']
    # Only seek current Copenhagen items not already directly classified.
    targets={k:v for k,v in current.items() if k not in classified}
    target_keys=sorted(targets,key=len,reverse=True)

    urls=sitemap_urls()
    method='sitemap'
    if len(urls)<20:
        urls=crawl_links(); method='crawl'
    urls=sorted(u for u in urls if urlparse(u).path.startswith(PROJECT_PREFIX))
    print('PROJECT_URLS',len(urls),'DISCOVERY',method,'TARGETS',len(targets))

    def inspect(url):
        try:
            r=get(url,20); soup=BeautifulSoup(r.text,'html.parser')
        except Exception as e:return {'url':url,'error':str(e),'hits':[]}
        title=(soup.find('h1').get_text(' ',strip=True) if soup.find('h1') else soup.title.get_text(' ',strip=True) if soup.title else '')
        blocks=[]
        # Use paragraph/list/table blocks and section-sized divs only through their direct text children.
        for tag in soup.find_all(['p','li','td']):
            txt=' '.join(tag.stripped_strings)
            if len(txt)<20:continue
            low=txt.lower()
            if ('opland' in low or 'kloak' in low) and ('lynetten' in low or 'damhus' in low):blocks.append(txt)
        hits=[]
        for txt in blocks:
            low=txt.lower()
            plants=[]
            if 'lynetten' in low:plants.append('lynetten')
            if 'damhus' in low:plants.append('damhusaen')
            if not plants:continue
            compact=norm(txt)
            # Require a contextual opland/kloak phrase in the same block.
            if 'OPLAND' not in compact and 'KLOAK' not in compact:continue
            found=[]
            for key in target_keys:
                # Exact alphanumeric/dot token after whitespace-normalization.
                if re.search(r'(?<![0-9A-ZÆØÅ.])'+re.escape(key)+r'(?![0-9A-ZÆØÅ.])',compact):found.append(key)
            if found:
                snippet=re.sub(r'\s+',' ',txt)[:900]
                for key in found:hits.append({'planNumber':targets[key]['planNumber'],'plantKeys':plants,'snippet':snippet})
        return {'url':url,'title':title,'hits':hits}

    pages=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        for i,res in enumerate(ex.map(inspect,urls),1):
            if res.get('hits'):pages.append(res)
            if i%50==0:print('SCANNED',i,'HIT_PAGES',len(pages))

    agg=defaultdict(lambda:{'plants':set(),'sources':[]})
    for page in pages:
        for hit in page['hits']:
            k=norm(hit['planNumber']); agg[k]['plants'].update(hit['plantKeys']); agg[k]['sources'].append({'url':page['url'],'title':page['title'],'snippet':hit['snippet'],'plantKeys':hit['plantKeys']})
    unique=[]; conflicts=[]
    for k,v in sorted(agg.items()):
        rec={'planNumber':targets[k]['planNumber'],'sewerTypes':targets[k]['sewerTypes'],'plantKeys':sorted(v['plants']),'sources':v['sources']}
        if len(v['plants'])==1:unique.append(rec)
        else:conflicts.append(rec)
    out={'discoveryMethod':method,'projectUrlsScanned':len(urls),'targetUnclassifiedCurrentCatchments':len(targets),'hitPages':len(pages),'uniquePlantCandidates':unique,'conflicts':conflicts}
    OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('KK_RECEIVER_AUDIT_OK',json.dumps({'scanned':len(urls),'hitPages':len(pages),'unique':len(unique),'conflicts':len(conflicts),'lyn':sum(x['plantKeys']==['lynetten'] for x in unique),'dam':sum(x['plantKeys']==['damhusaen'] for x in unique)},ensure_ascii=False))

if __name__=='__main__':main()
