const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('../labs/spildevandskort/load-screening.js');
const {mergeAnnual}=require('./import-annual-puls-loads.cjs');
const uuid='83a5ac21-aa28-4576-ad58-8d9b798bad0d';
const fallback={plantId:uuid,historicalLoadPE:170000,historicalLoadYear:2022};
const annual={...fallback,inletLoadPE:10000,year:2025,basis:'annual-inlet',sourceUrl:'https://example.org/puls'};
assert.equal(S.select(annual).pe,10000);assert.equal(S.select({...annual,inletLoadPE:0}).pe,0);
assert.equal(S.select({...annual,year:null}).source,'EEA · historisk fallback');
assert.equal(S.select({capacity:250000,approvedLoad:200000}).pe,null);
assert.equal(S.select({...annual,basis:'sample'}).pe,170000);
for(const [pe,expected] of [[null,'unknown'],[0,'low'],[9999,'low'],[10000,'mid'],[149999,'mid'],[150000,'high']])assert.equal(S.band({pe}),expected);
const input={basis:'annual-inlet',sourceUrl:'https://example.org/puls',retrievedAt:'2026-09-16',records:[{plantId:uuid,year:2024,inletLoadPE:22000},{plantId:uuid,year:2025,inletLoadPE:10000}]};
const merged=mergeAnnual({records:[fallback]},input);assert.equal(S.select(merged.records[0]).year,2025);assert.equal(merged.records[0].historicalLoadPE,170000);
assert.throws(()=>mergeAnnual({records:[]},{...input,records:[input.records[0],input.records[0]]}),/Dubleret/);
assert.throws(()=>mergeAnnual({records:[]},{...input,records:[{plantId:uuid,year:2025,inletLoadPE:null}]}),/Ugyldigt/);
assert.throws(()=>mergeAnnual({records:[]},{...input,basis:'sample'}),/Årligt/);
const data=JSON.parse(fs.readFileSync('labs/spildevandskort/data/plant-loads.json','utf8'));
assert.equal(new Set(data.records.map(r=>r.plantId)).size,data.records.length);
for(const r of data.records){assert(Number.isFinite(r.historicalLoadPE));assert.equal(r.historicalLoadYear,2022);assert(r.historicalMatch.sourceUrl);}
// Exercise the integration's failure handling independently of the base map downloads.
async function checkUI(fail){
 const nodes={loadScreeningEnabled:{checked:true},loadScreeningFilter:{value:'high'},loadScreeningNote:{},legend:{}};
 const c={window:{LoadScreening:S},LoadScreening:S,console:{warn(){}},PROD:'data',state:{plants:[{id:uuid,active:true}]},document:{getElementById:k=>nodes[k],querySelector:()=>nodes.legend},fetchJSON:async()=>{if(fail)throw Error('offline');return data;}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('labs/spildevandskort/load-screening-ui.js','utf8'),c);
 await c.loadPlantLoads();assert.match(nodes.loadScreeningNote.textContent,fail?/kunne ikke hentes/:/0 aktive anlæg med PULS/);
 assert.equal(c.loadFilterMatches({id:'unknown',active:true}),false);
 nodes.loadScreeningEnabled.checked=false;assert.equal(c.loadFilterMatches({id:'unknown',active:true}),true);
}
(async()=>{await checkUI(false);await checkUI(true);console.log('LOAD_SCREENING_OK: thresholds, source precedence, zero, missing data, import, unique joins and download failure');})();
