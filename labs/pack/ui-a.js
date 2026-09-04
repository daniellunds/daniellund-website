function appNav(){
  const nav=[['trips','Trips','▤'],['gear','Gear','◇'],['storage','Storage','▦'],['templates','Templates','▧']];
  return `
    <aside class="side-nav">
      <div class="brand"><div class="brand-mark">PL</div><span>PackLab<small>Daniellund Labs</small></span></div>
      <div class="nav-list">${nav.map(([id,label,ico])=>`<button class="nav-btn ${view===id?'active':''}" data-nav="${id}"><span class="nav-ico">${ico}</span><span>${label}</span></button>`).join('')}</div>
      <div class="nav-spacer"></div>
      <div class="nav-foot">MVP · gemmer lokalt i denne browser<br>132 LighterPack-items importeret</div>
    </aside>`;
}
function mobileNav(){
  const nav=[['trips','Trips','▤'],['gear','Gear','◇'],['storage','Storage','▦'],['templates','Templates','▧']];
  return `<nav class="mobile-nav">${nav.map(([id,label,ico])=>`<button class="${view===id?'active':''}" data-nav="${id}"><span class="mi">${ico}</span>${label}</button>`).join('')}</nav>`;
}
function topbar(title,subtitle,actions=''){
  return `<div class="mobile-top"><div class="mobile-brand">PackLab</div><button class="btn small" data-action="open-gear">Gear Pool</button></div>
  <div class="topbar"><div class="topbar-left"><div class="eyebrow">PackLab</div><h1 class="title">${esc(title)}</h1>${subtitle?`<div class="subtitle">${subtitle}</div>`:''}</div><div class="topbar-actions">${actions}</div></div>`;
}

function render(){
  const root=document.getElementById('app');
  root.innerHTML=`<div class="app-shell">${appNav()}<main class="main"><div class="page">${renderView()}</div></main>${mobileNav()}</div>${renderDrawer()}${renderModal()}`;
  bindInteractions();
}
function renderView(){
  if(view==='gear') return renderGearPage();
  if(view==='storage') return renderStoragePage();
  if(view==='templates') return renderTemplatesPage();
  return renderTripsPage();
}

function renderTripsPage(){
  const trip=activeTrip();
  const actions=`<button class="btn" data-action="new-trip">＋ <span class="hide-mobile">Ny tur</span></button><button class="btn primary" data-action="open-gear">◇ <span class="hide-mobile">Gear Pool</span></button>`;
  if(!trip){
    return `${topbar('Trips','Start med en tom liste eller en af dine defaults.',actions)}
      <div class="empty-state"><h3>Ingen trips endnu</h3><p>Gear Pool er klar med dine 132 importerede LighterPack-items. Opret din første tur fra en template eller start helt tomt.</p><button class="btn primary" data-action="new-trip">＋ Opret første tur</button></div>`;
  }
  return `${topbar(trip.name,fmtDate(trip.date),actions)}${renderWorkspace(trip,'trip')}`;
}

