// Exercise the real integration with a minimal map/panel harness, including failed downloads.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='labs/spildevandskort/';
const script=fs.readFileSync(root+'wwtp-catchments.js','utf8');
async function run(failed=[]){
  let drawn=null,html='',resets=0;
  const context={Intl,console:{info(){},warn(){}},PROD:'data',window:{},
    fetchJSON:async url=>{if(failed.some(x=>url.endsWith(x)))throw Error('offline');return JSON.parse(fs.readFileSync(root+url,'utf8'));},
    state:{brandById:new Map(),map:{fitBounds(){}},polygonLayer:{eachLayer(){}}},
    els:{detailContent:{querySelector:()=>({append:box=>{html=box.innerHTML;}})}},
    document:{createElement:()=>({querySelector:()=>({})})},
    renderPolygons:()=>{resets++;},capacityRadius:()=>5,
    openPlant:()=>{html='';},
    L:{geoJSON:fc=>{drawn=fc;return{addTo(){return this;},remove(){drawn=null;},getBounds:()=>({isValid:()=>true})};},
       circleMarker:()=>({addTo(){return this;},remove(){}})}};
  vm.createContext(context);await vm.runInContext(script,context);
  return {context,open:p=>context.openPlant(p),drawn:()=>drawn,html:()=>html,resets:()=>resets};
}
(async()=>{
  const a=await run();assert.equal(a.context.window.WWTP_CATCHMENT_PILOT_READY,true);
  a.open({id:'Renseanlaeg.426fe009-d383-4e55-b365-9cd7dbe1abdb',name:'Renamed plant',coordinates:[12.4505,55.6085]});
  assert.equal(a.drawn().features.length,40);assert.match(a.html(),/delvis dækning/);assert.match(a.html(),/40 \/ 40/);
  assert.match(a.html(),/Brøndby/);assert.doesNotMatch(a.html(),/Komplet officiel geometri/);
  a.open({name:'Renseanlæg Lynetten'});assert.equal(a.drawn().features.length,1);assert.match(a.html(),/Komplet officiel geometri/);
  a.open({name:'Renseanlæg Damhusåen'});assert.equal(a.drawn().features.length,1);
  a.open({name:'Mølleåværket A/S'});assert(a.drawn().features.length>500);
  a.open({name:'Avedøreværket, kølevand'});assert.equal(a.drawn(),null);assert.equal(a.html(),'');
  const b=await run(['avedoere-brondby-catchment.geojson']);b.open({name:'Renseanlæg Lynetten'});assert.equal(b.drawn().features.length,1);
  const c=await run(['kk-official-wwtp-catchment.geojson']);c.open({name:'Renseanlæg Lynetten'});assert(c.drawn().features.length>1);
  c.open({name:'Spildevandscenter Avedøre'});assert.equal(c.drawn().features.length,40);
  c.context.window.resetWwtpCatchmentHighlight();assert.equal(c.drawn(),null);
  const d=await run(['wwtp-catchment-pilot.geojson','wwtp-catchment-pilot-meta.json']);d.open({name:'Spildevandscenter Avedøre'});assert.equal(d.drawn().features.length,40);
  const e=await run(['.geojson']);assert.equal(e.context.window.WWTP_CATCHMENT_PILOT_READY,false);
  console.log('AVEDOERE_INTEGRATION_QA_OK: plant matching, coverage labels, existing plants, reset, download failures');
})();
