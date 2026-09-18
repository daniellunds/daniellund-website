// Non-invasive integration layer for utility profiles and project map data.
// Keeps stable map/PULS IDs while current operator identities can evolve independently.
(async function integrateUtilityProfiles(){
  await Promise.all([loadProfiles(),state.identityDataReady]);
  const registry=state.canonicalRegistry;
  if(!registry)throw new Error("Canonical organization registry er ikke indlæst");

  const legacyOperatorFor=b=>typeof currentOperatorForBrand==="function"?currentOperatorForBrand(b.id):{displayName:b.name,operatorName:b.name,operatorBrandId:b.id,isOverride:false};
  const canonicalIdFor=id=>{
    if(registry.organizationForId(id))return id;
    const direct=registry.organizationIdForLegacyBrandId(id);
    if(direct)return direct;
    const oldTarget=state.brandById.has(id)?legacyOperatorFor(state.brandById.get(id))?.operatorBrandId:null;
    return registry.organizationIdForLegacyBrandId(oldTarget)||id;
  };
  const memberIdsFor=id=>registry.legacyBrandIdsForOrganizationId(canonicalIdFor(id)).filter(legacyId=>state.brandById.has(legacyId));
  const primaryLegacyIdFor=id=>registry.preferredLegacyBrandIdForOrganizationId(canonicalIdFor(id))||memberIdsFor(id)[0]||id;
  const operatorFor=b=>{
    const legacy=legacyOperatorFor(b);
    const organization=registry.organizationForId(canonicalIdFor(b.id));
    return {...legacy,displayName:organization?.displayName||legacy.displayName||b.name,operatorName:organization?.displayName||legacy.operatorName||b.name,sourceUrl:organization?.sourceUrls?.[0]||legacy.sourceUrl};
  };

  const comparisons=(state.brands||[]).map(b=>{
    const oldTarget=legacyOperatorFor(b)?.operatorBrandId||b.id;
    const oldCanonical=registry.organizationIdForLegacyBrandId(oldTarget);
    const newCanonical=registry.organizationIdForLegacyBrandId(b.id);
    return {legacyBrandId:b.id,oldTarget,oldCanonical,newCanonical,match:Boolean(oldCanonical)&&oldCanonical===newCanonical};
  });
  state.canonicalRegistryParity={checked:comparisons.length,matches:comparisons.filter(x=>x.match).length,mismatches:comparisons.filter(x=>!x.match)};
  if(state.canonicalRegistryParity.mismatches.length)throw new Error(`Canonical registry afviger fra current-operators.js for ${state.canonicalRegistryParity.mismatches.length} kildeidentiteter`);

  if(typeof initProjects==="function")await initProjects();

  // Existing filters can search canonical and historical names; raw source rows remain unchanged after each call.
  const withCurrentSearchNames=fn=>{
    const original=[];
    for(const b of state.brands||[]){
      const organization=registry.organizationForId(canonicalIdFor(b.id));
      original.push([b,b.name]);b.name=[organization?.displayName,...(organization?.searchNames||[]),b.name].filter(Boolean).join(" ");
    }
    try{return fn();}finally{for(const [b,name] of original)b.name=name;}
  };
  const coreRenderList=renderList;
  renderList=function(){
    const out=state.tab==="brands"?withCurrentSearchNames(coreRenderList):coreRenderList();
    if(state.tab==="brands")els.visibleCount.textContent=`${state.canonicalVisibleCount||0} vist`;
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
      const memberIds=memberIdsFor(canonical);
      const members=memberIds.map(id=>state.brandById.get(id)).filter(Boolean);
      const primaryLegacyBrandId=primaryLegacyIdFor(canonical);
      const base=state.brandById.get(primaryLegacyBrandId)||rowBrand;
      const organization=registry.organizationForId(canonical);
      merged.push({
        ...base,
        id:canonical,
        name:organization?.displayName||base.name,
        municipalities:[...new Set(members.flatMap(b=>b.municipalities||[]))],
        sourceFeatureCount:members.reduce((sum,b)=>sum+Number(b.sourceFeatureCount||0),0),
        _canonicalOrganizationId:canonical,
        _primaryLegacyBrandId:primaryLegacyBrandId,
        _regionId:regionForBrand(base),
        _operatorMemberIds:memberIds
      });
    }
    state.canonicalVisibleCount=merged.length;
    state.canonicalRenderedOrganizationIds=merged.map(b=>b.id);
    return coreRenderBrandGroups(merged,q);
  };

  brandRowElement = function(b){
    const canonical=canonicalIdFor(b.id),memberIds=b._operatorMemberIds||memberIdsFor(canonical);
    const primaryLegacyBrandId=b._primaryLegacyBrandId||primaryLegacyIdFor(canonical);
    const canonicalBrand=state.brandById.get(primaryLegacyBrandId)||b;
    const displayName=registry.organizationForId(canonical)?.displayName||b.name;
    const row=document.createElement("div"); row.className="brand-row"; row.dataset.brandId=primaryLegacyBrandId; row.dataset.currentOperatorId=primaryLegacyBrandId; row.dataset.organizationId=canonical;
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
    const organization=registry.organizationForId(canonical);
    const geography=organization?.organizationType==="jointTreatmentOrganization"
      ?"Fælles renseorganisation"
      :municipalities.length===0?"Anlægsejer · uden eget oplandslag"
      :municipalities.length===1?municipalities[0]:`${municipalities.length} kommuner`;
    cp.innerHTML=`<strong>${profileEscape(displayName)}</strong><small>${profileEscape(geography)} · ${profileEscape(wastewaterListSummary(canonical))}</small>`;
    cp.onclick=()=>openBrandProfile(canonical);
    const profileBtn=document.createElement("button");profileBtn.type="button";profileBtn.className=`profile-mini ${profileForBrand(canonical)?"researched":"pending"}`;
    profileBtn.textContent="Profil"; profileBtn.title=profileForBrand(canonical)?`Åbn profil for ${displayName}`:`Åbn profil for ${displayName} (research mangler)`;
    profileBtn.onclick=e=>{e.stopPropagation();openBrandProfile(canonical);};
    row.append(cb,sw,cp,profileBtn);return row;
  };

  const coreZoomBrand=zoomBrand;
  zoomBrand=function(id){
    const memberIds=memberIdsFor(id);
    if(memberIds.length<=1)return coreZoomBrand(memberIds[0]||id);
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
    if(old){ old.textContent="Zoom til forsyning"; old.onclick=()=>zoomBrand(canonicalIdFor(b.id)); old.parentNode.insertBefore(actions,old); actions.append(profile,old); }
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
  window.spildevandskortCanonicalUiState=()=>({
    organizationCount:registry.counts.organizations,
    sourceIdentityCount:registry.counts.sourceIdentities,
    visibleOrganizationCount:state.canonicalVisibleCount||0,
    renderedOrganizationIds:[...(state.canonicalRenderedOrganizationIds||[])],
    parity:{checked:state.canonicalRegistryParity.checked,matches:state.canonicalRegistryParity.matches,mismatchCount:state.canonicalRegistryParity.mismatches.length}
  });

  renderList();
  console.info("UTILITY_PROFILES_READY",{profiles:state.profiles.size,projects:state.projects?.length||0,canonicalOrganizations:registry.counts.organizations,registryParity:state.canonicalRegistryParity});
})();
