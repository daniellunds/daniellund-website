// Project layer built from the sourced project entries already present in utility profiles.
// Location hierarchy: live PULS plant anchor -> verified town/area anchor -> utility-area fallback.
els.projectControls=$("projectControls");
els.showProjects=$("showProjects");
els.projectsSelectedOnly=$("projectsSelectedOnly");
els.projectCategory=$("projectCategory");
els.projectCount=$("projectCount");
els.projectLegend=$("projectLegend");
state.projects=[];
state.projectLayer=null;
state.projectLocationAnchors=[];
state.projectLocationMeta={};

const PROJECT_CATEGORIES={
  advanced:{label:"Avanceret rensning",short:"4./5. trin"},
  treatment:{label:"Renseanlæg & proces",short:"Rens"},
  climate:{label:"Klima & regnvand",short:"Klima"},
  sewer:{label:"Kloak & separering",short:"Kloak"},
  transport:{label:"Transport & pumpning",short:"Transport"},
  strategy:{label:"Strategi & udvikling",short:"Strategi"}
};

function projectCategoryFor(pr){
  const t=normalize(`${pr.name} ${pr.description||""}`);
  if(/\b(?:4|5)(?: og (?:4|5))? rensetrin\b|fjerde rensetrin|femte rensetrin|ozon|gak|aktivt kul|mikroforur|miljøfremmede|medicinrester|pfas|micropollut/.test(t)) return "advanced";
  if(/renseanlæg|renseanlaeg|centralrense|rensestruktur|slambehandling|slamafvanding|renseproces|rensning/.test(t)) return "treatment";
  if(/skybrud|klima|regnvand|bassin|overløb|overloeb|vandparkering|udløbsledning|udloebsledning/.test(t)) return "climate";
  if(/pumpestation|transportledning|transportrør|transportroer|pumpeledning/.test(t)) return "transport";
  if(/kloak|separat|sanering|ledningsnet|strømpeforing|stroempeforing/.test(t)) return "sewer";
  return "strategy";
}
function projectCategoryMeta(pr){return PROJECT_CATEGORIES[pr.category]||PROJECT_CATEGORIES.strategy;}
function projectPrecisionLabel(v){return v==="anlæg"?"Anlægsplacering via PULS":v==="område"?"Områdeplacering":v==="forsyningsområde"?"Foreløbig placering i forsyningsområdet":"Placering ikke fastlagt";}

