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
function profileForBrand(id){return state.profiles.get(id)||null;}
function profileCompleteness(p){
  if(!p)return "Profil under research";
  const bits=[p.website,p.phone,(p.contacts||[]).length,(p.projects||[]).length].filter(Boolean).length;
  return bits>=4?"Research verificeret":"Delvist research'et";
}
function renderProfileOverview(b,p){
  const municipalities=(b.municipalities||[]).join(", ")||"Ikke relevant / anlægsejer";
  if(!p)return `<div class="profile-empty"><strong>Profilen er endnu ikke researchet.</strong><p>Kortets oplands- og renseanlægsdata virker stadig. Hjemmeside, kontaktpersoner og projekter tilføjes i den løbende profilresearch.</p></div>`;
  return `${p.summary?`<p class="profile-summary">${profileEscape(p.summary)}</p>`:""}
    <div class="fact-grid profile-facts">
      <div class="fact"><span>Telefon</span><strong>${profileEscape(p.phone||"Ikke oplyst")}</strong></div>
      <div class="fact"><span>E-mail</span><strong>${p.email?`<a href="mailto:${profileEscape(p.email)}">${profileEscape(p.email)}</a>`:"Ikke oplyst"}</strong></div>
      <div class="fact"><span>Forsyningsområde</span><strong>${profileEscape(municipalities)}</strong></div>
      <div class="fact"><span>Aktive renseanlæg</span><strong>${activePlantCountForBrand(b.id)}</strong></div>
      <div class="fact profile-wide"><span>Adresse</span><strong>${profileEscape(p.address||"Ikke oplyst")}</strong></div>
    </div>
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
  const b=state.brandById.get(id); if(!b)return;
  const p=profileForBrand(id);
  const verified=p?.verifiedAt?`Verificeret ${profileEscape(p.verifiedAt.split("-").reverse().join("."))}`:profileCompleteness(p);
  els.detailContent.innerHTML=`<header class="detail-head profile-head"><span class="detail-kicker">Forsyningsprofil</span><h2>${profileEscape(b.name)}</h2><div class="detail-owner">${profileEscape((b.municipalities||[]).join(", ")||"Renseanlægsoperatør")}</div><div class="profile-verification">${verified}</div></header><div class="profile-tabs" role="tablist"><button type="button" data-profile-tab="overview">Overblik</button><button type="button" data-profile-tab="people">Personer <span>${p?.contacts?.length||0}</span></button><button type="button" data-profile-tab="projects">Projekter <span>${p?.projects?.length||0}</span></button></div><div class="detail-body" id="profileTabBody"></div>`;
  els.detailPanel.classList.add("open");els.detailPanel.setAttribute("aria-hidden","false");
  const body=els.detailContent.querySelector("#profileTabBody");
  const tabs=[...els.detailContent.querySelectorAll("[data-profile-tab]")];
  function show(tab){
    tabs.forEach(x=>x.classList.toggle("active",x.dataset.profileTab===tab));
    body.innerHTML=tab==="people"?renderProfilePeople(p):tab==="projects"?renderProfileProjects(p):renderProfileOverview(b,p);
    const z=body.querySelector("[data-profile-zoom]");if(z)z.onclick=()=>zoomBrand(id);
  }
  tabs.forEach(x=>x.onclick=()=>show(x.dataset.profileTab));
  show(initialTab);
}
