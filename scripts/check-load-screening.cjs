const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('../labs/spildevandskort/load-screening.js');
const uuid='83a5ac21-aa28-4576-ad58-8d9b798bad0d';
const eea={plantId:uuid,historicalLoadPE:170000,historicalLoadYear:2022,historicalMatch:{sourceUrl:'https://example.org/eea'}};
assert.equal(S.select(eea).pe,170000);assert.equal(S.select({...eea,historicalLoadPE:0}).pe,0);
assert.equal(S.select({...eea,historicalLoadYear:null}).source,'EEA-belastning mangler');
assert.equal(S.select({capacity:250000,approvedLoad:200000}).pe,null);
for(const [pe,expected] of [[null,'unknown'],[0,'low'],[9999,'low'],[10000,'mid'],[149999,'mid'],[150000,'high']])assert.equal(S.band({pe}),expected);
const data=JSON.parse(fs.readFileSync('labs/spildevandskort/data/plant-loads.json','utf8'));
assert.equal(data.basis,'eea-2022-only');assert.equal(data.sourceField,'uwwLoadEnteringUWWTP');
assert.equal(new Set(data.records.map(r=>r.plantId)).size,data.records.length);
for(const r of data.records){assert(Number.isFinite(r.historicalLoadPE));assert.equal(r.historicalLoadYear,2022);assert(r.historicalMatch.sourceUrl);}
// Exercise the integration's failure handling independently of the base map downloads.
async function checkUI(fail){
 const nodes={loadScreeningEnabled:{checked:true},loadScreeningFilter:{value:'high'},loadScreeningNote:{},legend:{}};
 const c={window:{LoadScreening:S},LoadScreening:S,console:{warn(){}},PROD:'data',state:{plants:[{id:uuid,active:true}]},document:{getElementById:k=>nodes[k],querySelector:()=>nodes.legend},fetchJSON:async()=>{if(fail)throw Error('offline');return data;}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('labs/spildevandskort/load-screening-ui.js','utf8'),c);
 await c.loadPlantLoads();assert.match(nodes.loadScreeningNote.textContent,fail?/kunne ikke hentes/:/1 aktive anlæg med EEA-belastning/);
 assert.equal(c.loadFilterMatches({id:'unknown',active:true}),false);
 nodes.loadScreeningEnabled.checked=false;assert.equal(c.loadFilterMatches({id:'unknown',active:true}),true);
}
(async()=>{await checkUI(false);await checkUI(true);console.log('LOAD_SCREENING_OK: EEA 2022 basis, thresholds, zero, missing data, unique joins and download failure');})();
