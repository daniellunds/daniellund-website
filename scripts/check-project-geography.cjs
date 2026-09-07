const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='labs/spildevandskort/';
const read=p=>JSON.parse(fs.readFileSync(root+'data/'+p,'utf8'));
const profiles={};for(const f of read('utility-profiles-index.json').files)Object.assign(profiles,read(f).profiles);
const reviews=read('project-geography.json').projects;
const projects=Object.entries(profiles).flatMap(([brandId,p])=>(p.projects||[]).map((pr,i)=>({...pr,brandId,id:`${brandId}:${i}`})));
assert.equal(reviews.length,143);assert.equal(new Set(reviews.map(r=>r.id)).size,projects.length);
for(const pr of projects){const r=reviews.find(r=>r.id===pr.id);assert.equal(r?.name,pr.name);assert.ok(r.reason&&r.sourceUrl);}
const shape=read('svanemoellen.geojson');assert.equal(shape.features.length,48);
assert.equal(shape.features.filter(f=>f.geometry.type==='Point').length,16);
const coords=[];function visit(a){if(typeof a[0]==='number'){coords.push(a);return;}a.forEach(visit);}
shape.features.forEach(f=>visit(f.geometry.coordinates));
assert.ok(coords.every(([lon,lat])=>12.4<lon&&lon<12.7&&55.65<lat&&lat<55.8));
assert.ok(!JSON.stringify(shape).match(/password|username|features_host/i));
const context=vm.createContext({state:{profiles:new Map(Object.entries(profiles)),plants:[],projectGeography:new Map(reviews.map(r=>[r.id,r])),projectGeometries:new Map([['svanemoellen',shape]]),projectLocationAnchors:read('project-locations.json').anchors.map(a=>({...a,_matches:a.matches}))},els:{},$:()=>null,renderPolygons(){},renderPlants(){},normalize:s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zæøå0-9]+/g,' ').trim()});
vm.runInContext(fs.readFileSync(root+'projects.js','utf8'),context);
context.state.projectLocationAnchors=read('project-locations.json').anchors.map(a=>({...a,_matches:a.matches}));
function evaluate(code){return vm.runInContext(code,context);}
evaluate('rebuildProjects()');
for(const r of reviews.filter(r=>r.geometryType==='line'||r.geometryType==='unresolved'||r.withholdAnchor)){
 context.pr=projects.find(p=>p.id===r.id);
 // An incidental plant/area mention must never override the reviewed geometry type.
 context.state.plants=[{id:'incidental',name:context.pr.name,active:true,coordinates:[12,56],responsibleBrandId:context.pr.brandId}];
 assert.equal(evaluate('projectLocation(pr)'),null,r.id);
}
context.pr=projects.find(p=>p.id==='aarhus-vand:0');assert.equal(evaluate('projectLocation(pr)?.label'),'Tangkrogen');
context.pr=projects.find(p=>p.id==='novafos:0');assert.ok(evaluate('projectGeometry(pr)'));assert.equal(evaluate('projectLocation(pr)'),null);
context.pr={...context.pr,name:'Reordered/new project'};assert.equal(evaluate('projectReview(pr)'),null);assert.equal(evaluate('projectGeometry(pr)'),null);
const r=reviews.find(r=>r.id==='aarhus-vand:1');context.pr=projects.find(p=>p.id===r.id);
context.state.plants=[{id:r.pulsId,name:r.pulsName,active:true,coordinates:[10.2427,56.2131]}];
assert.equal(evaluate('projectLocation(pr).label'),'Egå');context.state.plants[0].active=false;assert.equal(evaluate('projectLocation(pr)'),null);
console.log('PROJECT_GEOGRAPHY_OK',reviews.length,'classifications, 32 route features, 16 shaft points; unsafe fallback and stale identities rejected');