async function loadProjectLocations(){
  try{
    const raw=await fetchJSON(`${PROD}/project-locations.json`);
    state.projectLocationAnchors=(raw.anchors||[]).map(a=>({...a,_matches:(a.matches||[a.label]).map(normalize)})).sort((a,b)=>Math.max(...b._matches.map(x=>x.length))-Math.max(...a._matches.map(x=>x.length)));
    state.projectLocationMeta={generatedAt:raw.generatedAt||null,schemaVersion:raw.schemaVersion||1};
  }catch(err){
    console.warn("Projektplaceringer kunne ikke indlæses",err);
    state.projectLocationAnchors=[];
  }
}
function rebuildProjects(){
  const out=[];
  for(const [brandId,p] of state.profiles.entries()){
    for(const [i,pr] of (p.projects||[]).entries()){
      out.push({
        id:`${brandId}:${i}`,
        brandId,
        name:pr.name,
        status:pr.status||"Status ikke oplyst",
        description:pr.description||"",
        url:pr.url||null,
        category:projectCategoryFor(pr)
      });
    }
  }
  state.projects=out.sort((a,b)=>a.name.localeCompare(b.name,"da"));
  if(els.projectCount)els.projectCount.textContent=out.length;
}
function projectPlantAnchor(pr){
  const hay=normalize(`${pr.name} ${pr.description||""}`);
  const compact=hay.replace(/\s+/g,"");
  const stop=new Set(["renseanlæg","renseanlaeg","centralrenseanlæg","centralrenseanlaeg","centralrens","renseværk","rensevaerk","anlæg","anlaeg","spildevand"]);
  let best=null,bestScore=0;
  for(const p of state.plants.filter(x=>x.responsibleBrandId===pr.brandId&&x.coordinates)){
    const pn=normalize(p.name);
    const pc=pn.replace(/\s+/g,"");
    if(pc.length>=5&&compact.includes(pc)) return {lat:p.coordinates[1],lon:p.coordinates[0],label:p.name,precision:"anlæg",strategy:"puls"};
    const tokens=pn.split(" ").filter(x=>x.length>=3&&!stop.has(x));
    if(!tokens.length)continue;
    const hit=tokens.filter(x=>hay.includes(x)).length;
    const score=hit/tokens.length;
    if(hit>=1&&score>bestScore){bestScore=score;best=p;}
  }
  if(best&&bestScore>=.75)return {lat:best.coordinates[1],lon:best.coordinates[0],label:best.name,precision:"anlæg",strategy:"puls"};
  return null;
}
function projectNamedAreaAnchor(pr){
  const hay=normalize(`${pr.name} ${pr.description||""}`);
  for(const a of state.projectLocationAnchors){
    if(a._matches.some(m=>m&&hay.includes(m))) return {lat:a.lat,lon:a.lon,label:a.label,precision:a.precision||"område",strategy:"anchor",sourceUrl:a.sourceUrl||null};
  }
  return null;
}
function deterministicOffset(id){
  let h=0;for(const c of id)h=(h*31+c.charCodeAt(0))>>>0;
  const angle=(h%360)*Math.PI/180, radius=.012+((h>>>8)%8)*.0015;
  return {dLat:Math.sin(angle)*radius,dLon:Math.cos(angle)*radius*1.55};
}
function projectBrandFallback(pr){
  let bounds=null;
  state.polygonLayer?.eachLayer(l=>{
    if(l.feature?.properties?.brandId!==pr.brandId||!l.getBounds)return;
    const b=l.getBounds();bounds=bounds?bounds.extend(b):L.latLngBounds(b);
  });
  let center=bounds?.isValid()?bounds.getCenter():null;
  if(!center){
    const pts=state.plants.filter(p=>p.responsibleBrandId===pr.brandId&&p.coordinates);
    if(pts.length){center=L.latLng(pts.reduce((s,p)=>s+p.coordinates[1],0)/pts.length,pts.reduce((s,p)=>s+p.coordinates[0],0)/pts.length);}
  }
  if(!center)return null;
  const off=deterministicOffset(pr.id);
  const b=state.brandById.get(pr.brandId);
  return {lat:center.lat+off.dLat,lon:center.lng+off.dLon,label:b?.name||"Forsyningsområde",precision:"forsyningsområde",strategy:"fallback"};
}
function projectLocation(pr){return projectPlantAnchor(pr)||projectNamedAreaAnchor(pr)||projectBrandFallback(pr);}
function filteredProjects(){
  const q=normalize(els.search.value);
  const cat=els.projectCategory?.value||"all";
  return state.projects.filter(pr=>{
    const b=state.brandById.get(pr.brandId);const loc=projectLocation(pr);
    const selection=!els.projectsSelectedOnly?.checked||state.selected.has(pr.brandId);
    const category=cat==="all"||pr.category===cat;
    const search=!q||normalize([pr.name,pr.description,pr.status,b?.name,loc?.label,projectCategoryMeta(pr).label].join(" ")).includes(q);
    return selection&&category&&search;
  });
}
function projectMarkerIcon(pr,b){
  return L.divIcon({className:"project-marker-shell",html:`<span class="project-marker" style="--project-color:${profileEscape(b?.color||"#0b7788")}"><i></i></span>`,iconSize:[18,18],iconAnchor:[9,9]});
}
function renderProjects(){
  if(state.projectLayer)state.projectLayer.remove();
  state.projectLayer=L.layerGroup().addTo(state.map);
  const visible=state.tab==="projects"&&!!els.showProjects?.checked;
  let mapped=0;
  if(visible){
    for(const pr of filteredProjects()){
      const loc=projectLocation(pr);if(!loc)continue;mapped++;
      const b=state.brandById.get(pr.brandId);
      const m=L.marker([loc.lat,loc.lon],{icon:projectMarkerIcon(pr,b),pane:"markerPane",keyboard:true}).addTo(state.projectLayer);
      m.bindTooltip(`${pr.name} · ${b?.name||pr.brandId}`);
      m.on("click",()=>openProject(pr));
    }
  }
  if(els.projectLegend)els.projectLegend.hidden=!visible||mapped===0;
  return mapped;
}
function projectRowElement(pr){
  const b=state.brandById.get(pr.brandId);const loc=projectLocation(pr);const meta=projectCategoryMeta(pr);
  const row=document.createElement("button");row.className="project-row";row.dataset.projectId=pr.id;
  row.innerHTML=`<span class="project-list-marker" style="--project-color:${profileEscape(b?.color||"#0b7788")}"></span><span class="row-copy"><strong>${profileEscape(pr.name)}</strong><small>${profileEscape(b?.name||pr.brandId)} · ${profileEscape(meta.short)} · ${profileEscape(loc?.label||"Placering mangler")}</small></span><span class="project-status-mini">${profileEscape(pr.status)}</span>`;
  row.onclick=()=>{openProject(pr);if(loc)state.map.setView([loc.lat,loc.lon],loc.precision==="anlæg"?13:loc.precision==="område"?11:9)};
  return row;
}
function openProject(pr){
  const b=state.brandById.get(pr.brandId);const loc=projectLocation(pr);const meta=projectCategoryMeta(pr);
  const precision=projectPrecisionLabel(loc?.precision);
  els.detailContent.innerHTML=`<header class="detail-head project-detail-head"><span class="detail-kicker">Forsyningsprojekt</span><h2>${profileEscape(pr.name)}</h2><div class="detail-owner">${profileEscape(b?.name||pr.brandId)}</div><span class="project-category-badge">${profileEscape(meta.label)}</span></header><div class="detail-body"><div class="fact-grid"><div class="fact"><span>Status</span><strong>${profileEscape(pr.status)}</strong></div><div class="fact"><span>Kategori</span><strong>${profileEscape(meta.label)}</strong></div><div class="fact"><span>Kortplacering</span><strong>${profileEscape(loc?.label||"Ikke fastlagt")}</strong></div><div class="fact"><span>Præcision</span><strong>${profileEscape(precision)}</strong></div></div><p class="project-description">${profileEscape(pr.description)}</p><div class="project-detail-actions">${pr.url?profileLink(pr.url,"Åbn projektkilde","detail-action primary"):""}<button class="detail-action" type="button" data-project-profile="${profileEscape(pr.brandId)}">Åbn forsyningsprofil</button>${loc?`<button class="detail-action" type="button" data-project-zoom="1">Zoom til projekt</button>`:""}</div>${loc?.precision==="forsyningsområde"?'<p class="source-note"><strong>Bemærk:</strong> Denne markør er en foreløbig placering i forsyningsområdet, fordi projektets konkrete geometri endnu ikke er verificeret. Den må ikke bruges som projekteringsgrundlag.</p>':loc?.precision==="område"?'<p class="source-note"><strong>Kortplacering:</strong> Markøren viser det navngivne projektområde/byområde og ikke nødvendigvis den præcise entreprisegeometri.</p>':'<p class="source-note"><strong>Kortplacering:</strong> Projektet er koblet til renseanlæggets aktuelle PULS-position.</p>'}</div>`;
  els.detailPanel.classList.add("open");els.detailPanel.setAttribute("aria-hidden","false");
  const pb=els.detailContent.querySelector("[data-project-profile]");if(pb)pb.onclick=()=>openBrandProfile(pr.brandId);
  const zb=els.detailContent.querySelector("[data-project-zoom]");if(zb&&loc)zb.onclick=()=>state.map.setView([loc.lat,loc.lon],loc.precision==="anlæg"?14:loc.precision==="område"?12:9);
}
async function initProjects(){
  await loadProjectLocations();
  rebuildProjects();
  renderProjects();
  renderList();
  console.info("UTILITY_PROJECTS_READY",{projects:state.projects.length,anchors:state.projectLocationAnchors.length});
}

// Re-evaluate project placement as polygons and live PULS positions become available.
const coreRenderPolygonsForProjects=renderPolygons;
renderPolygons=function(){coreRenderPolygonsForProjects();if(state.projects.length)renderProjects();};
const coreRenderPlantsForProjects=renderPlants;
renderPlants=function(){coreRenderPlantsForProjects();if(state.projects.length)renderProjects();};
