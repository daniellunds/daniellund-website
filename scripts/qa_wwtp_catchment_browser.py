import asyncio, os
from playwright.async_api import async_playwright

MAP_URL=os.environ.get('MAP_URL','http://127.0.0.1:4184/labs/spildevandskort/')

async def check(browser,mobile=False):
    context=await browser.new_context(viewport={'width':390,'height':844} if mobile else {'width':1440,'height':900},is_mobile=mobile)
    page=await context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    r=await page.goto(MAP_URL,wait_until='domcontentloaded',timeout=60000)
    assert r and r.ok
    await page.wait_for_function("window.WWTP_CATCHMENT_PILOT_READY===true",timeout=90000)
    await page.wait_for_function("typeof state!=='undefined' && state.plants.length>700 && state.features.length>350",timeout=90000)

    for needle in ['lynetten','damhus','mølleå']:
        opened=await page.evaluate("""needle => {
          const rows=state.plants.filter(p=>String(p.name||'').toLocaleLowerCase('da').includes(needle));
          rows.sort((a,b)=>(Number(b.capacity)||0)-(Number(a.capacity)||0));
          const p=rows.find(x=>x.active) || rows[0];
          if(!p)return null;
          openPlant(p);
          let first=null; state.polygonLayer.eachLayer(l=>{if(!first)first=l});
          return {id:p.id,name:p.name,capacity:p.capacity,fillOpacity:first?.options?.fillOpacity};
        }""",needle)
        assert opened,needle
        await page.wait_for_selector('#detailPanel.open',timeout=10000)
        text=(await page.locator('#detailContent').inner_text()).lower()
        assert 'renseanlægsopland · pilot' in text,(needle,text)
        assert 'dokumenteret pilot · delvis dækning' in text,(needle,text)
        assert 'oplandsrelationer matchet' in text,(needle,text)
        assert 'kommuner i piloten' in text,(needle,text)
        assert 'nulstil opland' in text,(needle,text)
        assert opened['fillOpacity'] is not None and opened['fillOpacity']<0.1,opened
        assert await page.locator('#detailContent .wwtp-catchment-pilot').count()==1
        await page.locator('#detailContent [data-reset-wwtp]').click()
        await page.wait_for_timeout(150)
        restored=await page.evaluate("""() => {let first=null;state.polygonLayer.eachLayer(l=>{if(!first)first=l});return first?.options?.fillOpacity}""")
        assert restored is not None and restored>0.2,restored

    assert not errors,errors
    if mobile:
        overflow=await page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')
        assert overflow<=3,overflow
    print(('MOBILE' if mobile else 'DESKTOP'),'WWTP_CATCHMENT_BROWSER_QA_OK')
    await context.close()

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch()
        await check(browser,False)
        await check(browser,True)
        await browser.close()

asyncio.run(main())
