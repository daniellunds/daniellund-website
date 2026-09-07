// Project layer built from the sourced project entries already present in utility profiles.
// Only reviewed geometry or explicit location evidence may place a project on the map.
els.projectControls=$("projectControls");
els.showProjects=$("showProjects");
els.projectsSelectedOnly=$("projectsSelectedOnly");
els.projectCategory=$("projectCategory");
els.projectCount=$("projectCount");
els.projectGeometryFilter=$("projectGeometryFilter");
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
function projectReview(pr){
  const row=state.projectGeography?.get(pr.id);
  return row?.name===pr.name?row:null;
}
function projectGeometryKey(pr){
  const review=projectReview(pr);
  if(!review)return null;
  return review.geometryKey||state.projectGeometryByProject?.get(pr.id)||null;
}
function projectGeometry(pr){
  const key=projectGeometryKey(pr);
  return key?state.projectGeometries?.get(key)||null:null;
}
function projectGeometryPrecision(geometry){return geometry?.metadata?.precision==="schematic"?"schematic":"source";}
function projectGeometryKind(geometry){
  const declared=geometry?.metadata?.geometryKind;
  if(["area","route","point"].includes(declared))return declared;
  const types=new Set((geometry?.features||[]).map(f=>f.geometry?.type));
  if(types.has("Polygon")||types.has("MultiPolygon"))return "area";
  if(types.has("LineString")||types.has("MultiLineString"))return "route";
  return "point";
}
function projectGeometryListLabel(geometry){
  const schematic=projectGeometryPrecision(geometry)==="schematic",kind=projectGeometryKind(geometry);
  if(kind==="area")return schematic?"Skematisk projektområde":"Offentliggjort projektområde";
  if(kind==="point")return schematic?"Skematisk anlægsplacering":"Dokumenteret anlægsplacering";
  return schematic?"Skematisk tracé":"Dokumenteret tracé";
}
function projectGeometryPrecisionLabel(geometry){
  const schematic=projectGeometryPrecision(geometry)==="schematic",kind=projectGeometryKind(geometry);
  if(kind==="area")return schematic?"Skematisk, kildebaseret projektområde":"Offentliggjort projektområde";
  if(kind==="point")return schematic?"Skematisk, kildebaseret anlægsplacering":"Offentliggjort anlægsgeometri";
  return schematic?"Skematisk, kildebaseret tracé":"Offentliggjort projektgeometri";
}
function projectHasMapGeometry(pr){return !!(projectGeometry(pr)||projectLocation(pr));}
function projectGeometryLabel(pr){
  return {point:"Punkt",line:"Linje",polygon:"Område / polygon",unresolved:"Geometri ikke afklaret"}[projectReview(pr)?.geometryType]||"Ikke klassificeret";
}
function projectAllowsAreaAnchor(pr){
  const r=projectReview(pr);
  return !!r&&!r.withholdAnchor&&(r.geometryType==="polygon"||!!r.anchorLabel);
}
function projectPlantAnchor(pr){
  const r=projectReview(pr);
  if(r?.geometryType!=="point"||!r.pulsId)return null;
  const p=state.plants.find(p=>p.id===r.pulsId&&p.active&&p.name===r.pulsName&&p.coordinates);
  if(!p)return null;
  return {lat:p.coordinates[1],lon:p.coordinates[0],label:p.name,precision:"anlæg",strategy:"puls",sourceUrl:"https://arealdata.miljoeportal.dk/datasets/urn:dmp:ds:renseanlaeg-stamdata"};
}
function projectNamedAreaAnchor(pr){
  if(!projectAllowsAreaAnchor(pr))return null;
  const r=projectReview(pr),hay=normalize(pr.name);
  for(const a of state.projectLocationAnchors){
    if(r.anchorLabel?a.label===r.anchorLabel:a._matches.some(m=>m&&(` ${hay} `).includes(` ${m} `)))
      return {lat:a.lat,lon:a.lon,label:a.label,precision:"område",strategy:"anchor",sourceUrl:a.sourceUrl||null};
  }
  return null;
}
function projectLocation(pr){return projectPlantAnchor(pr)||projectNamedAreaAnchor(pr)||null;}
function zoomProject(pr){
  const geometry=projectGeometry(pr),loc=projectLocation(pr);
  if(geometry){state.map.fitBounds(L.geoJSON(geometry).getBounds(),{padding:[30,30],maxZoom:14});return;}
  if(loc)state.map.setView([loc.lat,loc.lon],loc.precision==="anlæg"?14:12);
}
function filteredProjects(){
  const q=normalize(els.search.value);
  const cat=els.projectCategory?.value||"all";
  return state.projects.filter(pr=>{
    const b=state.brandById.get(pr.brandId),loc=projectLocation(pr),geometry=projectGeometry(pr);
    const selection=!els.projectsSelectedOnly?.checked||state.selected.has(pr.brandId);
    const category=cat==="all"||pr.category===cat;
    const kind=els.projectGeometryFilter?.value||"all";
    const geometryMatch=kind==="all"||(kind==="unmapped"?!projectHasMapGeometry(pr):projectReview(pr)?.geometryType===kind);
    const search=!q||normalize([pr.name,pr.description,pr.status,b?.name,loc?.label,geometry?.metadata?.locationLabel,projectGeometryListLabel(geometry),projectCategoryMeta(pr).label].join(" ")).includes(q);
    return selection&&category&&geometryMatch&&search;
  });
}
function projectMarkerIcon(pr,b){
  return L.divIcon({className:"project-marker-shell",html:`<span class="project-marker" style="--project-color:${profileEscape(b?.color||"#0b7788")}"><i></i></span>`,iconSize:[18,18],iconAnchor:[9,9]});
}
function projectLineStyle(feature,geometry){
  const schematic=projectGeometryPrecision(geometry)==="schematic";
  if(schematic)return {color:"#d47c22",weight:3,opacity:.95,dashArray:"8 6",className:"project-route project-route-schematic"};
  return {color:feature.properties.component==="toemmeledning"?"#7654ab":feature.properties.component==="gravet_ledning"?"#9d6327":"#cb344b",weight:4,opacity:.95,className:"project-route project-route-source"};
}
function projectAreaStyle(geometry){
  const schematic=projectGeometryPrecision(geometry)==="schematic";
  return schematic
    ?{color:"#d47c22",weight:2.5,opacity:.95,dashArray:"7 5",fillColor:"#d47c22",fillOpacity:.14,className:"project-area project-area-schematic"}
    :{color:"#0b7788",weight:2.5,opacity:.95,fillColor:"#0b7788",fillOpacity:.14,className:"project-area project-area-source"};
}
function projectFeatureStyle(feature,geometry){
  return ["Polygon","MultiPolygon"].includes(feature?.geometry?.type)?projectAreaStyle(geometry):projectLineStyle(feature,geometry);
}
function projectPointStyle(geometry){
  const schematic=projectGeometryPrecision(geometry)==="schematic";
  return {radius:schematic?4:5,color:"#fff",weight:2,fillColor:schematic?"#d47c22":"#233e49",fillOpacity:1,className:schematic?"project-shaft project-anchor-schematic":"project-shaft project-anchor-source"};
}
function renderProjects(){
  if(state.projectLayer)state.projectLayer.remove();
  state.projectLayer=L.layerGroup().addTo(state.map);
  const visible=state.tab==="projects"&&!!els.showProjects?.checked;
  let mapped=0;
  const renderedKeys=new Set();
  if(visible){
    for(const pr of filteredProjects()){
      const geometry=projectGeometry(pr),loc=projectLocation(pr);
      if(!geometry&&!loc)continue;
      mapped++;
      const b=state.brandById.get(pr.brandId);
      if(geometry){
        const key=projectGeometryKey(pr);
        if(renderedKeys.has(key))continue;
        renderedKeys.add(key);
        L.geoJSON(geometry,{
          style:f=>projectFeatureStyle(f,geometry),
          pointToLayer:(f,ll)=>L.circleMarker(ll,projectPointStyle(geometry)),
          onEachFeature:(f,l)=>{const tip=document.createElement("span");tip.textContent=`${pr.name} · ${f.properties?.label||projectGeometryListLabel(geometry)}`;l.bindTooltip(tip);l.on("click",()=>openProject(pr));}
        }).addTo(state.projectLayer);
      }else{
        const m=L.marker([loc.lat,loc.lon],{icon:projectMarkerIcon(pr,b),pane:"markerPane",keyboard:true}).addTo(state.projectLayer);
        const tip=document.createElement("span");tip.textContent=`${pr.name} · ${b?.name||pr.brandId}`;
        m.bindTooltip(tip);m.on("click",()=>openProject(pr));
      }
    }
  }
  if(els.projectLegend)els.projectLegend.hidden=!visible||mapped===0;
  return mapped;
}
function projectRowElement(pr){
  const b=state.brandById.get(pr.brandId),loc=projectLocation(pr),meta=projectCategoryMeta(pr),geometry=projectGeometry(pr);
  const row=document.createElement("button");row.className="project-row";row.dataset.projectId=pr.id;
  row.innerHTML=`<span class="project-list-marker" style="--project-color:${profileEscape(b?.color||"#0b7788")}"></span><span class="row-copy"><strong>${profileEscape(pr.name)}</strong><small>${profileEscape(b?.name||pr.brandId)} · ${profileEscape(meta.short)} · ${profileEscape(geometry?projectGeometryListLabel(geometry):loc?.label||"Placering mangler")}</small></span><span class="project-status-mini">${profileEscape(pr.status)}</span>`;
  row.dataset.geometryType=projectReview(pr)?.geometryType||"unresolved";
  if(geometry){row.dataset.geometryPrecision=projectGeometryPrecision(geometry);row.dataset.geometryKind=projectGeometryKind(geometry);}
  row.onclick=()=>{openProject(pr);zoomProject(pr)};
  return row;
}
function openProject(pr){
  const b=state.brandById.get(pr.brandId),loc=projectLocation(pr),meta=projectCategoryMeta(pr),review=projectReview(pr),geometry=projectGeometry(pr);
  const precision=geometry?projectGeometryPrecisionLabel(geometry):projectPrecisionLabel(loc?.precision);
  const note=geometry?(geometry.metadata?.note||"Projektgeometrien er hentet fra en offentlig projektkilde."):loc?.precision==="anlæg"?"Projektet er knyttet til en eksplicit kontrolleret PULS-registrering. Punktet viser anlægsregistreringen, ikke entreprisegrænsen.":loc?"Områdeplacering: Markøren viser et dokumenteret sted. Projektområdets afgrænsning er endnu ikke digitaliseret.":"Projektet vises i listen. Der mangler dokumenteret geografi, så det har ingen markør på kortet.";
  const geometrySource=geometry?.metadata?.sourceUrl||loc?.sourceUrl;
  const checked=geometry?.metadata?.retrievedAt||review?.locationCheckedAt;
  const locationLabel=geometry?(geometry.metadata?.locationLabel||projectGeometryListLabel(geometry)):(loc?.label||"Ikke fastlagt");
  const owners=Array.isArray(geometry?.metadata?.sharedOwners)?geometry.metadata.sharedOwners:[];
  const sharedNote=owners.length>1?`<p class="source-note"><strong>Fællesprojekt:</strong> ${profileEscape(owners.join(", "))}. Geometrien tegnes én gang, også når flere medbygherrer er valgt.</p>`:"";
  const reviewNote=geometry?.metadata?.reviewReason||review?.reason||"Projektet afventer klassifikation.";
  els.detailContent.innerHTML=`<header class="detail-head project-detail-head"><span class="detail-kicker">Forsyningsprojekt</span><h2>${profileEscape(pr.name)}</h2><div class="detail-owner">${profileEscape(b?.name||pr.brandId)}</div><span class="project-category-badge">${profileEscape(meta.label)}</span></header><div class="detail-body"><div class="fact-grid"><div class="fact"><span>Status</span><strong>${profileEscape(pr.status)}</strong></div><div class="fact"><span>Kategori</span><strong>${profileEscape(meta.label)}</strong></div><div class="fact"><span>Kortplacering</span><strong>${profileEscape(locationLabel)}</strong></div><div class="fact"><span>Præcision</span><strong>${profileEscape(precision)}</strong></div><div class="fact"><span>Geometri</span><strong>${profileEscape(projectGeometryLabel(pr))}</strong></div><div class="fact"><span>Geografisk dokumentation</span><strong>${profileEscape(checked?`Kontrolleret ${checked}`:loc?"Eksisterende stedanker":"Afventer verifikation")}</strong></div></div><p class="project-description">${profileEscape(pr.description)}</p><div class="project-detail-actions">${pr.url?profileLink(pr.url,"Åbn projektkilde","detail-action primary"):""}<button class="detail-action" type="button" data-project-profile="${profileEscape(pr.brandId)}">Åbn forsyningsprofil</button>${projectHasMapGeometry(pr)?'<button class="detail-action" type="button" data-project-zoom="1">Zoom til projekt</button>':""}${geometrySource?profileLink(geometrySource,"Kilde til kortplacering","detail-action"):""}</div><p class="source-note"><strong>Kortplacering:</strong> ${profileEscape(note)}</p><p class="source-note"><strong>Geometrivurdering:</strong> ${profileEscape(reviewNote)}</p>${sharedNote}</div>`;
  els.detailPanel.classList.add("open");els.detailPanel.setAttribute("aria-hidden","false");
  const pb=els.detailContent.querySelector("[data-project-profile]");if(pb)pb.onclick=()=>openBrandProfile(pr.brandId);
  const zb=els.detailContent.querySelector("[data-project-zoom]");if(zb)zb.onclick=()=>zoomProject(pr);
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