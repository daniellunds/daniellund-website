state.profiles = new Map();
state.profileMeta = {};

function profileEscape(v=""){
  return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
function profileLink(url,label,cls="profile-link"){
  if(!url)return "";
  return `<a class="${cls}" href="${profileEscape(url)}" target="_blank" rel="noopener noreferrer">${profileEscape(label)} ↗</a>`;
}
async function loadProfiles(){
  try{
    let files=["utility-profiles.json"];
    try{
      const index=await fetchJSON(`${PROD}/utility-profiles-index.json`);
      if(Array.isArray(index.files)&&index.files.length) files=index.files;
    }catch(indexErr){
      console.info("Bruger enkelt profilfil; profilindeks ikke fundet",indexErr);
    }
    const batches=await Promise.all(files.map(file=>fetchJSON(`${PROD}/${file}`)));
    const merged={};
    for(const batch of batches){
      for(const [id,profile] of Object.entries(batch.profiles||{})) merged[id]=profile;
    }
    state.profiles=new Map(Object.entries(merged));
    state.profileMeta={schemaVersion:Math.max(...batches.map(x=>Number(x.schemaVersion)||1)),generatedAt:batches.map(x=>x.generatedAt).filter(Boolean).sort().at(-1)||null,files};
  }catch(err){
    console.warn("Forsyningsprofiler kunne ikke indlæses",err);
    state.profiles=new Map();
  }
}
function canonicalProfileBrandId(id){
  const registry=state.canonicalRegistry;
  if(registry?.organizationForId(id))return id;
  const direct=registry?.organizationIdForLegacyBrandId(id);
  if(direct)return direct;
  if(typeof currentOperatorForBrand!=="function")return id;
  const legacyCurrent=currentOperatorForBrand(id)?.operatorBrandId;
  return registry?.organizationIdForLegacyBrandId(legacyCurrent)||legacyCurrent||id;
}
function operatorMemberBrandIds(id){
  const canonical=canonicalProfileBrandId(id);
  const registryIds=state.canonicalRegistry?.legacyBrandIdsForOrganizationId(canonical)||[];
  if(registryIds.length)return registryIds.filter(legacyId=>state.brandById.has(legacyId));
  return (state.brands||[]).filter(b=>canonicalProfileBrandId(b.id)===canonical).map(b=>b.id);
}
function operatorBrandView(id){
  const canonical=canonicalProfileBrandId(id);
  const registry=state.canonicalRegistry;
  const organization=registry?.organizationForId(canonical);
  const primaryLegacyBrandId=registry?.preferredLegacyBrandIdForOrganizationId(canonical)||id;
  const base=state.brandById.get(primaryLegacyBrandId)||state.brandById.get(id);
  if(!base)return null;
  const memberIds=operatorMemberBrandIds(canonical);
  const municipalities=[...new Set(memberIds.flatMap(memberId=>state.brandById.get(memberId)?.municipalities||[]))];
  return {...base,id:canonical,name:organization?.displayName||base.name,organizationType:organization?.organizationType||"utility",canonicalOrganizationId:canonical,municipalities,_canonicalOrganizationId:canonical,_primaryLegacyBrandId:primaryLegacyBrandId,_operatorMemberIds:memberIds};
}
function profileForBrand(id){
  const canonical=canonicalProfileBrandId(id);
  const memberIds=operatorMemberBrandIds(canonical);
  const preferred=state.canonicalRegistry?.preferredLegacyBrandIdForOrganizationId(canonical);
  return state.profiles.get(canonical)||state.profiles.get(preferred)||memberIds.map(memberId=>state.profiles.get(memberId)).find(Boolean)||state.profiles.get(id)||null;
}
function profileCompleteness(p){
  if(!p)return "Profil under research";
  const bits=[p.website,p.phone,(p.contacts||[]).length,(p.projects||[]).length].filter(Boolean).length;
  return bits>=4?"Research verificeret":"Delvist research'et";
}
function renderWastewaterProfileSemantics(b){
  const canonicalId=canonicalProfileBrandId(b.id);
  const semantics=wastewaterSemanticsForOrganizationId(canonicalId);
  const activePulsRecords=activePulsRecordCountForOrganizationId(canonicalId);
  const fact=(label,value,wide=false)=>`<div class="fact${wide?" profile-wide":""}"><span>${profileEscape(label)}</span><strong>${profileEscape(value)}</strong></div>`;
  if(!semantics||semantics.auditStatus!=="verified"){
    return `<section class="wastewater-semantics" data-wastewater-audit-status="not-audited">
      <div class="fact-grid profile-facts wastewater-facts">
        ${fact("Organisationens rolle",semantics?.roleLabel||"Ikke auditeret")}
        ${fact("Egne/driftede aktive renseanlæg","Ikke verificeret")}
        ${fact("Aktive PULS-poster",String(activePulsRecords))}
      </div>
      <p class="source-note"><strong>Anlægsrelationer:</strong> Det fysiske anlægstal er endnu ikke auditeret. PULS-tallet er et teknisk kildeantal og må ikke læses som antal fysiske renseanlæg.</p>
    </section>`;
  }
  const facilities=semantics.directFacilities.map(facility=>facility.name).join(", ");
  const routes=semantics.routes.map(route=>route.displayLabel).join("; ");
  const coOwnerships=semantics.coOwnerships.map(relation=>relation.displayLabel).join("; ");
  const sourceUrls=[...new Set([
    ...(semantics.verification?.sourceUrls||[]),
    ...semantics.routes.flatMap(route=>route.verification?.sourceUrls||[]),
    ...semantics.coOwnerships.flatMap(relation=>relation.verification?.sourceUrls||[])
  ])];
  const sources=sourceUrls.slice(0,4).map((url,index)=>profileLink(url,`Kilde ${index+1}`)).join(" · ");
  return `<section class="wastewater-semantics" data-wastewater-audit-status="verified">
    <div class="fact-grid profile-facts wastewater-facts">
      ${fact("Organisationens rolle",semantics.roleLabel)}
      ${fact("Egne/driftede aktive renseanlæg",String(semantics.directActiveFacilityCount))}
      ${facilities?fact("Verificerede fysiske anlæg",facilities,true):""}
      ${routes?fact("Spildevand behandles hos",routes,true):""}
      ${coOwnerships?fact("Ejerkontekst",coOwnerships,true):""}
      ${fact("Aktive PULS-poster",String(activePulsRecords))}
    </div>
    <p class="source-note"><strong>Relationer verificeret 18.09.2026.</strong> Det primære tal tæller unikke fysiske anlæg med en verificeret direkte driftsrelation. PULS-poster vises separat som teknisk kildeantal.${sources?` ${sources}`:""}</p>
  </section>`;
}
function renderProfileOverview(b,p){
  const municipalities=(b.municipalities||[]).join(", ")||"Ikke relevant / anlægsejer";
  const wastewater=renderWastewaterProfileSemantics(b);
  if(!p)return `${wastewater}<div class="profile-empty"><strong>Profilen er endnu ikke researchet.</strong><p>Hjemmeside, kontaktpersoner og projekter tilføjes i den løbende profilresearch.</p></div>`;
  return `${p.summary?`<p class="profile-summary">${profileEscape(p.summary)}</p>`:""}
    <div class="fact-grid profile-facts">
      <div class="fact"><span>Telefon</span><strong>${profileEscape(p.phone||"Ikke oplyst")}</strong></div>
      <div class="fact"><span>E-mail</span><strong>${p.email?`<a href="mailto:${profileEscape(p.email)}">${profileEscape(p.email)}</a>`:"Ikke oplyst"}</strong></div>
      <div class="fact"><span>Forsyningsområde</span><strong>${profileEscape(municipalities)}</strong></div>
      <div class="fact profile-wide"><span>Adresse</span><strong>${profileEscape(p.address||"Ikke oplyst")}</strong></div>
    </div>
    ${wastewater}
    <div class="profile-actions">${profileLink(p.website,"Åbn hjemmeside","detail-action profile-link")}<button class="detail-action" type="button" data-profile-zoom="${profileEscape(b.id)}">Zoom til forsyning</button></div>`;
}
function renderProfilePeople(p){
  if(!p||(p.contacts||[]).length===0)return `<div class="profile-empty"><strong>Ingen verificerede kontaktpersoner endnu.</strong><p>Personer tilføjes kun, når titel og relation kan verificeres. LinkedIn-links bliver ikke gættet.</p></div>`;
  return `<div class="profile-cards">${p.contacts.map(c=>`<article class="profile-card"><div><strong>${profileEscape(c.name)}</strong><span>${profileEscape(c.title||"")}</span></div><div class="profile-card-links">${profileLink(c.linkedin,"LinkedIn")}${profileLink(c.sourceUrl,"Kilde")}</div></article>`).join("")}</div>`;
}
function renderProfileProjects(p){
  if(!p||(p.projects||[]).length===0)return `<div class="profile-empty"><strong>Ingen projekter registreret endnu.</strong><p>Kun projekter med en offentlig kilde tilføjes.</p></div>`;
  return `<div class="profile-cards">${p.projects.map(pr=>`<article class="profile-card project-card"><div class="project-status">${profileEscape(pr.status||"Status ikke oplyst")}</div><strong>${profileEscape(pr.name)}</strong><p>${profileEscape(pr.description||"")}</p>${profileLink(pr.url,"Projektkilde")}</article>`).join("")}</div>`;
}
function openBrandProfile(id,initialTab="overview"){
  const canonicalId=canonicalProfileBrandId(id);
  const b=operatorBrandView(canonicalId); if(!b)return;
  const p=profileForBrand(canonicalId);
  const verified=p?.verifiedAt?`Verificeret ${profileEscape(p.verifiedAt.split("-").reverse().join("."))}`:profileCompleteness(p);
  const ownerLabel=(b.municipalities||[]).join(", ")||(b.organizationType==="jointTreatmentOrganization"?"Fælles renseorganisation":"Forsyningsorganisation");
  const profileColor=state.organizationColors.get(canonicalId)||b.color||"#6d98a3";
  els.detailContent.innerHTML=`<header class="detail-head profile-head" data-organization-id="${profileEscape(canonicalId)}"><span class="profile-color" style="background:${profileEscape(profileColor)}" aria-hidden="true"></span><span class="detail-kicker">Forsyningsprofil</span><h2>${profileEscape(b.name)}</h2><div class="detail-owner">${profileEscape(ownerLabel)}</div><div class="profile-verification">${verified}</div></header><div class="profile-tabs" role="tablist"><button type="button" data-profile-tab="overview">Overblik</button><button type="button" data-profile-tab="people">Personer <span>${p?.contacts?.length||0}</span></button><button type="button" data-profile-tab="projects">Projekter <span>${p?.projects?.length||0}</span></button></div><div class="detail-body" id="profileTabBody"></div>`;
  els.detailPanel.classList.add("open");els.detailPanel.setAttribute("aria-hidden","false");
  const body=els.detailContent.querySelector("#profileTabBody");
  const tabs=[...els.detailContent.querySelectorAll("[data-profile-tab]")];
  function show(tab){
    tabs.forEach(x=>x.classList.toggle("active",x.dataset.profileTab===tab));
    body.innerHTML=tab==="people"?renderProfilePeople(p):tab==="projects"?renderProfileProjects(p):renderProfileOverview(b,p);
    const z=body.querySelector("[data-profile-zoom]");if(z)z.onclick=()=>zoomBrand(canonicalId);
  }
  tabs.forEach(x=>x.onclick=()=>show(x.dataset.profileTab));
  show(initialTab);
}
