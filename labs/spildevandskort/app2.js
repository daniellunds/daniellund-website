function regionForBrand(b){
  if(VIRTUAL_BRAND_REGION[b.id]) return VIRTUAL_BRAND_REGION[b.id];
  const counts=new Map();
  for(const municipality of b.municipalities||[]){
    const region=REGION_BY_MUNICIPALITY.get(normalizeRegionKey(municipality));
    if(region) counts.set(region,(counts.get(region)||0)+1);
  }
  if(!counts.size) return "sjaelland";
  return [...counts.entries()].sort((a,b)=>b[1]-a[1] || LANDDELE.findIndex(r=>r.id===a[0])-LANDDELE.findIndex(r=>r.id===b[0]))[0][0];
}
function brandRowElement(b){
  const row=document.createElement("label"); row.className="brand-row";
  const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=state.selected.has(b.id);
  cb.addEventListener("change",()=>{cb.checked?state.selected.add(b.id):state.selected.delete(b.id);renderPolygons();renderPlants();renderList();});
  const sw=document.createElement("span");sw.className="brand-swatch";sw.style.background=b.color||"#6d98a3";
  const cp=document.createElement("span");cp.className="row-copy";
  const geography=b.sourceFeatureCount===0?"Anlægsejer · uden eget oplandslag":(b.municipalities?.length===1?b.municipalities[0]:`${b.municipalities?.length||0} kommuner`);
  const plants=activePlantCountForBrand(b.id);
  cp.innerHTML=`<strong>${b.name}</strong><small>${geography} · ${plants} aktive renseanlæg</small>`;
  row.append(cb,sw,cp); return row;
}
function setRegionSelection(regionId,selected){
  for(const b of state.brands){ if(regionForBrand(b)!==regionId) continue; selected?state.selected.add(b.id):state.selected.delete(b.id); }
  renderPolygons();renderPlants();renderList();
}
function renderBrandGroups(rows,q){
  const byRegion=new Map(LANDDELE.map(r=>[r.id,[]]));
  for(const b of rows){ const region=regionForBrand(b); if(!byRegion.has(region))byRegion.set(region,[]); byRegion.get(region).push(b); }
  for(const region of LANDDELE){
    const brands=byRegion.get(region.id)||[]; if(!brands.length)continue;
    const selectedCount=brands.filter(b=>state.selected.has(b.id)).length;
    const group=document.createElement("section");group.className="region-group";group.dataset.region=region.id;
    const bar=document.createElement("div");bar.className="region-bar";
    const collapsed=!q&&state.collapsedRegions.has(region.id);
    const toggle=document.createElement("button");toggle.type="button";toggle.className="region-toggle";toggle.setAttribute("aria-expanded",String(!collapsed));
    toggle.innerHTML=`<span class="region-chevron">${collapsed?"▸":"▾"}</span><span class="region-name">${region.name}</span><span class="region-meta">${brands.length} · ${selectedCount} valgt</span>`;
    toggle.onclick=()=>{state.collapsedRegions.has(region.id)?state.collapsedRegions.delete(region.id):state.collapsedRegions.add(region.id);renderList();};
    const actions=document.createElement("div");actions.className="region-actions";
    const all=document.createElement("button");all.type="button";all.textContent="Alle";all.title=`Vælg alle i ${region.name}`;all.onclick=()=>setRegionSelection(region.id,true);
    const none=document.createElement("button");none.type="button";none.textContent="Ingen";none.title=`Fravælg alle i ${region.name}`;none.onclick=()=>setRegionSelection(region.id,false);
    actions.append(all,none);bar.append(toggle,actions);group.append(bar);
    if(!collapsed){ const items=document.createElement("div");items.className="region-items";for(const b of brands)items.append(brandRowElement(b));group.append(items); }
    els.itemList.append(group);
  }
}

