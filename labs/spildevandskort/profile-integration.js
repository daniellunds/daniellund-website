// Non-invasive integration layer for utility profiles and project map data.
// Keeps stable map/PULS IDs while current operator identities can evolve independently.
(async function integrateUtilityProfiles(){
  await loadProfiles();
  if(typeof initProjects==="function")await initProjects();

  const operatorFor=b=>typeof currentOperatorForBrand==="function"?currentOperatorForBrand(b.id):{displayName:b.name,operatorName:b.name,isOverride:false};
  const displayBrandName=b=>operatorFor(b).displayName||b.name;
  // Profiles remain keyed by stable legacy IDs, but their visible headings follow the verified current operator identity.
  for(const b of state.brands||[]){
    const current=operatorFor(b),profile=profileForBrand(b.id);
    if(profile&&current.isOverride&&current.displayName)profile.name=current.displayName;
  }

  // Let existing search logic match both the current operator and the legacy Plandata identity without mutating either permanently.
  const withCurrentSearchNames=fn=>{
    const original=[];
    for(const b of state.brands||[]){
      const current=operatorFor(b);if(!current.isOverride)continue;
      original.push([b,b.name]);b.name=`${current.displayName} ${b.name}`;
    }
    try{return fn();}finally{for(const [b,name] of original)b.name=name;}
  };
  const coreRenderList=renderList;
  renderList=function(){return withCurrentSearchNames(coreRenderList);};
  const coreFilteredPlants=filteredPlants;
  filteredPlants=function(){return withCurrentSearchNames(coreFilteredPlants);};

  brandRowElement = function(b){
    const current=operatorFor(b),displayName=current.displayName||b.name;
    const row=document.createElement("div"); row.className="brand-row"; row.dataset.brandId=b.id; row.dataset.currentOperatorId=current.operatorBrandId||b.id;
    const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=state.selected.has(b.id); cb.setAttribute("aria-label",`Vis ${displayName} på kortet`);
    cb.addEventListener("change",()=>{cb.checked?state.selected.add(b.id):state.selected.delete(b.id);renderPolygons();renderPlants();if(typeof renderProjects==="function")renderProjects();renderList();});
    const sw=document.createElement("span");sw.className="brand-swatch";sw.style.background=b.color||"#6d98a3";
    const cp=document.createElement("button");cp.type="button";cp.className="row-copy row-profile-open";
    const geography=b.sourceFeatureCount===0?"Anlægsejer · uden eget oplandslag":(b.municipalities?.length===1?b.municipalities[0]:`${b.municipalities?.length||0} kommuner`);
    const plants=activePlantCountForBrand(b.id);
    cp.innerHTML=`<strong>${profileEscape(displayName)}</strong><small>${profileEscape(geography)} · ${plants} aktive renseanlæg</small>`;
    cp.onclick=()=>openBrandProfile(b.id);
    const profileBtn=document.createElement("button");profileBtn.type="button";profileBtn.className=`profile-mini ${profileForBrand(b.id)?"researched":"pending"}`;
    profileBtn.textContent="Profil"; profileBtn.title=profileForBrand(b.id)?`Åbn profil for ${displayName}`:`Åbn profil for ${displayName} (research mangler)`;
    profileBtn.onclick=e=>{e.stopPropagation();openBrandProfile(b.id);};
    row.append(cb,sw,cp,profileBtn);return row;
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
    const profile=document.createElement("button");profile.type="button";profile.className="detail-action primary";profile.textContent="Åbn forsyningsprofil";profile.onclick=()=>openBrandProfile(b.id);
    if(old){ old.textContent="Zoom til forsyning"; old.parentNode.insertBefore(actions,old); actions.append(profile,old); }
    else { actions.append(profile); body.insertBefore(actions,body.querySelector(".source-note")); }
  };

  const coreOpenArea=openArea;
  openArea=function(p){
    coreOpenArea(p);
    const id=p.brandId,b=id?state.brandById.get(id):null;if(!b)return;
    const current=operatorFor(b),head=els.detailContent.querySelector(".detail-head h2");if(head)head.textContent=current.displayName;
    const body=els.detailContent.querySelector(".detail-body");if(!body)return;
    if(current.isOverride){
      const note=document.createElement("p");note.className="source-note current-operator-note";note.innerHTML=`<strong>Aktuel operatør:</strong> ${profileEscape(current.operatorName)}. Det underliggende kort-ID og Plandata-navn bevares kun for stabile datajoins.${current.sourceUrl?` <a href="${profileEscape(current.sourceUrl)}" target="_blank" rel="noopener">Kilde</a>`:""}`;
      body.insertBefore(note,body.querySelector(".source-note"));
    }
    const actions=document.createElement("div");actions.className="detail-actions";
    const profile=document.createElement("button");profile.type="button";profile.className="detail-action primary";profile.textContent="Åbn forsyningsprofil";profile.onclick=()=>openBrandProfile(id);
    const zoom=document.createElement("button");zoom.type="button";zoom.className="detail-action";zoom.textContent="Zoom til forsyning";zoom.onclick=()=>zoomBrand(id);
    actions.append(profile,zoom);body.insertBefore(actions,body.querySelector(".source-note"));
  };

  renderList();
  console.info("UTILITY_PROFILES_READY",{profiles:state.profiles.size,projects:state.projects?.length||0,currentOperatorOverrides:state.currentOperatorOverrides?.size||0});
})();
