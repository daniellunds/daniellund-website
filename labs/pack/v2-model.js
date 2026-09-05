const PACKLAB_CATEGORY_META = {
  'Pack': {color:'#557264', label:'Pack'},
  'Shelter': {color:'#d07b56', label:'Shelter'},
  'Sleep system': {color:'#7b78a8', label:'Sleep'},
  'Hiking clothes': {color:'#b68a3d', label:'Hiking clothes'},
  'Carried clothes': {color:'#bb6f82', label:'Carried clothes'},
  'Electronics': {color:'#5b7fa6', label:'Electronics'},
  'Camp stuff, tools and repair': {color:'#7c8179', label:'Camp & tools'},
  'Kitchen': {color:'#4f927f', label:'Kitchen'},
  'Toiletries and meds': {color:'#9a7b9e', label:'Toiletries'},
  'Consumables': {color:'#c69b52', label:'Consumables'},
  'Personal items': {color:'#7c9a6d', label:'Personal'}
};
const PACKLAB_FALLBACK_COLORS = ['#557264','#d07b56','#7b78a8','#b68a3d','#5b7fa6','#4f927f','#bb6f82','#9a7b9e','#7c8179','#c69b52'];

let tripMode = 'pack';

function packlabNormalizeState(){
  state.gear.forEach(g=>{
    if(g.brand===undefined) g.brand='';
    if(g.model===undefined) g.model='';
    if(g.price===undefined) g.price='';
    if(g.currency===undefined) g.currency='DKK';
    if(g.purchaseDate===undefined) g.purchaseDate='';
    if(g.purchasedFrom===undefined) g.purchasedFrom='';
    if(g.imageUrl===undefined) g.imageUrl='';
    if(g.receiptUrl===undefined) g.receiptUrl='';
    if(g.url===undefined) g.url='';
  });
  state.trips.forEach(t=>{
    if(t.endDate===undefined) t.endDate='';
    if(t.archived===undefined) t.archived=false;
    (t.items||[]).forEach(i=>{ if(i.returned===undefined) i.returned=false; });
  });
  state.templates.forEach(t=>(t.items||[]).forEach(i=>{ if(i.returned===undefined) i.returned=false; }));
  saveState();
}
packlabNormalizeState();

function categoryMeta(cat,index=0){ return PACKLAB_CATEGORY_META[cat] || {color:PACKLAB_FALLBACK_COLORS[index%PACKLAB_FALLBACK_COLORS.length],label:cat}; }
function categoryWeights(ws){
  const rows=(ws.categories||DEFAULT_CATEGORIES).map((cat,index)=>({cat,index,weight:categoryWeight(ws,cat)})).filter(x=>x.weight>0);
  return rows.sort((a,b)=>b.weight-a.weight);
}
function donutGradient(ws){
  const rows=categoryWeights(ws), total=rows.reduce((s,x)=>s+x.weight,0);
  if(!total) return 'conic-gradient(#e6e5df 0 100%)';
  let at=0; const parts=[];
  rows.forEach((r,i)=>{
    const start=at, end=at+(r.weight/total)*100; at=end;
    parts.push(`${categoryMeta(r.cat,r.index).color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
  });
  return `conic-gradient(${parts.join(',')})`;
}
function tripEffectiveDate(t){ return t.endDate || t.date || ''; }
function tripIsPast(t){
  if(t.archived) return true;
  const d=tripEffectiveDate(t); if(!d) return false;
  const end=new Date(`${d}T23:59:59`); return end.getTime() < Date.now();
}
function sortedTrips(past=false){
  return state.trips.filter(t=>tripIsPast(t)===past).sort((a,b)=>{
    const aa=tripEffectiveDate(a)||'9999-12-31', bb=tripEffectiveDate(b)||'9999-12-31';
    return past ? bb.localeCompare(aa) : aa.localeCompare(bb);
  });
}
function itemReturnedStats(ws){ const a=ws?.items||[]; return {returned:a.filter(i=>i.returned).length,total:a.length}; }
function gearUsageStats(gearId){
  const trips=state.trips.filter(t=>(t.items||[]).some(i=>i.gearId===gearId));
  const past=trips.filter(tripIsPast).sort((a,b)=>(tripEffectiveDate(b)||'').localeCompare(tripEffectiveDate(a)||''));
  return {all:trips.length,past:past.length,last:past[0]||null,trips:past};
}
function storageSortKey(id){ return id ? storagePath(id) : 'zzzz Unassigned'; }
