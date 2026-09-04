// Conservative geographic enrichment for project markers using Danmarks officielle stednavne (DAWA).
// Priority remains: PULS plant -> curated static anchor -> DAWA place -> utility-area fallback.
(function installProjectGeocoder(){
  if(typeof projectLocation!=="function" || typeof initProjects!=="function")return;

  const DAWA_BASE="https://api.dataforsyningen.dk";
  const CACHE_KEY="spildevandskort-project-geocodes-v2";
  state.projectResolvedLocations=new Map();
  state.projectGeorefQa={resolved:0,attempted:0,cacheHits:0,errors:0};

  const genericWords=new Set([
    "projekt","projekter","kloak","kloakering","kloakprojekt","kloaksanering","sanering","separatkloakering","separering",
    "renseanlæg","renseanlaeg","centralrenseanlæg","centralrenseanlaeg","rensetrin","rensning","renseproces","udbygning","udvidelse",
    "renovering","modernisering","opgradering","etape","fase","anlæg","anlaeg","nyt","ny","nye","ved","på","i","langs","mod",
    "bassin","regnvandsbassin","skybrudstunnel","tunnel","klimaprojekt","klimatilpasning","pumpestation","ledning","udløbsledning",
    "spildevandssystemet","spildevand","strukturplan","plan","område","området","by","program","indsats","overløb","overløbsreduktion"
  ].map(normalize));

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
    // Remove dangling conjunctions/articles after generic terms have been stripped.
    while(words.length && /^(og|af|for|til|fra|den|det|de)$/i.test(words[0]))words.shift();
    while(words.length && /^(og|af|for|til|fra|den|det|de)$/i.test(words.at(-1)))words.pop();
    if(!words.length || words.length>4)return null;
    const out=words.join(" ").replace(/\s+/g," ").trim();
    return out.length>=3?out:null;
  }

  function projectPlaceCandidates(pr){
    const seeds=[];
    const title=String(pr.name||"");
    const text=`${title}. ${pr.description||""}`;

    // Comma- and dash-separated title segments are usually the strongest signals.
    title.split(/[–—,]/).forEach(x=>seeds.push(x));
    title.split("/").forEach(x=>seeds.push(x));
    title.split(/\s+og\s+/i).forEach(x=>seeds.push(x));

    // Explicit Danish location prepositions in title/description.
    for(const m of text.matchAll(/\b(?:i|ved|på|langs|mod|fra|til)\s+([A-ZÆØÅ][A-Za-zÆØÅæøå .'-]{2,42})/g)){
      seeds.push(m[1].split(/[,.();–—]/)[0]);
    }

    // Strip common project nouns from the complete title, e.g. "Svanemøllen Skybrudstunnel" -> "Svanemøllen".
    let stripped=title;
    for(const word of genericWords){
      const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      stripped=stripped.replace(new RegExp(`\\b${escaped}\\b`,`gi`)," ");
    }
    seeds.push(stripped);

    const out=[];
    for(const seed of seeds){
      for(const part of String(seed).split(/\s+og\s+/i)){
        const c=cleanCandidate(part);
        if(!c)continue;
        const n=normalize(c);
        if(!out.some(x=>normalize(x)===n))out.push(c);
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
  function placeName(item,place){
    return item?.navn||item?.tekst||place?.primærtnavn||place?.navn||"";
  }
  function placeCenter(item,place){
    const c=place?.visueltcenter||item?.visueltcenter;
    if(!Array.isArray(c)||c.length<2)return null;
    const lon=Number(c[0]),lat=Number(c[1]);
    if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<7.5||lon>16||lat<54||lat>58.5)return null;
    return {lon,lat};
  }
  function municipalMatch(brandMunicipalities,item,place){
    if(!brandMunicipalities.length)return false;
    const pm=placeMunicipalities(item,place);
    return pm.some(m=>brandMunicipalities.some(b=>m===b||m.includes(b)||b.includes(m)));
  }
  function scorePlace(candidate,brandMunicipalities,item,place){
    const name=normalize(placeName(item,place));
    const q=normalize(candidate);
    if(!name||!q)return -1;
    let score=0;
    if(name===q)score+=8;
    else if(name.startsWith(q)||q.startsWith(name))score+=5;
    else if(name.includes(q)||q.includes(name))score+=3;
    if(municipalMatch(brandMunicipalities,item,place))score+=7;
    const type=normalize(place?.hovedtype||item?.hovedtype||"");
    if(type==="bebyggelse")score+=2;
    const subtype=normalize(place?.undertype||item?.undertype||"");
    if(["by","bydel","sommerhusområde","landsby","bebyggelse"].includes(subtype))score+=1;
    return score;
  }

  async function hydrateDawaResult(item){
    let place=item?.sted||item;
    if(placeCenter(item,place))return place;
    const id=item?.sted_id||item?.stedid||item?.sted?.id||item?.stedId;
    if(!id)return place;
    try{return await fetchJSON(`${DAWA_BASE}/steder/${encodeURIComponent(id)}`);}catch{return place;}
  }

  async function resolveCandidate(candidate,pr){
    const brandMunicipalities=municipalitiesForBrand(pr.brandId);
    if(!brandMunicipalities.length)return null;
    const url=`${DAWA_BASE}/stednavne2?q=${encodeURIComponent(candidate)}&fuzzy=true&per_side=8`;
    const rows=await fetchJSON(url);
    let best=null,bestScore=-1;
    for(const item of Array.isArray(rows)?rows.slice(0,5):[]){
      const place=await hydrateDawaResult(item);
      const center=placeCenter(item,place);if(!center)continue;
      const score=scorePlace(candidate,brandMunicipalities,item,place);
      // Municipality agreement is mandatory; fuzzy text alone is never enough.
      if(!municipalMatch(brandMunicipalities,item,place))continue;
      if(score>bestScore){
        bestScore=score;
        best={...center,label:placeName(item,place)||candidate,precision:"område",strategy:"dawa",sourceUrl:url,score};
      }
    }
    return bestScore>=11?best:null;
  }

  async function resolveProjectViaDawa(pr){
    const candidates=projectPlaceCandidates(pr);
    for(const candidate of candidates){
      try{
        const loc=await resolveCandidate(candidate,pr);
        if(loc)return {...loc,query:candidate};
      }catch(err){
        state.projectGeorefQa.errors++;
        console.debug("DAWA project geocode skipped",pr.name,candidate,err?.message||err);
      }
    }
    return null;
  }

  function loadCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"{}");}catch{return {};}
  }
  function saveCache(cache){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache));}catch{}
  }

  async function enrichProjectLocationsFromDawa(){
    const cache=loadCache();
    const pending=[];
    for(const pr of state.projects){
      // Do not spend requests on projects already tied safely to PULS or a curated anchor.
      if(projectPlantAnchor(pr)||projectNamedAreaAnchor(pr))continue;
      const cached=cache[pr.id];
      if(cached?.name===pr.name && cached?.location?.strategy==="dawa"){
        state.projectResolvedLocations.set(pr.id,cached.location);
        state.projectGeorefQa.cacheHits++;
        continue;
      }
      if(projectPlaceCandidates(pr).length)pending.push(pr);
    }

    state.projectGeorefQa.attempted=pending.length;
    let cursor=0;
    const workers=Array.from({length:Math.min(6,pending.length)},async()=>{
      while(cursor<pending.length){
        const pr=pending[cursor++];
        const loc=await resolveProjectViaDawa(pr);
        if(!loc)continue;
        state.projectResolvedLocations.set(pr.id,loc);
        cache[pr.id]={name:pr.name,location:loc,updatedAt:new Date().toISOString().slice(0,10)};
      }
    });
    await Promise.all(workers);
    saveCache(cache);
    state.projectGeorefQa.resolved=state.projectResolvedLocations.size;
    if(state.tab==="projects"){renderProjects();renderList();}
    console.info("PROJECT_GEOREF_READY",{
      ...state.projectGeorefQa,
      strategies:projectGeorefStrategyCounts()
    });
  }

  function projectGeorefStrategyCounts(){
    const counts={puls:0,anchor:0,dawa:0,fallback:0,missing:0};
    for(const pr of state.projects){
      const loc=projectLocation(pr);
      if(!loc){counts.missing++;continue;}
      counts[loc.strategy]=(counts[loc.strategy]||0)+1;
    }
    return counts;
  }
  window.projectPlaceCandidates=projectPlaceCandidates;
  window.projectGeorefStrategyCounts=projectGeorefStrategyCounts;

  projectLocation=function(pr){
    return projectPlantAnchor(pr)||projectNamedAreaAnchor(pr)||state.projectResolvedLocations.get(pr.id)||projectBrandFallback(pr);
  };

  const coreInitProjects=initProjects;
  initProjects=async function(){
    await coreInitProjects();
    void enrichProjectLocationsFromDawa();
  };
})();