function renderList(){
  const q=normalize(els.search.value); els.itemList.innerHTML="";
  if(state.tab==="brands"){
    const rows=state.brands.filter(b=>!q||normalize([b.name,...(b.municipalities||[]),LANDDELE.find(r=>r.id===regionForBrand(b))?.name].join(" ")).includes(q));
    els.listHeading.textContent="Forsyninger efter landsdel"; els.visibleCount.textContent=`${rows.length} vist`;
    renderBrandGroups(rows,q);
    if(!rows.length)els.itemList.innerHTML='<div class="empty">Ingen forsyninger matcher søgningen.</div>';
  } else {
    const rows=filteredPlants();els.listHeading.textContent="Renseanlæg";els.visibleCount.textContent=`${rows.length} vist`;
    for(const p of rows){
      const b=p.responsibleBrandId?state.brandById.get(p.responsibleBrandId):null;
      const row=document.createElement("button");row.className="plant-row";
      row.innerHTML=`<span class="plant-dot ${p.active?"":"closed"}" style="${p.active&&b?.color?`background:${b.color}`:""}"></span><span class="row-copy"><strong>${p.name}</strong><small>${b?`Ansvarlig: ${b.name}`:p.owner} · ${fmtPE(p.capacity)}</small></span>`;
      row.onclick=()=>{openPlant(p);if(p.coordinates)state.map.setView([p.coordinates[1],p.coordinates[0]],13)};els.itemList.append(row);
    }
    if(!rows.length)els.itemList.innerHTML='<div class="empty">Ingen renseanlæg matcher de valgte filtre.</div>';
  }
}
function openPlant(p){
  const b=p.responsibleBrandId?state.brandById.get(p.responsibleBrandId):null;
  els.detailContent.innerHTML=`<header class="detail-head"><span class="detail-kicker">PULS renseanlæg</span><h2>${p.name}</h2><div class="detail-owner">${b?`Ansvarlig forsyning: ${b.name}`:p.owner}</div></header><div class="detail-body"><div class="fact-grid"><div class="fact"><span>Ansvarlig forsyning</span><strong>${b?.name||"Ikke sikkert koblet"}</strong></div><div class="fact"><span>Registreret ejer i PULS</span><strong>${p.owner}</strong></div><div class="fact"><span>Status</span><strong>${p.active?"Aktivt":p.status}</strong></div><div class="fact"><span>Kapacitet</span><strong>${fmtPE(p.capacity)}</strong></div><div class="fact"><span>Godkendt belastning</span><strong>${fmtPE(p.approvedLoad)}</strong></div><div class="fact"><span>Rensetype</span><strong>${fmt(p.treatmentType)}</strong></div><div class="fact"><span>Myndighed</span><strong>${fmt(p.authority)}</strong></div><div class="fact"><span>Kommune</span><strong>${fmt(p.municipality)}</strong></div><div class="fact"><span>Seneste udledningsår</span><strong>${fmt(p.latestYear)}</strong></div><div class="fact"><span>Spildevandsmængde</span><strong>${fmtVolume(p.latestVolume)}</strong></div></div>${b?`<button class="detail-action" data-brand="${b.id}">Se ${b.name} og tilknyttede anlæg</button>`:'<p class="source-note">Anlægget er ikke sikkert koblet til et forsyningsselskab endnu. PULS-ejeren vises derfor uden gæt.</p>'}<p class="source-note"><strong>Datakilde:</strong> PULS, Danmarks Miljøportal. PULS-ejeren bevares urørt; koblingen til ansvarlig forsyning er et separat, kurateret felt.</p></div>`;
  els.detailPanel.classList.add("open");els.detailPanel.setAttribute("aria-hidden","false");
  const btn=els.detailContent.querySelector("[data-brand]");if(btn)btn.onclick=()=>zoomBrand(btn.dataset.brand);
}
function openArea(p){ els.detailContent.innerHTML=`<header class="detail-head"><span class="detail-kicker">Vedtaget kloakopland</span><h2>${fmt(p.brand||state.brandById.get(p.brandId)?.name)}</h2><div class="detail-owner">${fmt(p.municipality)}</div></header><div class="detail-body"><div class="fact-grid"><div class="fact"><span>Lokal forsyning</span><strong>${fmt(p.localBrand)}</strong></div><div class="fact"><span>Kloaktype</span><strong>${fmt(p.displayType)}</strong></div><div class="fact"><span>Plan</span><strong>${fmt(p.planTitle)}</strong></div><div class="fact"><span>Planstatus</span><strong>${fmt(p.planStatus)}</strong></div></div><p class="source-note"><strong>Datakilde:</strong> Plandata, vedtagne kloakoplande.</p></div>`;els.detailPanel.classList.add("open");els.detailPanel.setAttribute("aria-hidden","false"); }
function closeDetail(){els.detailPanel.classList.remove("open");els.detailPanel.setAttribute("aria-hidden","true")}
function zoomBrand(id){
  const layers=[];
  state.polygonLayer?.eachLayer(l=>{if(l.feature?.properties?.brandId===id)layers.push(l)});
  const plantPoints=state.plants.filter(p=>p.responsibleBrandId===id&&p.coordinates).map(p=>L.latLng(p.coordinates[1],p.coordinates[0]));
  if(layers.length){ const g=L.featureGroup(layers); for(const pt of plantPoints)L.marker(pt,{opacity:0}).addTo(g); state.map.fitBounds(g.getBounds(),{padding:[30,30]}); }
  else if(plantPoints.length){ state.map.fitBounds(L.latLngBounds(plantPoints),{padding:[30,30],maxZoom:11}); }
  closeDetail();
}

function bindUI(){
  document.querySelectorAll(".tab").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===btn));state.tab=btn.dataset.tab;els.brandControls.hidden=state.tab!=="brands";els.plantControls.hidden=state.tab!=="plants";els.search.placeholder=state.tab==="plants"?"Søg renseanlæg, ejer eller myndighed…":"Søg forsyning eller kommune…";els.search.value="";renderList()});
  els.search.oninput=()=>{renderList();if(state.tab==="plants")renderPlants()}; [els.showPlants,els.includeClosed,els.selectedOnly].forEach(x=>x.onchange=()=>{renderPlants();renderList()});
  els.selectAll.onclick=()=>{state.selected=new Set(state.brands.map(b=>b.id));renderPolygons();renderPlants();renderList()};els.selectNone.onclick=()=>{state.selected.clear();renderPolygons();renderPlants();renderList()};els.zoomSelected.onclick=()=>{const g=L.featureGroup();state.polygonLayer?.eachLayer(l=>g.addLayer(l));if(g.getLayers().length)state.map.fitBounds(g.getBounds(),{padding:[20,20]})};els.closeDetail.onclick=closeDetail;
}
async function init(){
  try{
    state.map=L.map("map",{zoomControl:true,minZoom:5}).setView([56.15,10.0],7);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(state.map);bindUI();await Promise.all([loadBrands(),loadAliases()]);renderList();
    const results=await Promise.allSettled([loadPolygons(),loadPlants()]); const failed=results.filter(x=>x.status==="rejected"); if(failed.length){console.error(failed);status(`Kortet er delvist indlæst: ${failed.map(x=>x.reason?.message||"ukendt fejl").join(" · ")}`,true);} else status(""); els.mapStatus.hidden=true;
  }catch(e){console.error(e);els.mapStatus.textContent="Kortet kunne ikke indlæses";status(`Indlæsningsfejl: ${e.message}`,true);}
}
init();
