function renderTripsPage(){
  const trip=activeTrip();
  const actions=`<button class="btn" data-action="new-trip">＋ <span class="hide-mobile">Ny tur</span></button><button class="btn primary" data-action="open-gear">◇ <span class="hide-mobile">Gear Pool</span></button>`;
  if(!trip){
    return `${topbar('Trips','Planlæg, pak, pak hjem — og behold historikken.',actions)}
      ${renderTripsHub(null)}`;
  }
  return `${topbar(trip.name,tripDateLabel(trip),actions)}${renderTripModeNav(trip)}${renderWorkspace(trip,'trip')}${renderTripHistory(trip.id)}`;
}

function tripDateLabel(t){
  if(!t.date) return t.archived?'Arkiveret tur':'Ingen dato';
  if(t.endDate && t.endDate!==t.date) return `${fmtDate(t.date)} – ${fmtDate(t.endDate)}`;
  return fmtDate(t.date);
}

function renderTripsHub(activeId){
  const upcoming=sortedTrips(false), past=sortedTrips(true);
  if(!state.trips.length){
    return `<div class="empty-state trail-empty"><div class="empty-kicker">PACK · GO · RETURN</div><h3>Din næste tur starter her</h3><p>Opret en tur fra en template eller start tomt. Gear Pool er klar med dine importerede items.</p><button class="btn primary" data-action="new-trip">＋ Opret første tur</button></div>`;
  }
  return `<div class="trip-hub-grid"><section><div class="section-kicker">Upcoming</div><div class="history-grid">${upcoming.map(t=>renderHistoryCard(t,activeId)).join('')||'<div class="quiet-card">Ingen kommende ture.</div>'}</div></section><section><div class="section-kicker">Past trips</div><div class="history-grid">${past.map(t=>renderHistoryCard(t,activeId)).join('')||'<div class="quiet-card">Historikken vokser, når dine ture er afsluttet.</div>'}</div></section></div>`;
}

function renderTripHistory(activeId){
  const others=state.trips.filter(t=>t.id!==activeId);
  if(!others.length) return '';
  const upcoming=sortedTrips(false).filter(t=>t.id!==activeId), past=sortedTrips(true).filter(t=>t.id!==activeId);
  return `<section class="trip-history"><div class="history-head"><div><div class="section-kicker">Trip history</div><h2>Tidligere og kommende pakkelister</h2></div></div><div class="trip-hub-grid">${upcoming.length?`<section><div class="micro-label">Upcoming</div><div class="history-grid">${upcoming.map(t=>renderHistoryCard(t,activeId)).join('')}</div></section>`:''}${past.length?`<section><div class="micro-label">Past</div><div class="history-grid">${past.map(t=>renderHistoryCard(t,activeId)).join('')}</div></section>`:''}</div></section>`;
}

function renderHistoryCard(t,activeId){
  const totals=workspaceTotals(t), returned=itemReturnedStats(t);
  return `<article class="history-card ${t.id===activeId?'active':''}"><div class="history-card-top"><div><div class="history-title">${esc(t.name)}</div><div class="history-date">${esc(tripDateLabel(t))}</div></div><span class="history-state">${tripIsPast(t)?'Past':'Upcoming'}</span></div><div class="history-numbers"><span><b>${t.items.length}</b> items</span><span><b>${fmtWeight(totals.base)}</b> base</span>${tripIsPast(t)&&returned.total?`<span><b>${returned.returned}/${returned.total}</b> returned</span>`:''}</div><div class="card-actions"><button class="btn small primary" data-action="select-trip" data-trip="${t.id}">Åbn</button><button class="btn small" data-action="copy-trip" data-trip="${t.id}">Kopiér</button></div></article>`;
}

function renderTripModeNav(trip){
  const totals=workspaceTotals(trip), returned=itemReturnedStats(trip);
  return `<div class="mode-strip" role="tablist" aria-label="Trip mode">
    <button class="mode-btn ${tripMode==='plan'?'active':''}" data-action="trip-mode" data-mode="plan"><span>01</span>Planlæg</button>
    <button class="mode-btn ${tripMode==='pack'?'active':''}" data-action="trip-mode" data-mode="pack"><span>02</span>Pak <em>${totals.packed}/${totals.count}</em></button>
    <button class="mode-btn ${tripMode==='return'?'active':''}" data-action="trip-mode" data-mode="return"><span>03</span>Pak hjem <em>${returned.returned}/${returned.total}</em></button>
  </div>`;
}

