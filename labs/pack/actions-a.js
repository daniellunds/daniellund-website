function bindInteractions(){
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{ view=b.dataset.nav; templateEditorId=null; drawerOpen=false; modal=null; render(); });
  document.querySelectorAll('[data-action]').forEach(b=>{ b.onclick=(e)=>handleAction(b.dataset.action,b,e); });
  const ts=document.getElementById('trip-select'); if(ts) ts.onchange=()=>{state.activeTripId=ts.value;commit();};
  bindSearch('gear-search-page'); bindSearch('gear-search-drawer');
  bindSelectFilter('gear-category-page','category'); bindSelectFilter('gear-category-drawer','category');
  bindSelectFilter('gear-storage-page','storage'); bindSelectFilter('gear-storage-drawer','storage');
  bindForms(); bindDnD();
  const st=document.getElementById('storage-type'); if(st) st.onchange=()=>document.querySelector('.storage-number-field')?.classList.toggle('hidden',st.value!=='box');
  document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{
    b.classList.toggle('active'); const input=b.closest('form').querySelector(`input[name="${b.dataset.toggle}"]`); input.value=b.classList.contains('active')?'1':'0';
    if(b.dataset.toggle==='worn'&&b.classList.contains('active')){ const other=b.closest('form').querySelector('[data-toggle="consumable"]'); other.classList.remove('active'); b.closest('form').querySelector('input[name="consumable"]').value='0'; }
    if(b.dataset.toggle==='consumable'&&b.classList.contains('active')){ const other=b.closest('form').querySelector('[data-toggle="worn"]'); other.classList.remove('active'); b.closest('form').querySelector('input[name="worn"]').value='0'; }
  });
}
function bindSearch(id){ const el=document.getElementById(id); if(!el)return; el.oninput=()=>{gearQuery=el.value;render();setTimeout(()=>{const n=document.getElementById(id);if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}},0)}; }
function bindSelectFilter(id,type){ const el=document.getElementById(id); if(!el)return; el.onchange=()=>{ if(type==='category') gearCategoryFilter=el.value; else gearStorageFilter=el.value; render(); }; }

function handleAction(action,el,e){
  if(action==='noop') return;
  if(action==='open-gear'){ drawerOpen=true; render(); return; }
  if(action==='close-gear'){ drawerOpen=false; render(); return; }
  if(action==='close-modal'){ modal=null; render(); return; }
  if(action==='new-trip'){ modal={type:'new-trip'}; render(); return; }
  if(action==='edit-trip'){ modal={type:'edit-trip'}; render(); return; }
  if(action==='new-gear'){ modal={type:'gear'}; render(); return; }
  if(action==='edit-gear'){ modal={type:'gear',gearId:el.dataset.gear}; render(); return; }
  if(action==='edit-workspace-item'){ modal={type:'workspace-item',itemId:el.dataset.item}; render(); return; }
  if(action==='toggle-packed'){ const t=activeTrip(); const item=t?.items.find(i=>i.id===el.dataset.item); if(item){item.packed=!item.packed;commit();} return; }
  if(action==='reset-packed'){ const t=activeTrip(); if(t){t.items.forEach(i=>i.packed=false);commit('Alle items er markeret unpacked');} return; }
  if(action==='add-category'){ const ws=view==='templates'&&templateEditorId?activeTemplate():activeTrip(); if(!ws)return; const name=prompt('Navn på ny kategori'); if(name&&name.trim()&&!ws.categories.includes(name.trim())){ws.categories.push(name.trim());commit('Kategori tilføjet');} return; }
  if(action==='add-gear-default'){ addGearToWorkspace(el.dataset.gear); return; }
  if(action==='new-storage'){ modal={type:'storage'}; render(); return; }
  if(action==='edit-storage'){ modal={type:'storage',storageId:el.dataset.storage}; render(); return; }
  if(action==='new-template'){ modal={type:'template-meta'}; render(); return; }
  if(action==='rename-template'){ modal={type:'template-meta',templateId:templateEditorId}; render(); return; }
  if(action==='edit-template'){ templateEditorId=el.dataset.template; render(); return; }
  if(action==='close-template'){ templateEditorId=null; drawerOpen=false; render(); return; }
  if(action==='trip-from-template'){ openTripFromTemplate(el.dataset.template); return; }
  if(action==='export-backup'){ exportBackup(); return; }
  if(action==='archive-gear'){ archiveGear(el.dataset.gear); return; }
  if(action==='remove-workspace-item'){ removeWorkspaceItem(el.dataset.item); return; }
  if(action==='delete-trip'){ deleteActiveTrip(); return; }
  if(action==='delete-storage'){ deleteStorage(el.dataset.storage); return; }
  if(action==='delete-template'){ deleteTemplate(el.dataset.template); return; }
}

