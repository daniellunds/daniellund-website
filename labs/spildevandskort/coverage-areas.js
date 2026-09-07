// Administrative/market coverage backdrop derived from official municipality boundaries.
// Important: this is NOT a sewer catchment layer. Municipalities with ambiguous utility ownership
// are intentionally withheld until their internal split has been verified from an authoritative source.
(function initAdministrativeCoverage(){
  const MUNICIPALITY_URL="https://api.dataforsyningen.dk/kommuner?format=geojson&udenforkommuneinddeling=false";
  const VERIFIED_OVERRIDES={
    // Læsø has no mapped Plandata catchment in brands.json, but its wastewater utility is known in the app.
    "læsø":{brandId:"laesoe-forsyning",reason:"Explicit utility profile for Læsø Forsyning"},
    // Plandata metadata uses the older/name-variant 'Københavns'; the official municipality is 'København'.
    // Københavns Kommune explicitly identifies HOFOR Spildevand København A/S as its wastewater company.
    "københavn":{brandId:"hofor",reason:"Verified against Københavns Kommune and HOFOR",sourceUrl:"https://www.kk.dk/dagsordener-og-referater/Klima-%2C%20Milj%C3%B8-%20og%20Teknikudvalget/m%C3%B8de-24022026/referat/punkt-20"}
  };
  const norm=s=>String(s||"").toLocaleLowerCase("da").trim().replace(/\s+/g," ");
  state.coverageLayer=null;
  state.coverageData=null;
  state.coverageQa=null;

  function municipalityCandidates(name){
    const key=norm(name),ids=[];
    for(const b of state.brands){
      if((b.municipalities||[]).some(m=>norm(m)===key))ids.push(b.id);
    }
    const override=VERIFIED_OVERRIDES[key];
    if(!ids.length&&override?.brandId)ids.push(override.brandId);
    return [...new Set(ids)];
  }

  function classify(feature){
    const p=feature.properties||{};
    const name=p.navn||p.name||p.NAVN||"";
    const key=norm(name),candidates=municipalityCandidates(name),override=VERIFIED_OVERRIDES[key]||null;
    if(candidates.length===1)return {status:"assigned",brandId:candidates[0],name,override};
    if(candidates.length>1)return {status:"ambiguous",brandIds:candidates,name,override};
    return {status:"unmapped",brandIds:[],name,override};
  }

  function colorFor(feature){
    const c=classify(feature);
    return c.status==="assigned"?(state.brandById.get(c.brandId)?.color||"#657D84"):"#FFFFFF";
  }

  function renderCoverage(){
    if(state.coverageLayer){state.coverageLayer.remove();state.coverageLayer=null;}
    const checkbox=document.getElementById("showCoverage");
    if(!state.coverageData||checkbox?.checked===false)return;
    if(!state.map.getPane("coveragePane")){
      const pane=state.map.createPane("coveragePane");pane.style.zIndex="320";pane.style.pointerEvents="none";
    }
    const features=(state.coverageData.features||[]).filter(f=>{
      const c=classify(f);return c.status==="assigned"&&state.selected.has(c.brandId);
    });
    state.coverageLayer=L.geoJSON({type:"FeatureCollection",features},{
      pane:"coveragePane",
      interactive:false,
      style:f=>({color:colorFor(f),weight:.8,opacity:.32,fillColor:colorFor(f),fillOpacity:.105})
    }).addTo(state.map);
  }

  async function waitForBrands(){
    for(let i=0;i<100;i++){
      if(state.brands?.length&&state.brandById?.size)return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error("Forsyningsmetadata blev ikke klar");
  }

  async function loadCoverage(){
    try{
      await waitForBrands();
      const response=await fetch(MUNICIPALITY_URL);
      if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
      const raw=await response.json();
      const fc=raw.type==="FeatureCollection"?raw:{type:"FeatureCollection",features:Array.isArray(raw)?raw.filter(x=>x.type==="Feature"):[]};
      if(!fc.features?.length)throw new Error("Ingen kommunegeometrier i svaret");
      state.coverageData=fc;
      const rows=fc.features.map(classify);
      state.coverageQa={
        source:"Dataforsyningen · kommuner",
        municipalities:rows.length,
        assigned:rows.filter(x=>x.status==="assigned").length,
        verifiedOverrides:rows.filter(x=>x.status==="assigned"&&x.override).map(x=>({name:x.name,brandId:x.brandId,reason:x.override.reason,sourceUrl:x.override.sourceUrl||null})),
        ambiguous:rows.filter(x=>x.status==="ambiguous").map(x=>({name:x.name,brandIds:x.brandIds})),
        unmapped:rows.filter(x=>x.status==="unmapped").map(x=>x.name)
      };
      console.info("ADMIN_COVERAGE_QA",state.coverageQa);
      renderCoverage();
    }catch(err){
      console.warn("Administrative forsyningsområder kunne ikke indlæses",err);
      state.coverageQa={error:String(err?.message||err)};
    }
  }

  const checkbox=document.getElementById("showCoverage");
  if(checkbox)checkbox.addEventListener("change",renderCoverage);

  // Keep backdrop synchronized with utility selection and recoloring.
  const coreRenderPolygons=renderPolygons;
  renderPolygons=function(){coreRenderPolygons();renderCoverage();};
  window.renderAdministrativeCoverage=renderCoverage;
  window.spildevandskortCoverageState=()=>state.coverageQa;
  loadCoverage();
})();
