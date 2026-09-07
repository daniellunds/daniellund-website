const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='labs/spildevandskort/';
const read=p=>JSON.parse(fs.readFileSync(root+'data/'+p,'utf8'));
const profiles={};for(const f of read('utility-profiles-index.json').files)Object.assign(profiles,read(f).profiles);
const reviews=read('project-geography.json').projects;
const projects=Object.entries(profiles).flatMap(([brandId,p])=>(p.projects||[]).map((pr,i)=>({...pr,brandId,id:`${brandId}:${i}`})));
assert.equal(reviews.length,143);assert.equal(new Set(reviews.map(r=>r.id)).size,projects.length);
for(const pr of projects){const r=reviews.find(r=>r.id===pr.id);assert.equal(r?.name,pr.name);assert.ok(r.reason&&r.sourceUrl);}
const counts=Object.fromEntries(['point','line','polygon','unresolved'].map(k=>[k,reviews.filter(r=>r.geometryType===k).length]));
assert.deepEqual(counts,{point:28,line:9,polygon:59,unresolved:47});

const index=read('project-geometries-index.json');
assert.equal(index.geometries.length,2);assert.deepEqual(index.geometries.map(x=>x.precision).sort(),['schematic','source']);
const geometries=new Map(),byProject=new Map();
const allCoords=[];function visit(a){if(typeof a[0]==='number'){allCoords.push(a);return;}a.forEach(visit);}
for(const item of index.geometries){
  assert.ok(item.key&&item.file&&['source','schematic'].includes(item.precision));
  const shape=read(item.file);assert.equal(shape.type,'FeatureCollection');assert.equal(shape.metadata.projectKey,item.key);assert.ok(shape.metadata.sourceUrl&&shape.features.length);
  shape.features.forEach(f=>visit(f.geometry.coordinates));
  geometries.set(item.key,{...shape,metadata:{...shape.metadata,precision:item.precision}});
  for(const id of shape.metadata.projectIds||[])byProject.set(id,item.key);
}
assert.ok(allCoords.every(([lon,lat])=>7.5<lon&&lon<16&&54<lat&&lat<58.5));
const svan=geometries.get('svanemoellen');assert.equal(svan.features.length,48);assert.equal(svan.features.filter(f=>f.geometry.type==='Point').length,16);assert.equal(svan.metadata.precision,'source');
assert.ok(!JSON.stringify(svan).match(/password|username|features_host/i));
const valby=geometries.get('valby-skybrudstunnel');assert.equal(valby.metadata.precision,'schematic');assert.deepEqual(valby.metadata.projectIds,['hofor:1','frederiksberg-forsyning:0']);assert.equal(valby.features.filter(f=>f.geometry.type==='Point').length,5);assert.equal(valby.features.filter(f=>f.geometry.type==='LineString').length,1);assert.match(valby.metadata.note,/ikke den projekterede centerlinje/i);

const context=vm.createContext({state:{profiles:new Map(Object.entries(profiles)),plants:[],projectGeography:new Map(reviews.map(r=>[r.id,r])),projectGeometries:geometries,projectGeometryByProject:byProject,projectLocationAnchors:read('project-locations.json').anchors.map(a=>({...a,_matches:a.matches}))},els:{},$:()=>null,renderPolygons(){},renderPlants(){},normalize:s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zæøå0-9]+/g,' ').trim()});
vm.runInContext(fs.readFileSync(root+'projects.js','utf8'),context);
context.state.projectLocationAnchors=read('project-locations.json').anchors.map(a=>({...a,_matches:a.matches}));
function evaluate(code){return vm.runInContext(code,context);}
evaluate('rebuildProjects()');
for(const r of reviews.filter(r=>r.geometryType==='line'||r.geometryType==='unresolved'||r.withholdAnchor)){
 context.pr=projects.find(p=>p.id===r.id);
 context.state.plants=[{id:'incidental',name:context.pr.name,active:true,coordinates:[12,56],responsibleBrandId:context.pr.brandId}];
 assert.equal(evaluate('projectLocation(pr)'),null,r.id);
}
context.pr=projects.find(p=>p.id==='aarhus-vand:0');assert.equal(evaluate('projectLocation(pr)?.label'),'Tangkrogen');
context.pr=projects.find(p=>p.id==='novafos:0');assert.ok(evaluate('projectGeometry(pr)'));assert.equal(evaluate('projectGeometryPrecision(projectGeometry(pr))'),'source');assert.equal(evaluate('projectLocation(pr)'),null);
context.pr=projects.find(p=>p.id==='hofor:1');assert.ok(evaluate('projectGeometry(pr)'));assert.equal(evaluate('projectGeometryPrecision(projectGeometry(pr))'),'schematic');
context.pr=projects.find(p=>p.id==='frederiksberg-forsyning:0');assert.ok(evaluate('projectGeometry(pr)'));assert.equal(evaluate('projectGeometryKey(pr)'),'valby-skybrudstunnel');
for(const id of ['vandcenter-syd:1','ikast-brande-spildevand:0','ffv:0','lolland-forsyning:1']){context.pr=projects.find(p=>p.id===id);assert.equal(evaluate('projectGeometry(pr)'),null,id);assert.equal(evaluate('projectLocation(pr)'),null,id);}
context.pr=projects.find(p=>p.id==='hofor:1');context.pr={...context.pr,name:'Reordered/new project'};assert.equal(evaluate('projectReview(pr)'),null);assert.equal(evaluate('projectGeometry(pr)'),null);
const r=reviews.find(r=>r.id==='aarhus-vand:1');context.pr=projects.find(p=>p.id===r.id);
context.state.plants=[{id:r.pulsId,name:r.pulsName,active:true,coordinates:[10.2427,56.2131]}];
assert.equal(evaluate('projectLocation(pr).label'),'Egå');context.state.plants[0].active=false;assert.equal(evaluate('projectLocation(pr)'),null);
console.log('PROJECT_GEOGRAPHY_OK',reviews.length,'classifications; 2 registered geometry datasets; Valby schematic separated from sourced Svanemøllen; unsafe fallback and stale identities rejected');