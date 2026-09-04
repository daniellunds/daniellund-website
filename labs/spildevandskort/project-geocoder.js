// Conservative geographic enrichment for project markers using Danmarks officielle stednavne (DAWA).
// Normal visitors load a curated static dataset. DAWA lookups only run in explicit generator mode.
// Map priority: live PULS plant -> curated project anchor -> curated DAWA area -> no marker.
(function installProjectGeocoder(){
  if(typeof projectLocation!=="function" || typeof initProjects!=="function")return;

  const DAWA_BASE="https://api.dataforsyningen.dk";
  const GENERATE_MODE=new URLSearchParams(location.search).has("generateGeocodes");
  state.projectResolvedLocations=new Map();
  state.projectGeorefQa={mode:GENERATE_MODE?"generator":"static",resolved:0,attempted:0,staticLoaded:0,ignored:0,errors:0,withheldLinear:0};

  const genericWords=new Set([
    "projekt","projekter","kloak","kloakering","kloakprojekt","kloaksanering","sanering","separatkloakering","separering",
    "renseanlæg","renseanlaeg","centralrenseanlæg","centralrenseanlaeg","rensetrin","rensning","renseproces","udbygning","udvidelse",
    "renovering","modernisering","opgradering","etape","fase","anlæg","anlaeg","nyt","ny","nye","ved","på","i","langs","mod",
    "bassin","regnvandsbassin","skybrudstunnel","tunnel","klimaprojekt","klimatilpasning","pumpestation","ledning","udløbsledning",
    "spildevandssystemet","spildevand","strukturplan","plan","område","området","by","program","indsats","overløb","overløbsreduktion"
  ].map(normalize));

  function projectNeedsLinearGeometry(pr){
    const t=normalize(`${pr.name||""} ${pr.description||""}`);
    return /skybrudstunnel|\btunnel\b|transportledning|transportrør|transportroer|udløbsledning|udloebsledning|pumpeledning|\blangs\b|\bkm nyt transportanlæg\b|\bkm nyt transportanlaeg\b/.test(t);
  }

  function cleanCandidate(value=""){
    let s=String(value)
      .replace(/\([^)]*\)/g," ")
      .replace(/\b(?:etape|fase)\s*\d+[a-z.\-]*\b/gi," ")
      .replace(/\b20\d{2}(?:\s*[–—-]\s*20\d{2})?\b/g," ")
      .replace(/[/:]/g," ")
      .replace(/\s+/g," ")
      .trim();
    if(!s)return null;
    const words=s.split(" ").filter(Boolean).filter(w=>!genericWords.has(normalize(w)) && !/^\d+$/.test(w));
    if(!words.length)return null;
    while(words.length && /^(og|af|for|til|fra|den|det|de)$/i.test(words[0]))words.shift();
    while(words.length && /^(og|af|for|til|fra|den|det|de)$/i.test(words.at(-1)))words.pop();
    if(!words.length || words.length>4)return null;
    const out=words.join(" ").replace(/\s+/g," ").trim();
    return out.length>=3?out:null;
  }

  function projectPlaceCandidates(pr){
    const seeds=[];
    const title=String(pr.name||"");
    title.split(/[–—,]/).forEach(x=>seeds.push(x));
    title.split("/").forEach(x=>seeds.push(x));
    title.split(/\s+og\s+/i).forEach(x=>seeds.push(x));
    for(const m of title.matchAll(/\b(?:i|ved|på|langs|mod|fra|til)\s+([A-ZÆØÅ][A-Za-zÆØÅæøå .'-]{2,42})/g)){
      seeds.push(m[1].split(/[,.();–—]/)[0]);
    }
    let stripped=title;
    for(const word of genericWords){
      const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      stripped=stripped.replace(new RegExp(`\\b${escaped}\\b`,`gi`)," ");
    }
    seeds.push(stripped);
    const out=[];
    for(const seed of seeds){
      for(const part of String(seed).split(/\s+og\s+/i)){
        const c=cleanCandidate(part);if(!c)continue;
        const n=normalize(c);if(!out.some(x=>normalize(x)===n))out.push(c);
      }
    }
    return out.slice(0,4);
  }

  function municipalitiesForBrand(brandId){
    return (state.brandById.get(brandId)?.municipalities||[]).map(normalize).filter(Boolean);
  }
  function placeMunicipalities(item,place){
    const raw=place?.kommuner||item?.kommuner||[];
    return raw.map(x=>normalize(typeof x==="string"?x:(x?.navn||""))).filter(Boolean);
  }
  function placeName(item,place){return item?.navn||item?.tekst||place?.primærtnavn||place?.navn||"";}
  function placeCenter(item,place){
    const c=place?.visueltcenter||item?.visueltcenter;
    if(!Array.isArray(c)||c.length<2)return null;
    const lon=Number(c[0]),lat=Number(c[1]);
    return Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=7.5&&lon<=16&&lat>=54&&lat<=58.5?{lon,lat}:null;
  }
  function municipalMatch(brandMunicipalities,item,place){
    if(!brandMunicipalities.length)return false;
    const pm=placeMunicipalities(item,place);
    return pm.some(m=>brandMunicipalities.some(b=>m===b||m.includes(b)||b.includes(m)));
  }
  function scorePlace(candidate,brandMunicipalities,item,place){
    const name=normalize(placeName(item,place)),q=normalize(candidate);if(!name||!q)return -1;
    let score=0;
    if(name===q)score+=8;else if(name.startsWith(q)||q.startsWith(name))score+=5;else if(name.includes(q)||q.includes(name))score+=3;
    if(municipalMatch(brandMunicipalities,item,place))score+=7;
    const type=normalize(place?.hovedtype||item?.hovedtype||"");if(type==="bebyggelse")score+=2;
    const subtype=normalize(place?.undertype||item?.undertype||"");if(["by","bydel","sommerhusområde","landsby","bebyggelse"].includes(subtype))score+=1;
    return score;
  }
  async function hydrateDawaResult(item){
    let place=item?.sted||item;if(placeCenter(item,place))return place;
    const id=item?.sted_id||item?.stedid||item?.sted?.id||item?.stedId;if(!id)return place;
    try{return await fetchJSON(`${DAWA_BASE}/steder/${encodeURIComponent(id)}`);}catch{return place;}
  }
  async function resolveCandidate(candidate,pr){
    const brandMunicipalities=municipalitiesForBrand(pr.brandId);if(!brandMunicipalities.length)return null;
    const url=`${DAWA_BASE}/stednavne2?q=${encodeURIComponent(candidate)}&fuzzy=true&per_side=8`;
    const rows=await fetchJSON(url);let best=null,bestScore=-1;
    for(const item of Array.isArray(rows)?rows.slice(0,5):[]){
      const place=await hydrateDawaResult(item),center=placeCenter(item,place);if(!center||!municipalMatch(brandMunicipalities,item,place))continue;
      const score=scorePlace(candidate,brandMunicipalities,item,place);
      if(score>bestScore){bestScore=score;best={...center,label:placeName(item,place)||candidate,precision:"område",strategy:"dawa",sourceUrl:url,score};}
    }
    return bestScore>=15?best:null;
  }
  async function resolveProjectViaDawa(pr){
    if(projectNeedsLinearGeometry(pr))return null;
    for(const candidate of projectPlaceCandidates(pr)){
      try{const loc=await resolveCandidate(candidate,pr);if(loc)return {...loc,query:candidate};}
      catch(err){state.projectGeorefQa.errors++;console.debug("DAWA project geocode skipped",pr.name,candidate,err?.message||err);}
    }
    return null;
  }

  function projectHasMultipleNamedAreas(pr){
    const title=String(pr.name||"");
    return /,.*\bog\b|\/.+[,/]|\b(?:og)\b.*\b(?:og)\b/i.test(title);
  }
  function projectIsMunicipalityWideOrStrategic(pr){
    const t=normalize(pr.name||"");
    return /\bkommune\b/.test(t)||/renseanlægsstruktur|renseanlaegsstruktur/.test(t);
  }

  async function loadStaticProjectGeocodes(){
    try{
      const raw=await fetchJSON(`${PROD}/project-geocodes.json`);
      const byId=new Map(state.projects.map(pr=>[pr.id,pr]));
      for(const row of raw.projects||[]){
        const pr=byId.get(row.id);
        const lat=Number(row.lat),lon=Number(row.lon);
        if(!pr||pr.name!==row.name||!Number.isFinite(lat)||!Number.isFinite(lon)||projectNeedsLinearGeometry(pr)||projectHasMultipleNamedAreas(pr)||projectIsMunicipalityWideOrStrategic(pr)){
          state.projectGeorefQa.ignored++;continue;
        }
        state.projectResolvedLocations.set(pr.id,{lat,lon,label:row.label||pr.name,precision:"område",strategy:"dawa",sourceUrl:"https://danmarksadresser.dk/data/stednavne"});
        state.projectGeorefQa.staticLoaded++;
      }
      state.projectGeorefQa.resolved=state.projectResolvedLocations.size;
    }catch(err){
      state.projectGeorefQa.errors++;
      console.warn("Statiske projektplaceringer kunne ikke indlæses",err);
    }
  }

  async function enrichProjectLocationsFromDawa(){
    const pending=[];
    for(const pr of state.projects){
      if(projectPlantAnchor(pr)||projectNamedAreaAnchor(pr))continue;
      if(projectNeedsLinearGeometry(pr)||projectHasMultipleNamedAreas(pr)||projectIsMunicipalityWideOrStrategic(pr)){
        state.projectGeorefQa.withheldLinear++;continue;
      }
      if(projectPlaceCandidates(pr).length)pending.push(pr);
    }
    state.projectGeorefQa.attempted=pending.length;
    let cursor=0;
    const workers=Array.from({length:Math.min(6,pending.length)},async()=>{
      while(cursor<pending.length){const pr=pending[cursor++],loc=await resolveProjectViaDawa(pr);if(loc)state.projectResolvedLocations.set(pr.id,loc);}
    });
    await Promise.all(workers);
    state.projectGeorefQa.resolved=state.projectResolvedLocations.size;
  }

  function updateWithheldCounts(){
    state.projectGeorefQa.withheldLinear=state.projects.filter(pr=>!projectPlantAnchor(pr)&&!projectNamedAreaAnchor(pr)&&(projectNeedsLinearGeometry(pr)||projectHasMultipleNamedAreas(pr)||projectIsMunicipalityWideOrStrategic(pr))).length;
  }
  function projectGeorefStrategyCounts(){
    const counts={puls:0,anchor:0,dawa:0,withheld:0};
    for(const pr of state.projects){const loc=projectLocation(pr);if(!loc){counts.withheld++;continue;}counts[loc.strategy]=(counts[loc.strategy]||0)+1;}
    return counts;
  }

  window.projectPlaceCandidates=projectPlaceCandidates;
  window.projectGeorefStrategyCounts=projectGeorefStrategyCounts;
  window.projectNeedsLinearGeometry=projectNeedsLinearGeometry;
  window.projectGeorefState=()=>({...state.projectGeorefQa,strategies:projectGeorefStrategyCounts()});

  // Critical safety rule: no utility-area fallback on the project map.
  projectLocation=function(pr){return projectPlantAnchor(pr)||projectNamedAreaAnchor(pr)||state.projectResolvedLocations.get(pr.id)||null;};

  const coreProjectRowElement=projectRowElement;
  projectRowElement=function(pr){
    const row=coreProjectRowElement(pr);
    if(!projectLocation(pr)){row.classList.add("unmapped");row.title="Projektet er registreret, men har endnu ingen tilstrækkeligt verificeret kortplacering";}
    return row;
  };

  const coreOpenProject=openProject;
  openProject=function(pr){
    coreOpenProject(pr);
    if(projectLocation(pr))return;
    const note=els.detailContent.querySelector(".source-note");
    if(note)note.innerHTML="<strong>Kortplacering:</strong> Projektet er ikke vist med en markør, fordi der endnu ikke er verificeret en tilstrækkeligt præcis geografi. Det forhindrer misvisende placeringer i forsyningsområdet.";
  };

  const coreInitProjects=initProjects;
  initProjects=async function(){
    await coreInitProjects();
    if(GENERATE_MODE)await enrichProjectLocationsFromDawa();else await loadStaticProjectGeocodes();
    updateWithheldCounts();
    renderProjects();renderList();
    console.info("PROJECT_GEOREF_READY",window.projectGeorefState());
  };
})();
