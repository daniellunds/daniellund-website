// Non-invasive integration layer for utility profiles and project map data.
// Keeps stable map/PULS IDs while current operator identities can evolve independently.
(async function integrateUtilityProfiles(){
  await loadProfiles();
  if(typeof initProjects==="function")await initProjects();

  const operatorFor=b=>typeof currentOperatorForBrand==="function"?currentOperatorForBrand(b.id):{displayName:b.name,operatorName:b.name,isOverride:false};
  const displayBrandName=b=>operatorFor(b).displayName||b.name;
  const canonicalIdFor=id=>{
    const b=state.brandById.get(id);if(!b)return id;
    const current=operatorFor(b);
    return current?.operatorBrandId&&state.brandById.has(current.operatorBrandId)?current.operatorBrandId:id;
  };
  const memberIdsFor=id=>{
    const canonical=canonicalIdFor(id);
    return (state.brands||[]).filter(b=>canonicalIdFor(b.id)===canonical).map(b=>b.id);
  };
  // Profiles remain keyed by stable legacy IDs, but their visible headings follow the verified current operator identity.
  for(const b of state.brands||[]){
    const current=operatorFor(b),profile=profileForBrand(b.id);
    if(profile&&current.isOverride&&current.displayName)profile.name=current.displayName;
  }

  // Let existing search logic match verified current names, legacy/source names and legal/source aliases without mutating source metadata permanently.
  const withCurrentSearchNames=fn=>{
    const original=[];
    for(const b of state.brands||[]){
      const current=operatorFor(b);
      const searchNames=[...(current.searchNames||[]),current.displayName,b.name].filter(Boolean);
      if(searchNames.length<=1)continue;
      original.push([b,b.name]);b.name=[...new Set(searchNames)].join(" ");
    }
    try{return fn();}finally{for(const [b,name] of original)b.name=name;}
  };
  const coreRenderList=renderList;
  renderList=function(){
    const out=withCurrentSearchNames(coreRenderList);
    if(state.tab==="brands"){
      els.visibleCount.textContent=`${document.querySelectorAll(".brand-row").length} vist`;
      const canonicalCount=new Set((state.brands||[]).map(b=>operatorFor(b).canonicalOrganizationId||canonicalIdFor(b.id))).size;
      els.brandCount.textContent=canonicalCount;
    }
    return out;
  };
  const coreFilteredPlants=filteredPlants;
  filteredPlants=function(){return withCurrentSearchNames(coreFilteredPlants);};

  const coreRenderBrandGroups=renderBrandGroups;
  renderBrandGroups=function(rows,q){
    const seen=new Set(),merged=[];
    for(const rowBrand of rows){
      const canonical=canonicalIdFor(rowBrand.id);
      if(seen.has(canonical))continue;
      seen.add(canonical);
      const base=state.brandById.get(canonical)||rowBrand;
      const memberIds=memberIdsFor(canonical);
      const members=memberIds.map(id=>state.brandById.get(id)).filter(Boolean);
      merged.push({
        ...base,
        id:canonical,
        name:operatorFor(base).operatorName||base.name,
        municipalities:[...new Set(members.flatMap(b=>b.municipalities||[]))],
        sourceFeatureCount:members.reduce((sum,b)=>sum+Number(b.sourceFeatureCount||0),0),
        _operatorMemberIds:memberIds
      });
    }
    return coreRenderBrandGroups(merged,q);
  };

  brandRowElement = function(b){
    const canonical=canonicalIdFor(b.id),memberIds=b._operatorMemberIds||memberIdsFor(canonical);
    const canonicalBrand=state.brandById.get(canonical)||b;
    const current=operatorFor(canonicalBrand),displayName=current.operatorName||current.displayName||canonicalBrand.name;
    const row=document.createElement("div"); row.className="brand-row"; row.dataset.brandId=canonical; row.dataset.currentOperatorId=canonical;
    const cb=document.createElement("input"); cb.type="checkbox";
    const selectedCount=memberIds.filter(id=>state.selected.has(id)).length;
    cb.checked=selectedCount===memberIds.length;cb.indeterminate=selectedCount>0&&selectedCount<memberIds.length;
    cb.setAttribute("aria-label",`Vis ${displayName} på kortet`);
    cb.addEventListener("change",()=>{
      for(const id of memberIds)cb.checked?state.selected.add(id):state.selected.delete(id);
      renderPolygons();renderPlants();if(typeof renderProjects==="function")renderProjects();renderList();
    });
    const sw=document.createElement("span");sw.className="brand-swatch";sw.style.background=canonicalBrand.color||"#6d98a3";
    const cp=document.createElement("button");cp.type="button";cp.className="row-copy row-profile-open";
    const municipalities=[...new Set(memberIds.flatMap(id=>state.brandById.get(id)?.municipalities||[]))];
    const geography=current.organizationType==="jointTreatmentOrganization"
      ?"Fælles renseorganisation"
      :municipalities.length===1?municipalities[0]:municipalities.length?`${municipalities.length} kommuner`:"Forsyningsorganisation";
    cp.innerHTML=`<strong>${profileEscape(displayName)}</strong><small>${profileEscape(geography)}</small>`;
    cp.onclick=()=>openBrandProfile(canonical);
    const profileBtn=document.createElement("button");profileBtn.type="button";profileBtn.className=`profile-mini ${profileForBrand(canonical)?"researched":"pending"}`;
    profileBtn.textContent="Profil"; profileBtn.title=profileForBrand(canonical)?`Åbn profil for ${displayName}`:`Åbn profil for ${displayName} (research mangler)`;
    profileBtn.onclick=e=>{e.stopPropagation();openBrandProfile(canonical);};
    row.append(cb,sw,cp,profileBtn);return row;
  };

  const coreZoomBrand=zoomBrand;
  zoomBrand=function(id){
    const memberIds=memberIdsFor(id);
    if(memberIds.length<=1)return coreZoomBrand(id);
    const layers=[];
    state.polygonLayer?.eachLayer(l=>{if(memberIds.includes(l.feature?.properties?.brandId))layers.push(l);});
    const plantPoints=state.plants.filter(p=>memberIds.includes(p.responsibleBrandId)&&p.coordinates).map(p=>L.latLng(p.coordinates[1],p.coordinates[0]));
    if(layers.length){const g=L.featureGroup(layers);for(const pt of plantPoints)L.marker(pt,{opacity:0}).addTo(g);state.map.fitBounds(g.getBounds(),{padding:[30,30]});}
    else if(plantPoints.length){state.map.fitBounds(L.latLngBounds(plantPoints),{padding:[30,30],maxZoom:11});}
    closeDetail();
  };

  const coreOpenPlant=openPlant;
  openPlant=function(p){
    coreOpenPlant(p);
    const b=p.responsibleBrandId?state.brandById.get(p.responsibleBrandId):null;
    if(!b)return;
    const current=operatorFor(b),body=els.detailContent.querySelector(".detail-body"); if(!body)return;
    const owner=els.detailContent.querySelector(".detail-owner");if(owner)owner.textContent=`Ansvarlig forsyning: ${current.displayName}`;
    const firstFact=body.querySelector(".fact strong");if(firstFact)firstFact.textContent=current.displayName;
    const old=body.querySelector("[data-brand]");
    const actions=document.createElement("div");actions.className="detail-actions";
    const profile=document.createElement("button");profile.type="button";profile.className="detail-action primary";profile.textContent="Åbn forsyningsprofil";profile.onclick=()=>openBrandProfile(canonicalIdFor(b.id));
    if(old){ old.textContent="Zoom til forsyning"; old.parentNode.insertBefore(actions,old); actions.append(profile,old); }
    else { actions.append(profile); body.insertBefore(actions,body.querySelector(".source-note")); }
  };

  const hasAreaValue=v=>{
    if(v===null||v===undefined)return false;
    if(Array.isArray(v))return v.some(hasAreaValue);
    const s=String(v).trim();
    if(!s)return false;
    return !["ikke oplyst","ikke angivet i kilden","undefined","null"].includes(s.toLocaleLowerCase("da"));
  };
  const areaFact=(label,value)=>hasAreaValue(value)?`<div class="fact"><span>${profileEscape(label)}</span><strong>${profileEscape(String(value))}</strong></div>`:"";
  const areaNumber=v=>Number.isFinite(Number(v))?new Intl.NumberFormat("da-DK",{maximumFractionDigits:0}).format(Number(v)):v;
  const areaDate=v=>{
    if(!hasAreaValue(v))return null;
    const raw=String(v).trim();
    const d=new Date(raw);
    return Number.isNaN(d.getTime())?raw:new Intl.DateTimeFormat("da-DK",{day:"2-digit",month:"short",year:"numeric"}).format(d);
  };
  const areaList=v=>Array.isArray(v)?v.filter(hasAreaValue):[];
  const compactAreaList=v=>{
    const values=areaList(v);if(!values.length)return null;
    const shown=values.slice(0,4).map(String);
    return `${shown.join(", ")}${values.length>shown.length?` +${values.length-shown.length}`:""}`;
  };
  const safeAreaUrl=v=>{
    if(!hasAreaValue(v))return null;
    try{const u=new URL(String(v),window.location.href);return ["http:","https:"].includes(u.protocol)?u.href:null;}catch{return null;}
  };
  const areaLinks=p=>{
    const seen=new Set(),links=[];
    for(const [label,values] of [["Plandokument",areaList(p.documentLinks)],["Planlink",areaList(p.webLinks)]]){
      for(const value of values){
        const url=safeAreaUrl(value);if(!url||seen.has(url))continue;seen.add(url);
        links.push({label:`${label}${values.length>1?` ${links.filter(x=>x.base===label).length+1}`:""}`,base:label,url});
      }
    }
    return links.slice(0,8);
  };

  openArea=function(p){
    const id=p.brandId,b=id?state.brandById.get(id):null;
    const current=b?operatorFor(b):null;
    const displayName=current?.displayName||b?.name||p.brand||p.brandName||"Kloakopland";
    const localBrand=null;
    const facts=[
      areaFact("Forsyning",displayName),
      areaFact("Lokal forsyning",localBrand),
      areaFact("Kommune",p.municipality),
      areaFact("Kloaktype",p.displayType||p.sewerType),
      areaFact("Planstatus",p.planStatus),
      areaFact("Plan",p.planTitle),
      areaFact("Planreferencer",compactAreaList(p.planNumbers)),
      areaFact("Ejerforhold",p.ownership),
      areaFact("Kilden opdateret",areaDate(p.sourceUpdated)),
      areaFact("Kildeobjekter",hasAreaValue(p.sourceFeatureCount)?areaNumber(p.sourceFeatureCount):null)
    ].filter(Boolean).join("");
    const links=areaLinks(p);
    const linksHtml=links.length?`<div class="detail-actions area-source-links">${links.map(x=>`<a class="detail-action" href="${profileEscape(x.url)}" target="_blank" rel="noopener noreferrer">${profileEscape(x.label)}</a>`).join("")}</div>`:"";
    const aggregationNote=Number(p.sourceFeatureCount)>1?` Denne kortflade samler ${profileEscape(areaNumber(p.sourceFeatureCount))} vedtagne kildeobjekter med samme kommune, forsyning og kloaktype.`:"";
    const sourceLabel=hasAreaValue(p.source)?p.source:"Plandata.dk – vedtagne kloakoplande";

    els.detailContent.innerHTML=`<header class="detail-head"><span class="detail-kicker">Vedtaget kloakopland</span><h2>${profileEscape(displayName)}</h2><div class="detail-owner">${profileEscape(hasAreaValue(p.municipality)?p.municipality:"Plandata")}</div></header><div class="detail-body"><div class="fact-grid">${facts}</div>${linksHtml}<div class="area-profile-actions"></div>${current?.isOverride&&current.sourceUrl?`<p class="source-note current-operator-note"><a href="${profileEscape(current.sourceUrl)}" target="_blank" rel="noopener">Kilde til aktuel forsyningsoperatør</a></p>`:""}<p class="source-note"><strong>Datakilde:</strong> ${profileEscape(sourceLabel)}.${aggregationNote}</p></div>`;
    els.detailPanel.classList.add("open");els.detailPanel.setAttribute("aria-hidden","false");

    if(b){
      const actions=els.detailContent.querySelector(".area-profile-actions");
      actions.className="detail-actions area-profile-actions";
      const profile=document.createElement("button");profile.type="button";profile.className="detail-action primary";profile.textContent="Åbn forsyningsprofil";profile.onclick=()=>openBrandProfile(canonicalIdFor(id));
      const zoom=document.createElement("button");zoom.type="button";zoom.className="detail-action";zoom.textContent="Zoom til forsyning";zoom.onclick=()=>zoomBrand(canonicalIdFor(id));
      actions.append(profile,zoom);
    }
  };
  window.CATCHMENT_DETAIL_PANEL_VERSION=2;

  renderList();
  console.info("UTILITY_PROFILES_READY",{profiles:state.profiles.size,projects:state.projects?.length||0,currentOperatorOverrides:state.currentOperatorOverrides?.size||0});
})();
