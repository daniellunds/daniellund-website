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
    const localBrand=hasAreaValue(p.localBrand)&&normalize(p.localBrand)!==normalize(displayName)?p.localBrand:null;
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

    els.detailContent.innerHTML=`<header class="detail-head"><span class="detail-kicker">Vedtaget kloakopland</span><h2>${profileEscape(displayName)}</h2><div class="detail-owner">${profileEscape(hasAreaValue(p.municipality)?p.municipality:"Plandata")}</div></header><div class="detail-body"><div class="fact-grid">${facts}</div>${linksHtml}<div class="area-profile-actions"></div>${current?.isOverride?`<p class="source-note current-operator-note"><strong>Aktuel operatør:</strong> ${profileEscape(current.operatorName)}. Det underliggende kort-ID og Plandata-navn bevares kun for stabile datajoins.${current.sourceUrl?` <a href="${profileEscape(current.sourceUrl)}" target="_blank" rel="noopener">Kilde</a>`:""}</p>`:""}<p class="source-note"><strong>Datakilde:</strong> ${profileEscape(sourceLabel)}.${aggregationNote}</p></div>`;
    els.detailPanel.classList.add("open");els.detailPanel.setAttribute("aria-hidden","false");

    if(b){
      const actions=els.detailContent.querySelector(".area-profile-actions");
      actions.className="detail-actions area-profile-actions";
      const profile=document.createElement("button");profile.type="button";profile.className="detail-action primary";profile.textContent="Åbn forsyningsprofil";profile.onclick=()=>openBrandProfile(id);
      const zoom=document.createElement("button");zoom.type="button";zoom.className="detail-action";zoom.textContent="Zoom til forsyning";zoom.onclick=()=>zoomBrand(id);
      actions.append(profile,zoom);
    }
  };

  renderList();
  console.info("UTILITY_PROFILES_READY",{profiles:state.profiles.size,projects:state.projects?.length||0,currentOperatorOverrides:state.currentOperatorOverrides?.size||0});
})();
