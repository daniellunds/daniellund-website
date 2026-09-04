let state = loadState();
let view = 'trips';
let drawerOpen = false;
let templateEditorId = null;
let selectedStorageId = 'unassigned';
let gearQuery = '';
let gearCategoryFilter = 'all';
let gearStorageFilter = 'all';
let modal = null;
let toastTimer = null;
function activeTrip(){ return state.trips.find(t=>t.id===state.activeTripId)||state.trips[0]||null; }
function activeTemplate(){ return state.templates.find(t=>t.id===templateEditorId)||null; }
function gearById(id){ return state.gear.find(g=>g.id===id); }
function storageById(id){ return state.storage.find(s=>s.id===id); }
function storageLabel(node){
  if(!node) return 'Unassigned';
  if(node.type==='box') return `Box ${String(node.number||0).padStart(2,'0')}${node.name?` · ${node.name}`:''}`;
  return node.name;
}
function storagePath(id){
  if(!id) return 'Unassigned';
  const parts=[]; let node=storageById(id), guard=0;
  while(node && guard++<20){ parts.unshift(storageLabel(node)); node=node.parentId?storageById(node.parentId):null; }
  return parts.join(' → ')||'Unassigned';
}
function directStorageCount(id){ return state.gear.filter(g=>(g.storageId||null)===(id==='unassigned'?null:id) && !g.archived).length; }
function nextBoxNumber(exceptId=null){
  const nums=new Set(state.storage.filter(s=>s.type==='box'&&s.id!==exceptId).map(s=>Number(s.number)).filter(Boolean));
  let n=1; while(nums.has(n)) n++; return n;
}
function workspaceTotals(ws){
  const items=ws?.items||[];
  let base=0,worn=0,consumable=0,total=0,packed=0;
  for(const item of items){
    const w=gearById(item.gearId)?.weight||0; total+=w;
    if(item.worn) worn+=w; else if(item.consumable) consumable+=w; else base+=w;
    if(item.packed) packed++;
  }
  return {base,worn,consumable,total,packed,count:items.length};
}
function categoryWeight(ws,cat){ return (ws.items||[]).filter(i=>i.category===cat).reduce((s,i)=>s+(gearById(i.gearId)?.weight||0),0); }
function categoryPacked(ws,cat){ const a=(ws.items||[]).filter(i=>i.category===cat); return {packed:a.filter(i=>i.packed).length,total:a.length}; }

function iconForType(type){ return type==='location'?'⌂':type==='shelf'?'≡':'□'; }