function bindForms(){
  const nt=document.getElementById('new-trip-form'); if(nt) nt.onsubmit=e=>{e.preventDefault();const fd=new FormData(nt);createTrip(fd.get('name'),fd.get('date'),fd.get('template'));};
  const et=document.getElementById('edit-trip-form'); if(et) et.onsubmit=e=>{e.preventDefault();const fd=new FormData(et),t=activeTrip();t.name=fd.get('name').trim();t.date=fd.get('date')||'';modal=null;commit('Trip gemt');};
  const gf=document.getElementById('gear-form'); if(gf) gf.onsubmit=e=>{e.preventDefault();saveGear(new FormData(gf));};
  const wf=document.getElementById('workspace-item-form'); if(wf) wf.onsubmit=e=>{e.preventDefault();saveWorkspaceItem(new FormData(wf));};
  const sf=document.getElementById('storage-form'); if(sf) sf.onsubmit=e=>{e.preventDefault();saveStorage(new FormData(sf));};
  const tf=document.getElementById('template-form'); if(tf) tf.onsubmit=e=>{e.preventDefault();saveTemplate(new FormData(tf));};
}

function workspace(){ return view==='templates'&&templateEditorId?activeTemplate():activeTrip(); }
function addGearToWorkspace(gearId,category=null){
  const ws=workspace(); if(!ws)return;
  if(ws.items.some(i=>i.gearId===gearId)){ showToast('Gear-item er allerede på listen'); return; }
  const g=gearById(gearId); if(!g)return;
  const cat=category||g.defaultCategory||ws.categories[0]; if(!ws.categories.includes(cat)) ws.categories.push(cat);
  const max=Math.max(-1,...ws.items.filter(i=>i.category===cat).map(i=>Number(i.order)||0));
  ws.items.push({id:uid('item'),gearId,category:cat,worn:false,consumable:cat==='Consumables',packed:false,notes:'',order:max+1});
  commit(`${g.name} tilføjet`);
}
function removeWorkspaceItem(id){ const ws=workspace(); if(!ws)return; ws.items=ws.items.filter(i=>i.id!==id);modal=null;commit('Fjernet fra listen'); }
function saveWorkspaceItem(fd){
  const ws=workspace(), item=ws?.items.find(i=>i.id===fd.get('id')); if(!item)return;
  item.category=fd.get('category'); item.worn=fd.get('worn')==='1'; item.consumable=fd.get('consumable')==='1'; item.notes=fd.get('notes')||''; modal=null;commit('Item opdateret');
}
function createTrip(name,date,source){
  name=String(name||'').trim(); if(!name)return;
  let categories=deepClone(DEFAULT_CATEGORIES),items=[];
  if(source==='copy'&&activeTrip()){ categories=deepClone(activeTrip().categories);items=activeTrip().items.map((i,n)=>({...deepClone(i),id:uid('item'),packed:false,order:n})); }
  else if(source!=='empty'){
    const t=state.templates.find(x=>x.id===source); if(t){categories=deepClone(t.categories);items=t.items.map((i,n)=>({...deepClone(i),id:uid('item'),packed:false,order:n}));}
  }
  const trip={id:uid('trip'),name,date:date||'',categories,items}; state.trips.unshift(trip);state.activeTripId=trip.id;modal=null;view='trips';templateEditorId=null;commit('Trip oprettet');
}
function openTripFromTemplate(templateId){ const t=state.templates.find(x=>x.id===templateId); if(!t)return; modal={type:'new-trip'}; render(); setTimeout(()=>{const f=document.getElementById('new-trip-form');if(f){f.elements.template.value=templateId;f.elements.name.focus();}},0); }
function deleteActiveTrip(){ const t=activeTrip(); if(!t)return;if(!confirm(`Slet “${t.name}”?`))return;state.trips=state.trips.filter(x=>x.id!==t.id);state.activeTripId=state.trips[0]?.id||null;modal=null;commit('Trip slettet'); }
function saveGear(fd){
  const id=fd.get('id'), existing=id?gearById(id):null; const obj=existing||{id:uid('gear'),archived:false,url:''};
  obj.name=String(fd.get('name')).trim();obj.weight=Math.max(0,Number(fd.get('weight'))||0);obj.defaultCategory=fd.get('category');obj.description=fd.get('description')||'';obj.storageId=fd.get('storage')||null;obj.notes=fd.get('notes')||'';
  if(!existing)state.gear.push(obj);modal=null;commit(existing?'Gear opdateret':'Gear tilføjet');
}
function archiveGear(id){ const g=gearById(id);if(!g)return;if(!confirm(`Arkivér “${g.name}”? Historiske trips beholder referencen.`))return;g.archived=true;modal=null;commit('Gear arkiveret'); }
function saveStorage(fd){
  const id=fd.get('id'), existing=id?storageById(id):null,type=fd.get('type'),parentId=fd.get('parent')||null;
  if(id&&parentId&&isDescendant(parentId,id)){alert('En storage-location kan ikke flyttes ind i sig selv eller et underniveau.');return;}
  let number=null,name=String(fd.get('name')||'').trim();
  if(type==='box'){
    number=Math.max(1,Number(fd.get('number'))||nextBoxNumber(id));
    if(state.storage.some(s=>s.type==='box'&&s.id!==id&&Number(s.number)===number)){alert(`Box ${String(number).padStart(2,'0')} findes allerede. Vælg et andet nummer.`);return;}
  } else if(!name){ alert('Angiv et navn.'); return; }
  const obj=existing||{id:uid('st')}; obj.type=type;obj.parentId=parentId;obj.number=number;obj.name=name;
  if(!existing)state.storage.push(obj);selectedStorageId=obj.id;modal=null;commit(existing?'Storage opdateret':'Storage oprettet');
}
function isDescendant(candidateParent,nodeId){ let n=storageById(candidateParent),guard=0;while(n&&guard++<20){if(n.id===nodeId)return true;n=n.parentId?storageById(n.parentId):null;}return false; }
function deleteStorage(id){
  const node=storageById(id);if(!node)return;const hasChildren=state.storage.some(s=>s.parentId===id),hasGear=state.gear.some(g=>g.storageId===id);
  if(hasChildren){alert('Flyt eller slet underliggende storage først.');return;} if(!confirm(`Slet ${storageLabel(node)}?${hasGear?' Gear herfra flyttes til Unassigned.':''}`))return;
  state.gear.filter(g=>g.storageId===id).forEach(g=>g.storageId=null);state.storage=state.storage.filter(s=>s.id!==id);selectedStorageId='unassigned';modal=null;commit('Storage slettet');
}
function saveTemplate(fd){
  const id=fd.get('id'),existing=id?state.templates.find(t=>t.id===id):null;const obj=existing||{id:uid('tpl'),categories:deepClone(DEFAULT_CATEGORIES),items:[]};
  obj.name=String(fd.get('name')).trim();obj.icon=String(fd.get('icon')||'▧').trim();obj.description=fd.get('description')||'';
  if(!existing)state.templates.push(obj);modal=null;if(!existing)templateEditorId=obj.id;commit(existing?'Template opdateret':'Template oprettet');
}
function deleteTemplate(id){ const t=state.templates.find(x=>x.id===id);if(!t)return;if(!confirm(`Slet template “${t.name}”?`))return;state.templates=state.templates.filter(x=>x.id!==id);templateEditorId=null;modal=null;commit('Template slettet'); }
function exportBackup(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`packlab-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);showToast('Backup downloadet');
}

