import asyncio, json, re, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright

OUT=Path('.github/audits/rudersdal-2025-network.json')
TARGETS=['https://rudersdal.dkplan.dk/plan/5','https://rudersdal.dkplan.dk/3788']
KEYWORDS=('wfs','getfeature','featureinfo','spatial','kort.rudersdal.dk','novafos','kloak','rense')

async def main():
    result={'targets':TARGETS,'pages':[],'interestingResponses':[],'mapTexts':[]}
    async with async_playwright() as p:
        browser=await p.chromium.launch()
        context=await browser.new_context(viewport={'width':1600,'height':1200})
        page=await context.new_page()

        async def on_response(resp):
            url=resp.url
            low=url.lower()
            if not any(k in low for k in KEYWORDS):
                return
            entry={'url':url,'status':resp.status,'contentType':resp.headers.get('content-type','')}
            ct=entry['contentType'].lower()
            if any(x in ct for x in ('json','xml','text','javascript','html')):
                try:
                    txt=await resp.text()
                    if txt:
                        entry['bodySnippet']=txt[:30000]
                except Exception as e:
                    entry['bodyError']=repr(e)
            result['interestingResponses'].append(entry)

        page.on('response',lambda r: asyncio.create_task(on_response(r)))
        for url in TARGETS:
            try:
                r=await page.goto(url,wait_until='domcontentloaded',timeout=60000)
                await page.wait_for_timeout(7000)
                text=re.sub(r'\s+',' ',await page.locator('body').inner_text()).strip()
                result['pages'].append({'url':url,'status':r.status if r else None,'title':await page.title(),'bodyText':text[:50000]})
                # Activate embedded map if present.
                act=page.get_by_text('Klik for at aktivere kortet',exact=False)
                if await act.count():
                    try:
                        await act.first.click(timeout=10000)
                        await page.wait_for_timeout(10000)
                    except Exception as e:
                        result['pages'][-1]['activateError']=repr(e)
                # Record iframes and relevant links/src attributes.
                refs=await page.locator('iframe,script,link,a').evaluate_all("els=>els.map(e=>({tag:e.tagName,src:e.src||'',href:e.href||'',text:(e.innerText||'').trim()})).filter(x=>x.src||x.href)")
                result['pages'][-1]['refs']=[x for x in refs if any(k in (x.get('src','')+' '+x.get('href','')).lower() for k in KEYWORDS)][:500]
                # Click a modest grid inside the largest visible canvas/map-like node to induce feature-info requests.
                candidates=await page.locator('canvas,div').evaluate_all("els=>els.map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id||'',cls:String(e.className||''),x:r.x,y:r.y,w:r.width,h:r.height}}).filter(x=>x.w>500&&x.h>250&&x.h<1000).sort((a,b)=>b.w*b.h-a.w*a.h).slice(0,20)")
                result['pages'][-1]['mapCandidates']=candidates
                chosen=next((c for c in candidates if c['tag']=='CANVAS'),None) or next((c for c in candidates if any(k in (c['id']+' '+c['cls']).lower() for k in ('map','kort','spatial'))),None)
                if chosen:
                    for fy in (.25,.5,.75):
                        for fx in (.2,.4,.6,.8):
                            try:
                                await page.mouse.click(chosen['x']+chosen['w']*fx,chosen['y']+chosen['h']*fy)
                                await page.wait_for_timeout(600)
                            except Exception:
                                pass
                    txt=re.sub(r'\s+',' ',await page.locator('body').inner_text()).strip()
                    for m in re.findall(r'.{0,300}(?:Mølleåværket|renseanlæg|renseanlaeg).{0,700}',txt,flags=re.I):
                        result['mapTexts'].append(m[:1500])
            except Exception as e:
                result['pages'].append({'url':url,'error':repr(e)})
        await page.wait_for_timeout(3000)
        await browser.close()

    # Deduplicate response URLs while keeping first body.
    dedup={}
    for e in result['interestingResponses']:
        dedup.setdefault(e['url'],e)
    result['interestingResponses']=list(dedup.values())

    # Compact derived evidence inventory.
    result['derived']={
        'urls':[e['url'] for e in result['interestingResponses']],
        'urlsWithMoellea':[e['url'] for e in result['interestingResponses'] if 'mølle' in (e.get('bodySnippet','')+e['url']).lower() or 'molle' in (e.get('bodySnippet','')+e['url']).lower()],
        'urlsWithRense':[e['url'] for e in result['interestingResponses'] if 'rense' in (e.get('bodySnippet','')+e['url']).lower()],
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('RUDERSDAL_AUDIT_WRITTEN',OUT,'responses',len(result['interestingResponses']))

asyncio.run(main())
