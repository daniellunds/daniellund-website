const packlabHandleActionV1 = handleAction;
handleAction = function(action,el,e){
  if(action==='trip-mode'){ tripMode=el.dataset.mode||'pack'; render(); return; }
  if(action==='toggle-returned'){ const t=activeTrip(),item=t?.items.find(i=>i.id===el.dataset.item); if(item){item.returned=!item.returned;commit();} return; }
  if(action==='reset-returned'){ const t=activeTrip();if(t){t.items.forEach(i=>i.returned=false);commit('Returned-status nulstillet');}return; }
  if(action==='open-gear-detail'){ modal={type:'gear-detail',gearId:el.dataset.gear}; render(); return; }
  if(action==='select-trip'){ const id=el.dataset.trip;if(state.trips.some(t=>t.id===id)){state.activeTripId=id;view='trips';modal=null;drawerOpen=false;tripMode='pack';commit();}return; }
  if(action==='copy-trip'){ const src=state.trips.find(t=>t.id===el.dataset.trip);if(!src)return;const copy={...deepClone(src),id:uid('trip'),name:`${src.name} · kopi`,date:'',endDate:'',archived:false,items:src.items.map((i,n)=>({...i,id:uid('item'),packed:false,returned:false,order:n}))};state.trips.unshift(copy);state.activeTripId=copy.id;tripMode='plan';commit('Trip kopieret');return; }
  if(action==='archive-trip'){ const t=activeTrip();if(t){t.archived=!t.archived;modal=null;commit(t.archived?'Trip arkiveret':'Trip genåbnet');}return; }
  return packlabHandleActionV1(action,el,e);
};

const packlabBindFormsV1 = bindForms;
bindForms = function(){
  packlabBindFormsV1();
  const nt=document.getElementById('new-trip-form');
  if(nt) nt.onsubmit=e=>{e.preventDefault();const fd=new FormData(nt);createTripV2(fd.get('name'),fd.get('date'),fd.get('endDate'),fd.get('template'));};
  const et=document.getElementById('edit-trip-form');
  if(et) et.onsubmit=e=>{e.preventDefault();const fd=new FormData(et),t=activeTrip();if(!t)return;t.name=String(fd.get('name')||'').trim();t.date=fd.get('date')||'';t.endDate=fd.get('endDate')||'';modal=null;commit('Trip gemt');};
};

function createTripV2(name,date,endDate,source){
  name=String(name||'').trim(); if(!name)return;
  let categories=deepClone(DEFAULT_CATEGORIES),items=[];
  if(source==='copy'&&activeTrip()){categories=deepClone(activeTrip().categories);items=activeTrip().items.map((i,n)=>({...deepClone(i),id:uid('item'),packed:false,returned:false,order:n}));}
  else if(source!=='empty'){
    const t=state.templates.find(x=>x.id===source);if(t){categories=deepClone(t.categories);items=t.items.map((i,n)=>({...deepClone(i),id:uid('item'),packed:false,returned:false,order:n}));}
  }
  const trip={id:uid('trip'),name,date:date||'',endDate:endDate||'',archived:false,categories,items};state.trips.unshift(trip);state.activeTripId=trip.id;modal=null;view='trips';templateEditorId=null;tripMode='plan';commit('Trip oprettet');
}

const packlabSaveGearV1 = saveGear;
saveGear = function(fd){
  const id=fd.get('id'), existing=id?gearById(id):null;
  if(!existing){
    packlabSaveGearV1(fd);
    const g=state.gear[state.gear.length-1];
    if(g) applyGearExtraFields(g,fd);
    saveState();render();return;
  }
  existing.name=String(fd.get('name')||'').trim();
  existing.weight=Math.max(0,Number(fd.get('weight'))||0);
  existing.defaultCategory=fd.get('category');
  existing.description=fd.get('description')||'';
  existing.storageId=fd.get('storage')||null;
  existing.notes=fd.get('notes')||'';
  applyGearExtraFields(existing,fd);
  modal=null;commit('Gear opdateret');
};
function applyGearExtraFields(g,fd){
  g.brand=fd.get('brand')||'';g.model=fd.get('model')||'';g.price=fd.get('price')||'';g.currency=fd.get('currency')||'DKK';g.purchaseDate=fd.get('purchaseDate')||'';g.purchasedFrom=fd.get('purchasedFrom')||'';g.url=fd.get('url')||'';g.imageUrl=fd.get('imageUrl')||'';g.receiptUrl=fd.get('receiptUrl')||'';
}

const packlabBindInteractionsV1 = bindInteractions;
bindInteractions = function(){
  packlabBindInteractionsV1();
  document.querySelectorAll('.gear-click-row').forEach(row=>row.onclick=e=>{
    if(e.target.closest('button,a,input,select'))return;
    modal={type:'gear-detail',gearId:row.dataset.gear};render();
  });
};