function renderWorkspace(ws,mode){
  const totals=workspaceTotals(ws), pct=totals.count?Math.round(100*totals.packed/totals.count):0;
  const select=mode==='trip'?`<select class="select" id="trip-select">${state.trips.map(t=>`<option value="${t.id}" ${t.id===ws.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select>`:'';
  return `
  <div class="summary-grid">
    <div class="stat"><div class="stat-label">${mode==='trip'?'Packed':'Items'}</div><div class="stat-value">${mode==='trip'?`${totals.packed} / ${totals.count}`:totals.count}</div>${mode==='trip'?`<div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div><div class="stat-sub">${pct}% pakket</div>`:'<div class="stat-sub">i template</div>'}</div>
    <div class="stat"><div class="stat-label">Base weight</div><div class="stat-value">${fmtWeight(totals.base)}</div></div>
    <div class="stat"><div class="stat-label">Total</div><div class="stat-value">${fmtWeight(totals.total)}</div></div>
    <div class="stat"><div class="stat-label">Worn</div><div class="stat-value">${fmtWeight(totals.worn)}</div></div>
    <div class="stat"><div class="stat-label">Consumable</div><div class="stat-value">${fmtWeight(totals.consumable)}</div></div>
  </div>
  <div class="trip-toolbar"><div class="trip-toolbar-left">${select}<span class="hint">Drag gear fra Gear Pool til en kategori.</span></div><div class="trip-toolbar-right">${mode==='trip'?`<button class="btn small" data-action="reset-packed">Markér alle som unpacked</button><button class="btn small" data-action="edit-trip">Redigér tur</button>`:`<button class="btn small" data-action="rename-template">Redigér template</button>`}<button class="btn small" data-action="add-category">＋ Kategori</button></div></div>
  <div class="category-list">${(ws.categories||DEFAULT_CATEGORIES).map(cat=>renderCategory(ws,cat,mode)).join('')}</div>`;
}
function renderCategory(ws,cat,mode){
  const items=(ws.items||[]).filter(i=>i.category===cat).sort((a,b)=>(a.order||0)-(b.order||0));
  const cp=categoryPacked(ws,cat);
  return `<section class="category" data-drop-category="${esc(cat)}">
    <div class="category-head"><div class="category-name">${esc(cat)}</div><div class="category-meta">${mode==='trip'?`${cp.packed} / ${cp.total} packed`:`${items.length} items`}</div><div class="category-weight">${fmtWeight(categoryWeight(ws,cat))}</div></div>
    <div class="category-body">${items.length?items.map(item=>renderTripItem(item,mode)).join(''):`<div class="empty-drop">Drop gear her</div>`}</div>
  </section>`;
}
function renderTripItem(item,mode){
  const g=gearById(item.gearId); if(!g) return '';
  const packed=mode==='trip'&&item.packed;
  return `<div class="trip-row ${packed?'packed':''}" draggable="true" data-trip-item="${item.id}">
    <button class="pack-toggle" data-action="${mode==='trip'?'toggle-packed':'noop'}" data-item="${item.id}" title="${mode==='trip'?'Packed / not packed':'Template item'}">${packed?'✓':(mode==='trip'?'':'·')}</button>
    <div><div class="gear-name">${esc(g.name)}</div><div class="gear-desc">${esc(g.description||'')}</div><div class="badge-row">${item.worn?'<span class="badge worn">worn</span>':''}${item.consumable?'<span class="badge consumable">consumable</span>':''}${g.weight===0?'<span class="badge warning">missing weight</span>':''}</div></div>
    <div class="row-storage" title="${esc(storagePath(g.storageId))}">${esc(storagePath(g.storageId))}</div>
    <div class="row-weight">${fmtWeight(g.weight)}</div>
    <button class="row-menu" data-action="edit-workspace-item" data-item="${item.id}" title="Redigér">•••</button>
  </div>`;
}

function renderTemplatesPage(){
  const tpl=activeTemplate();
  if(tpl){
    return `${topbar(tpl.name,'Template editor',`<button class="btn" data-action="close-template">← Tilbage</button><button class="btn primary" data-action="open-gear">◇ Gear Pool</button>`)}${renderWorkspace(tpl,'template')}`;
  }
  return `${topbar('Templates','Flere defaults, som du kan redigere individuelt.',`<button class="btn" data-action="new-template">＋ Ny template</button>`)}
    <div class="cards-grid">${state.templates.map(t=>{
      const totals=workspaceTotals(t); const cats=[...new Set(t.items.map(i=>i.category))].slice(0,4);
      return `<article class="template-card"><div class="card-icon">${t.icon||'▧'}</div><div><div class="card-title">${esc(t.name)}</div><div class="card-meta">${esc(t.description||'')} · ${t.items.length} items · ${fmtWeight(totals.total)}</div></div><div class="mini-list">${cats.map(c=>`<span class="mini-chip">${esc(c)}</span>`).join('')}</div><div class="card-actions"><button class="btn small primary" data-action="trip-from-template" data-template="${t.id}">Opret tur</button><button class="btn small" data-action="edit-template" data-template="${t.id}">Redigér</button></div></article>`;
    }).join('')}</div>`;
}

function renderGearPage(){
  const visible=filteredGear();
  return `${topbar('Gear','Din permanente gear-pool. Ét fysisk stykke gear = ét item.',`<button class="btn" data-action="export-backup">↓ Backup</button><button class="btn primary" data-action="new-gear">＋ Gear</button>`)}
    <div class="panel"><div class="searchbar"><input class="input search-input" id="gear-search-page" placeholder="Søg navn, model eller note…" value="${esc(gearQuery)}"><select class="input" id="gear-category-page"><option value="all">Alle kategorier</option>${DEFAULT_CATEGORIES.map(c=>`<option value="${esc(c)}" ${gearCategoryFilter===c?'selected':''}>${esc(c)}</option>`).join('')}</select><select class="input" id="gear-storage-page"><option value="all">Alle storage</option><option value="unassigned" ${gearStorageFilter==='unassigned'?'selected':''}>Unassigned</option>${state.storage.map(s=>`<option value="${s.id}" ${gearStorageFilter===s.id?'selected':''}>${esc(storagePath(s.id))}</option>`).join('')}</select></div>
    <div class="gear-table"><div class="gear-table-row header"><div>Gear</div><div>Model / note</div><div>Vægt</div><div>Storage</div><div></div></div>${visible.map(g=>`<div class="gear-table-row"><div><div class="gear-name">${esc(g.name)}</div><div class="badge-row"><span class="badge">${esc(g.defaultCategory)}</span>${g.weight===0?'<span class="badge warning">missing weight</span>':''}</div></div><div class="gear-desc">${esc(g.description)}</div><div class="${g.weight===0?'missing-weight':''}">${fmtWeight(g.weight)}</div><div class="row-storage">${esc(storagePath(g.storageId))}</div><button class="row-menu" data-action="edit-gear" data-gear="${g.id}">•••</button></div>`).join('')}</div><div class="panel-sub" style="margin-top:10px">Viser ${visible.length} af ${state.gear.filter(g=>!g.archived).length} items.</div></div>`;
}
function filteredGear(){
  const q=gearQuery.trim().toLowerCase();
  return state.gear.filter(g=>!g.archived)
    .filter(g=>!q || `${g.name} ${g.description} ${g.notes||''}`.toLowerCase().includes(q))
    .filter(g=>gearCategoryFilter==='all'||g.defaultCategory===gearCategoryFilter)
    .filter(g=>gearStorageFilter==='all'||(gearStorageFilter==='unassigned'?!g.storageId:g.storageId===gearStorageFilter));
}

function renderStoragePage(){
  const current=selectedStorageId==='unassigned'?null:storageById(selectedStorageId);
  const items=state.gear.filter(g=>!g.archived && (g.storageId||null)===(current?current.id:null));
  return `${topbar('Storage','Organisér kælder → reol → Box. Drag gear mellem placeringer.',`<button class="btn primary" data-action="new-storage">＋ Storage</button>`)}
    <div class="split"><div class="panel"><div class="panel-head"><div><h2 class="panel-title">Locations</h2><div class="panel-sub">Kasser nummereres i appen.</div></div></div><div class="storage-tree"><div class="tree-node ${selectedStorageId==='unassigned'?'selected':''}" data-storage-select="unassigned" data-storage-drop="unassigned"><div class="tree-left"><span>○</span><span class="tree-label">Unassigned</span></div><span class="tree-count">${directStorageCount('unassigned')}</span></div>${renderStorageNodes(null,0)}</div></div>
    <div class="panel"><div class="panel-head"><div><h2 class="panel-title">${esc(current?storageLabel(current):'Unassigned')}</h2><div class="panel-sub">${current?esc(storagePath(current.id)):'Gear uden fysisk placering'}</div></div><div>${current?`<button class="btn small" data-action="edit-storage" data-storage="${current.id}">Redigér</button>`:''}</div></div><div class="storage-items">${items.length?items.map(g=>`<div class="storage-card" draggable="true" data-storage-gear="${g.id}"><span class="drag-handle">⋮⋮</span><div><div class="gear-name">${esc(g.name)}</div><div class="gear-desc">${esc(g.description)}</div></div><div class="weight">${fmtWeight(g.weight)}</div></div>`).join(''):`<div class="storage-empty">Ingen gear-items her. Drag items hertil fra en anden storage-location.</div>`}</div></div></div>`;
}
function renderStorageNodes(parentId,depth){
  const children=state.storage.filter(s=>(s.parentId||null)===(parentId||null)).sort((a,b)=>{
    if(a.type==='box'&&b.type==='box') return (a.number||0)-(b.number||0);
    if(a.type==='box') return 1; if(b.type==='box') return -1; return storageLabel(a).localeCompare(storageLabel(b),'da');
  });
  return children.map(s=>`<div class="tree-node indent-${Math.min(depth,4)} ${selectedStorageId===s.id?'selected':''}" data-storage-select="${s.id}" data-storage-drop="${s.id}"><div class="tree-left"><span>${iconForType(s.type)}</span><span class="tree-label">${esc(storageLabel(s))}</span></div><span class="tree-count">${directStorageCount(s.id)}</span></div>${renderStorageNodes(s.id,depth+1)}`).join('');
}

