// Non-invasive integration layer for utility profiles.
// Keeps core map/PULS logic unchanged while profiles can evolve independently.
(async function integrateUtilityProfiles(){
  await loadProfiles();

  const coreBrandRowElement = brandRowElement;
  brandRowElement = function(b){
    const row=document.createElement("div"); row.className="brand-row"; row.dataset.brandId=b.id;
    const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=state.selected.has(b.id); cb.setAttribute("aria-label",`Vis ${b.name} på kortet`);
    cb.addEventListener("change",()=>{cb.checked?state.selected.add(b.id):state.selected.delete(b.id);renderPolygons();renderPlants();renderList();});
    const sw=document.createElement("span");sw.className="brand-swatch";sw.style.background=b.color||"#6d98a3";
    const cp=document.createElement("button");cp.type="button";cp.className="row-copy row-profile-open";
    const geography=b.sourceFeatureCount===0?"Anlægsejer · uden eget oplandslag":(b.municipalities?.length===1?b.municipalities[0]:`${b.municipalities?.length||0} kommuner`);
    const plants=activePlantCountForBrand(b.id);
    cp.innerHTML=`<strong>${profileEscape(b.name)}</strong><small>${profileEscape(geography)} · ${plants} aktive renseanlæg</small>`;
    cp.onclick=()=>openBrandProfile(b.id);
    const profileBtn=document.createElement("button");profileBtn.type="button";profileBtn.className=`profile-mini ${profileForBrand(b.id)?"researched":"pending"}`;
    profileBtn.textContent="Profil"; profileBtn.title=profileForBrand(b.id)?`Åbn profil for ${b.name}`:`Åbn profil for ${b.name} (research mangler)`;
    profileBtn.onclick=e=>{e.stopPropagation();openBrandProfile(b.id);};
    row.append(cb,sw,cp,profileBtn);return row;
  };

  const coreOpenPlant=openPlant;
  openPlant=function(p){
    coreOpenPlant(p);
    const b=p.responsibleBrandId?state.brandById.get(p.responsibleBrandId):null;
    if(!b)return;
    const body=els.detailContent.querySelector(".detail-body"); if(!body)return;
    const old=body.querySelector("[data-brand]");
    const actions=document.createElement("div");actions.className="detail-actions";
    const profile=document.createElement("button");profile.type="button";profile.className="detail-action primary";profile.textContent="Åbn forsyningsprofil";profile.onclick=()=>openBrandProfile(b.id);
    if(old){ old.textContent="Zoom til forsyning"; old.parentNode.insertBefore(actions,old); actions.append(profile,old); }
    else { actions.append(profile); body.insertBefore(actions,body.querySelector(".source-note")); }
  };

  const coreOpenArea=openArea;
  openArea=function(p){
    coreOpenArea(p);
    const id=p.brandId; const b=id?state.brandById.get(id):null; if(!b)return;
    const body=els.detailContent.querySelector(".detail-body");if(!body)return;
    const actions=document.createElement("div");actions.className="detail-actions";
    const profile=document.createElement("button");profile.type="button";profile.className="detail-action primary";profile.textContent="Åbn forsyningsprofil";profile.onclick=()=>openBrandProfile(id);
    const zoom=document.createElement("button");zoom.type="button";zoom.className="detail-action";zoom.textContent="Zoom til forsyning";zoom.onclick=()=>zoomBrand(id);
    actions.append(profile,zoom);body.insertBefore(actions,body.querySelector(".source-note"));
  };

  renderList();
  console.info("UTILITY_PROFILES_READY",{profiles:state.profiles.size});
})();