function renderWorkspace(ws,mode){
  const totals=workspaceTotals(ws), pct=totals.count?Math.round(100*totals.packed/totals.count):0;
  if(mode==='trip'){
    return `${renderWeightOverview(ws,totals,pct)}${renderTripToolbarV2(ws)}${tripMode==='return'?renderReturnView(ws):`<div class="category-list">${(ws.categories||DEFAULT_CATEGORIES).map((cat,i)=>renderCategoryV2(ws,cat,tripMode,i)).join('')}</div>`}`;
  }
  return `${renderWeightOverview(ws,totals,0,true)}<div class="trip-toolbar"><div class="trip-toolbar-left"><span class="hint">Drag gear fra Gear Pool til en kategori.</span></div><div class="trip-toolbar-right"><button class="btn small" data-action="rename-template">Redigér template</button><button class="btn small" data-action="add-category">＋ Kategori</button></div></div><div class="category-list">${(ws.categories||DEFAULT_CATEGORIES).map((cat,i)=>renderCategoryV2(ws,cat,'plan',i,'template')).join('')}</div>`;
}

function renderWeightOverview(ws,totals,pct,isTemplate=false){
  const rows=categoryWeights(ws), total=rows.reduce((s,x)=>s+x.weight,0);
  return `<section class="weight-overview">
    <div class="weight-primary">
      <div class="weight-stat"><span>${isTemplate?'Items':'Base weight'}</span><strong>${isTemplate?totals.count:fmtWeight(totals.base)}</strong>${!isTemplate?'<small>uden worn + consumables</small>':''}</div>
      <div class="weight-stat"><span>Total</span><strong>${fmtWeight(totals.total)}</strong><small>${fmtWeight(totals.worn)} worn · ${fmtWeight(totals.consumable)} consumable</small></div>
      ${!isTemplate?`<div class="weight-stat packing-stat"><span>Packed</span><strong>${pct}%</strong><small>${totals.packed} af ${totals.count} items</small><div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div></div>`:''}
    </div>
    <div class="weight-chart-card">
      <div class="donut" role="img" aria-label="Vægtfordeling efter kategori" style="background:${donutGradient(ws)}"><div class="donut-hole"><span>Gear</span><strong>${fmtWeight(total)}</strong></div></div>
      <div class="weight-legend">${rows.slice(0,7).map(r=>{const m=categoryMeta(r.cat,r.index),share=total?Math.round(r.weight/total*100):0;return `<div class="legend-row"><span class="legend-dot" style="background:${m.color}"></span><span class="legend-label">${esc(m.label)}</span><b>${share}%</b><span>${fmtWeight(r.weight)}</span></div>`}).join('')||'<div class="legend-empty">Tilføj gear for at se vægtfordelingen.</div>'}</div>
    </div>
  </section>`;
}

function renderTripToolbarV2(ws){
  const select=`<select class="select" id="trip-select">${state.trips.map(t=>`<option value="${t.id}" ${t.id===ws.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select>`;
  const modeHint=tripMode==='plan'?'Sammensæt turen. Drag gear til kategorier.':tripMode==='pack'?'Pak fra listen. Storage vises, når du har brug for det.':'Læg alt tilbage på sin faste plads.';
  return `<div class="trip-toolbar"><div class="trip-toolbar-left">${select}<span class="hint">${modeHint}</span></div><div class="trip-toolbar-right">${tripMode==='pack'?'<button class="btn small" data-action="reset-packed">Nulstil packed</button>':''}${tripMode==='return'?'<button class="btn small" data-action="reset-returned">Nulstil returned</button>':''}<button class="btn small" data-action="edit-trip">Redigér tur</button>${tripMode==='plan'?'<button class="btn small" data-action="add-category">＋ Kategori</button>':''}</div></div>`;
}

function renderCategoryV2(ws,cat,mode,index,workspaceMode='trip'){
  const items=(ws.items||[]).filter(i=>i.category===cat).sort((a,b)=>(a.order||0)-(b.order||0));
  const cp=categoryPacked(ws,cat), meta=categoryMeta(cat,index);
  return `<section class="category category-accent" style="--cat:${meta.color}" data-drop-category="${esc(cat)}">
    <div class="category-head"><div class="category-title-wrap"><span class="category-swatch"></span><div class="category-name">${esc(cat)}</div></div><div class="category-meta">${mode==='pack'?`${cp.packed} / ${cp.total} packed`:`${items.length} items`}</div><div class="category-weight">${fmtWeight(categoryWeight(ws,cat))}</div></div>
    <div class="category-body">${items.length?items.map(item=>renderTripItemV2(item,mode,workspaceMode)).join(''):`<div class="empty-drop">${mode==='plan'?'Drop gear her':'Ingen items'}</div>`}</div>
  </section>`;
}

function renderTripItemV2(item,mode,workspaceMode='trip'){
  const g=gearById(item.gearId); if(!g) return '';
  const packed=workspaceMode==='trip'&&mode==='pack'&&item.packed;
  const plan=mode==='plan'||workspaceMode==='template';
  return `<div class="trip-row v2 ${packed?'packed':''}" draggable="${plan?'true':'false'}" data-trip-item="${item.id}">
    ${plan?'<span class="row-plan-dot">⋮⋮</span>':`<button class="pack-toggle" data-action="toggle-packed" data-item="${item.id}" aria-label="${packed?'Markér ikke pakket':'Markér pakket'}">${packed?'✓':''}</button>`}
    <div class="row-main"><button class="gear-link" data-action="open-gear-detail" data-gear="${g.id}">${esc(g.name)}</button><div class="gear-desc">${esc(g.model||g.description||'')}</div><div class="badge-row">${item.worn?'<span class="badge worn">worn</span>':''}${item.consumable?'<span class="badge consumable">consumable</span>':''}${g.weight===0?'<span class="badge warning">missing weight</span>':''}${mode==='pack'&&g.storageId?`<span class="storage-pill">⌂ ${esc(storagePath(g.storageId))}</span>`:''}</div></div>
    <div class="row-weight">${fmtWeight(g.weight)}</div>
    <button class="row-menu" data-action="edit-workspace-item" data-item="${item.id}" title="Redigér">•••</button>
  </div>`;
}

function renderReturnView(ws){
  const stats=itemReturnedStats(ws), pct=stats.total?Math.round(stats.returned/stats.total*100):0;
  const groups=new Map();
  (ws.items||[]).forEach(item=>{const g=gearById(item.gearId);if(!g)return;const key=g.storageId||'unassigned';if(!groups.has(key))groups.set(key,[]);groups.get(key).push({item,g});});
  const ordered=[...groups.entries()].sort((a,b)=>storageSortKey(a[0]).localeCompare(storageSortKey(b[0]),'da'));
  return `<section class="return-shell"><div class="return-hero ${pct===100?'complete':''}"><div><div class="section-kicker">PACK HOME</div><h2>${pct===100?'Everything made it home.':'Få alt tilbage på sin plads'}</h2><p>${stats.returned} af ${stats.total} gear-items er lagt tilbage.</p></div><div class="return-ring"><strong>${pct}%</strong></div></div><div class="return-groups">${ordered.map(([key,arr])=>{const done=arr.filter(x=>x.item.returned).length;return `<section class="return-group"><div class="return-group-head"><div><span class="box-icon">□</span><strong>${esc(key==='unassigned'?'Unassigned':storagePath(key))}</strong></div><span>${done}/${arr.length}</span></div>${arr.map(({item,g})=>`<div class="return-row ${item.returned?'returned':''}"><button class="return-toggle" data-action="toggle-returned" data-item="${item.id}">${item.returned?'✓':''}</button><div><button class="gear-link" data-action="open-gear-detail" data-gear="${g.id}">${esc(g.name)}</button><div class="gear-desc">${esc(item.category)}</div></div><span class="row-weight">${fmtWeight(g.weight)}</span></div>`).join('')}</section>`}).join('')}</div></section>`;
}

function renderGearPage(){
  const visible=filteredGear();
  return `${topbar('Gear','Din permanente samling — søg, filtrér og klik ind på hvert item.',`<button class="btn" data-action="export-backup">↓ Backup</button><button class="btn primary" data-action="new-gear">＋ Gear</button>`)}
    <div class="panel"><div class="searchbar"><input class="input search-input" id="gear-search-page" placeholder="Søg navn, model, butik eller note…" value="${esc(gearQuery)}"><select class="input" id="gear-category-page"><option value="all">Alle kategorier</option>${DEFAULT_CATEGORIES.map(c=>`<option value="${esc(c)}" ${gearCategoryFilter===c?'selected':''}>${esc(c)}</option>`).join('')}</select><select class="input" id="gear-storage-page"><option value="all">Alle storage</option><option value="unassigned" ${gearStorageFilter==='unassigned'?'selected':''}>Unassigned</option>${state.storage.map(s=>`<option value="${s.id}" ${gearStorageFilter===s.id?'selected':''}>${esc(storagePath(s.id))}</option>`).join('')}</select></div>
    <div class="gear-table v2"><div class="gear-table-row header"><div>Gear</div><div>Detaljer</div><div>Vægt</div><div>Storage</div><div>Brugt</div></div>${visible.map(g=>{const u=gearUsageStats(g.id);return `<div class="gear-table-row gear-click-row" data-action="open-gear-detail" data-gear="${g.id}"><div><div class="gear-name">${esc(g.name)}</div><div class="badge-row"><span class="badge">${esc(g.defaultCategory)}</span>${g.weight===0?'<span class="badge warning">missing weight</span>':''}</div></div><div class="gear-desc">${esc([g.brand,g.model||g.description].filter(Boolean).join(' · '))}</div><div class="${g.weight===0?'missing-weight':''}">${fmtWeight(g.weight)}</div><div class="row-storage">${esc(storagePath(g.storageId))}</div><div class="usage-cell"><b>${u.past}</b><span>ture</span></div></div>`}).join('')}</div><div class="panel-sub" style="margin-top:10px">Viser ${visible.length} af ${state.gear.filter(g=>!g.archived).length} items.</div></div>`;
}

const renderModalV1 = renderModal;
renderModal = function(){
  if(!modal) return '';
  if(modal.type==='gear' || modal.type==='gear-detail'){
    const g=modal.gearId?gearById(modal.gearId):null, u=g?gearUsageStats(g.id):{past:0,last:null,trips:[]};
    const title=g?g.name:'Nyt gear';
    const close=`<button class="btn small" data-action="close-modal">✕</button>`;
    return modalShell(title,close,`<form id="gear-form" class="gear-detail-form"><input type="hidden" name="id" value="${esc(g?.id||'')}"><div class="gear-detail-layout"><div class="gear-media"><div class="gear-photo">${g?.imageUrl?`<img src="${esc(g.imageUrl)}" alt="${esc(g.name)}" onerror="this.parentElement.classList.add('image-error');this.remove()">`:'<div class="photo-placeholder"><span>◇</span><small>Tilføj billede-URL</small></div>'}</div>${g?`<div class="usage-summary"><div><strong>${u.past}</strong><span>tidligere ture</span></div><div><strong>${u.last?fmtDate(u.last.date):'—'}</strong><span>senest brugt</span></div></div>`:''}</div><div class="gear-fields"><div class="form-grid"><div class="field full"><label class="label">Navn</label><input class="input" name="name" value="${esc(g?.name||'')}" required></div><div class="field"><label class="label">Brand</label><input class="input" name="brand" value="${esc(g?.brand||'')}"></div><div class="field"><label class="label">Model</label><input class="input" name="model" value="${esc(g?.model||'')}"></div><div class="field"><label class="label">Vægt (g)</label><input class="input" name="weight" type="number" min="0" step="1" value="${g?.weight??0}" required></div><div class="field"><label class="label">Kategori</label><select class="input" name="category">${DEFAULT_CATEGORIES.map(c=>`<option ${g?.defaultCategory===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="field full"><label class="label">Storage</label><select class="input" name="storage"><option value="">Unassigned</option>${state.storage.map(s=>`<option value="${s.id}" ${g?.storageId===s.id?'selected':''}>${esc(storagePath(s.id))}</option>`).join('')}</select></div><div class="field"><label class="label">Pris</label><input class="input" name="price" type="number" min="0" step="0.01" value="${esc(g?.price||'')}"></div><div class="field"><label class="label">Valuta</label><input class="input" name="currency" value="${esc(g?.currency||'DKK')}" maxlength="4"></div><div class="field"><label class="label">Købsdato</label><input class="input" name="purchaseDate" type="date" value="${esc(g?.purchaseDate||'')}"></div><div class="field"><label class="label">Købt hos</label><input class="input" name="purchasedFrom" value="${esc(g?.purchasedFrom||'')}"></div><div class="field full"><label class="label">Produktlink</label><input class="input" name="url" type="url" value="${esc(g?.url||'')}" placeholder="https://..."></div><div class="field full"><label class="label">Billede-URL</label><input class="input" name="imageUrl" type="url" value="${esc(g?.imageUrl||'')}" placeholder="https://..."></div><div class="field full"><label class="label">Kvittering / dokumentlink</label><input class="input" name="receiptUrl" type="url" value="${esc(g?.receiptUrl||'')}" placeholder="https://..."></div><div class="field full"><label class="label">Beskrivelse</label><input class="input" name="description" value="${esc(g?.description||'')}"></div><div class="field full"><label class="label">Noter</label><textarea class="input" name="notes">${esc(g?.notes||'')}</textarea></div></div></div></div>${g&&u.trips.length?`<div class="usage-history"><div class="section-kicker">Usage history</div>${u.trips.slice(0,8).map(t=>`<button type="button" class="usage-trip" data-action="select-trip" data-trip="${t.id}"><span>${esc(t.name)}</span><small>${esc(tripDateLabel(t))}</small></button>`).join('')}</div>`:''}<div class="modal-actions">${g?`<button type="button" class="btn danger" data-action="archive-gear" data-gear="${g.id}">Arkivér</button>`:''}<button class="btn primary">Gem gear</button></div></form>`,'gear-detail-modal');
  }
  if(modal.type==='edit-trip'){
    const t=activeTrip(), close=`<button class="btn small" data-action="close-modal">✕</button>`;
    return modalShell('Redigér tur',close,`<form id="edit-trip-form"><div class="form-grid"><div class="field full"><label class="label">Navn</label><input class="input" name="name" value="${esc(t.name)}" required></div><div class="field"><label class="label">Startdato</label><input class="input" name="date" type="date" value="${esc(t.date||'')}"></div><div class="field"><label class="label">Slutdato</label><input class="input" name="endDate" type="date" value="${esc(t.endDate||'')}"></div></div><div class="modal-actions"><button type="button" class="btn danger" data-action="delete-trip">Slet tur</button><button type="button" class="btn" data-action="archive-trip">${t.archived?'Markér som kommende':'Arkivér tur'}</button><button class="btn primary">Gem</button></div></form>`);
  }
  if(modal.type==='new-trip'){
    const close=`<button class="btn small" data-action="close-modal">✕</button>`;
    return modalShell('Ny tur',close,`<form id="new-trip-form"><div class="form-grid"><div class="field full"><label class="label">Navn</label><input class="input" name="name" placeholder="Fx West Highland Way 2027" required autofocus></div><div class="field"><label class="label">Startdato</label><input class="input" name="date" type="date"></div><div class="field"><label class="label">Slutdato</label><input class="input" name="endDate" type="date"></div><div class="field full"><label class="label">Startpunkt</label><select class="input" name="template"><option value="empty">Tom liste</option>${state.templates.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}<option value="copy">Kopiér nuværende trip</option></select></div></div><div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annullér</button><button class="btn primary">Opret tur</button></div></form>`);
  }
  return renderModalV1();
};

const modalShellV1 = modalShell;
modalShell = function(title,close,body,extraClass=''){ return `<div class="modal-backdrop"><div class="modal ${extraClass}"><div class="modal-head"><div class="modal-title">${esc(title)}</div>${close}</div><div class="modal-body">${body}</div></div></div>`; };

filteredGear = function(){
  const q=gearQuery.trim().toLowerCase();
  return state.gear.filter(g=>!g.archived)
    .filter(g=>!q || `${g.name} ${g.description||''} ${g.notes||''} ${g.brand||''} ${g.model||''} ${g.purchasedFrom||''}`.toLowerCase().includes(q))
    .filter(g=>gearCategoryFilter==='all'||g.defaultCategory===gearCategoryFilter)
    .filter(g=>gearStorageFilter==='all'||(gearStorageFilter==='unassigned'?!g.storageId:g.storageId===gearStorageFilter));
};
