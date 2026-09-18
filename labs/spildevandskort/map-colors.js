// Neighbor-aware wastewater utility colors.
// Stable legacy IDs resolve through the canonical registry. One canonical
// organization therefore has one color across every presentation surface.
(function initNeighborContrastColors(){
  const GRID_DEG=0.03;
  const PROXIMITY_DEG=0.012;
  const PALETTE=["#0057B8","#E4D600","#E3261C","#35A7D6","#D51BC4","#138A2E","#E67E22","#7436A8","#00A875","#A91D63"];
  const ADMIN_COVERAGE_URL="./data/municipalities.geojson";
  const ADMIN_COVERAGE_FALLBACK_URL="https://api.dataforsyningen.dk/kommuner?format=geojson&udenforkommuneinddeling=false";
  const normMunicipality=s=>String(s||"").toLocaleLowerCase("da").trim().replace(/\s+/g," ");
  const organizationId=id=>{
    const canonical=state?.canonicalRegistry?.organizationIdForLegacyBrandId(id);
    if(canonical)return canonical;
    // Transitional fallback keeps the old runtime usable if canonical data fails to load.
    const operator=typeof currentOperatorForBrand==="function"?currentOperatorForBrand(id).operatorBrandId:id;
    return `legacy:${operator}`;
  };

  function featureBBox(feature){
    const coords=feature?.geometry?.coordinates;if(!coords)return null;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const visit=value=>{
      if(!Array.isArray(value))return;
      if(value.length>=2&&Number.isFinite(+value[0])&&Number.isFinite(+value[1])){
        const x=+value[0],y=+value[1];
        if(x>=5&&x<=16&&y>=54&&y<=58.5){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}return;
      }
      for(const child of value)visit(child);
    };
    visit(coords);return Number.isFinite(minX)?[minX,minY,maxX,maxY]:null;
  }

  function buildNeighbourGraph(features,brands){
    const graph=new Map(brands.map(b=>[b.id,new Set()])),cells=new Map();
    const add=(x,y,id)=>{const key=`${x}:${y}`;if(!cells.has(key))cells.set(key,new Set());cells.get(key).add(id);};
    for(const f of features||[]){
      const id=f?.properties?.brandId;if(!id||!graph.has(id))continue;
      const box=featureBBox(f);if(!box)continue;
      const [minX,minY,maxX,maxY]=box;
      const x0=Math.floor((minX-PROXIMITY_DEG)/GRID_DEG),x1=Math.floor((maxX+PROXIMITY_DEG)/GRID_DEG);
      const y0=Math.floor((minY-PROXIMITY_DEG)/GRID_DEG),y1=Math.floor((maxY+PROXIMITY_DEG)/GRID_DEG);
      if((x1-x0+1)*(y1-y0+1)<=64){for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)add(x,y,id);}
      else{for(let x=x0;x<=x1;x++){add(x,y0,id);add(x,y1,id);}for(let y=y0+1;y<y1;y++){add(x0,y,id);add(x1,y,id);}add(Math.floor((x0+x1)/2),Math.floor((y0+y1)/2),id);}
    }
    for(const ids of cells.values()){
      const arr=[...ids];for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){graph.get(arr[i])?.add(arr[j]);graph.get(arr[j])?.add(arr[i]);}
    }
    const byName=new Map(brands.map(b=>[String(b.name||"").toLocaleLowerCase("da"),b.id]));
    const connectNames=(a,b)=>{const ai=byName.get(a.toLocaleLowerCase("da")),bi=byName.get(b.toLocaleLowerCase("da"));if(ai&&bi){graph.get(ai)?.add(bi);graph.get(bi)?.add(ai);}};
    connectNames("HOFOR","Ishøj Forsyning");
    connectNames("Energi Viborg Vand","Ikast-Brande Spildevand");
    return graph;
  }

  function groupedGraph(graph,brands){
    const groups=new Map(),sourceCounts=new Map();
    for(const b of brands){const g=organizationId(b.id);if(!groups.has(g))groups.set(g,new Set());sourceCounts.set(g,(sourceCounts.get(g)||0)+(b.sourceFeatureCount||0));}
    for(const [a,ns] of graph){const ga=organizationId(a);for(const b of ns){const gb=organizationId(b);if(ga===gb)continue;groups.get(ga)?.add(gb);groups.get(gb)?.add(ga);}}
    return {groups,sourceCounts};
  }

  function hexRgb(hex){const h=String(hex).replace("#","");return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);}
  function oklab(hex){
    let [r,g,b]=hexRgb(hex);const lin=c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);r=lin(r);g=lin(g);b=lin(b);
    let l=0.4122214708*r+0.5363325363*g+0.0514459929*b,m=0.2119034982*r+0.6806995451*g+0.1073969566*b,s=0.0883024619*r+0.2817188376*g+0.6299787005*b;
    l=Math.cbrt(l);m=Math.cbrt(m);s=Math.cbrt(s);
    return [0.2104542553*l+0.793617785*m-0.0040720468*s,1.9779984951*l-2.428592205*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.808675766*s];
  }
  const LAB=new Map(PALETTE.map(c=>[c,oklab(c)]));
  function colorDistance(a,b){const aa=LAB.get(a)||oklab(a),bb=LAB.get(b)||oklab(b);return Math.hypot(aa[0]-bb[0],aa[1]-bb[1],aa[2]-bb[2]);}

  function assignColors(graph,brands){
    const {groups,sourceCounts}=groupedGraph(graph,brands),assignedGroups=new Map(),usage=new Map(PALETTE.map(c=>[c,0]));
    const remaining=new Set(groups.keys());
    while(remaining.size){
      let next=null,bestRank=null;
      for(const id of remaining){
        const neighbourColors=new Set([...(groups.get(id)||[])].map(n=>assignedGroups.get(n)).filter(Boolean));
        const rank=[neighbourColors.size,groups.get(id)?.size||0,sourceCounts.get(id)||0,String(id)];
        if(!bestRank||rank[0]>bestRank[0]||(rank[0]===bestRank[0]&&rank[1]>bestRank[1])||(rank[0]===bestRank[0]&&rank[1]===bestRank[1]&&rank[2]>bestRank[2])||(rank[0]===bestRank[0]&&rank[1]===bestRank[1]&&rank[2]===bestRank[2]&&rank[3]<bestRank[3])){next=id;bestRank=rank;}
      }
      const neighbourColors=[...(groups.get(next)||[])].map(n=>assignedGroups.get(n)).filter(Boolean),forbidden=new Set(neighbourColors);
      let candidates=PALETTE.filter(c=>!forbidden.has(c));if(!candidates.length)candidates=PALETTE.slice();
      let winner=candidates[0],winnerScore=-Infinity;
      for(const c of candidates){const ds=neighbourColors.map(nc=>colorDistance(c,nc)),min=ds.length?Math.min(...ds):1,avg=ds.length?ds.reduce((a,b)=>a+b,0)/ds.length:1;const score=min*1000+avg*120-(usage.get(c)||0)*4-PALETTE.indexOf(c)*0.0001;if(score>winnerScore){winner=c;winnerScore=score;}}
      assignedGroups.set(next,winner);usage.set(winner,(usage.get(winner)||0)+1);remaining.delete(next);
    }
    const assigned=new Map();
    for(const b of brands){const canonicalId=organizationId(b.id),color=assignedGroups.get(canonicalId)||b.color||"#58757E";b.organizationId=canonicalId.startsWith("org:")?canonicalId:null;b.color=color;assigned.set(b.id,color);}
    state.organizationColors=new Map([...assignedGroups].filter(([id])=>id.startsWith("org:")));
    return {assigned,assignedGroups,organizationGroups:groups.size,operatorGroups:groups.size};
  }

  function qa(graph,brands,result){
    const {assigned,organizationGroups,operatorGroups}=result,pairs=[];
    for(const [a,ns] of graph)for(const b of ns)if(a<b&&organizationId(a)!==organizationId(b))pairs.push([a,b]);
    const sameOrganizationPairs=[];for(const [a,ns] of graph)for(const b of ns)if(a<b&&organizationId(a)===organizationId(b))sameOrganizationPairs.push([a,b]);
    const distances=pairs.map(([a,b])=>colorDistance(assigned.get(a)||"#58757E",assigned.get(b)||"#58757E"));
    const sameColorPairs=pairs.filter(([a,b])=>assigned.get(a)&&assigned.get(a)===assigned.get(b));
    const find=name=>brands.find(b=>String(b.name).toLocaleLowerCase("da")===name.toLocaleLowerCase("da"));
    const hofor=find("HOFOR"),ishoej=find("Ishøj Forsyning");
    const canonicalMappings=brands.filter(b=>organizationId(b.id).startsWith("org:")).length;
    return {strategy:"canonical-organization-near-neighbour-max-contrast",palette:PALETTE.slice(),organizationGroups,operatorGroups,canonicalMappings,legacyBrandCount:brands.length,neighbourPairs:pairs.length,sameOrganizationNeighbourPairs:sameOrganizationPairs.length,sameOperatorNeighbourPairs:sameOrganizationPairs.length,sameColorNeighbourPairs:sameColorPairs.length,minNeighbourDistance:distances.length?Math.min(...distances):null,proximityGridDegrees:GRID_DEG,hoforIshoej:hofor&&ishoej?{hofor:hofor.color,ishoej:ishoej.color,distance:colorDistance(hofor.color,ishoej.color)}:null};
  }

  function municipalityBrandId(name,brands){
    const key=normMunicipality(name),ids=[];
    for(const b of brands||[])if((b.municipalities||[]).some(m=>normMunicipality(m)===key))ids.push(b.id);
    if(!ids.length&&key==="københavn")ids.push("hofor");
    if(!ids.length&&key==="læsø")ids.push("laesoe-forsyning");
    const unique=[...new Set(ids)].filter(id=>(brands||[]).some(b=>b.id===id));
    return unique.length===1?unique[0]:null;
  }

  async function fetchJsonWithTimeout(url,timeoutMs){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{signal:controller.signal,cache:"default"});
      if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    }finally{clearTimeout(timer);}
  }

  async function prepareCanonicalColors(){
    if(state.colorQa?.basis==="administrative-coverage-preload")return state.colorQa;
    let raw,source="Lokal cache · Dataforsyningen";
    try{
      raw=await fetchJsonWithTimeout(ADMIN_COVERAGE_URL,15000);
    }catch(localErr){
      console.warn("Farvegrundlag: lokal kommune-cache kunne ikke indlæses; prøver Dataforsyningen direkte",localErr);
      raw=await fetchJsonWithTimeout(ADMIN_COVERAGE_FALLBACK_URL,20000);
      source="Dataforsyningen · live fallback";
    }
    const fc=raw?.type==="FeatureCollection"?raw:{type:"FeatureCollection",features:Array.isArray(raw)?raw.filter(x=>x?.type==="Feature"):[]};
    if(!fc.features?.length)throw new Error("Farvegrundlag mangler kommunegeometrier");
    const colorFeatures=fc.features.flatMap(feature=>{
      const p=feature.properties||{},name=p.navn||p.name||p.NAVN||"",brandId=municipalityBrandId(name,state.brands);
      return brandId?[{...feature,properties:{...p,brandId}}]:[];
    });
    if(colorFeatures.length!==fc.features.length)throw new Error(`Farvegrundlag kunne kun koble ${colorFeatures.length} af ${fc.features.length} kommuner`);
    const out=window.applyNeighborContrastColors(colorFeatures,state.brands);
    out.basis="administrative-coverage-preload";
    out.coverageSource=source;
    out.municipalities=fc.features.length;
    out.assignedMunicipalities=colorFeatures.length;
    state.preloadedMunicipalityCoverageData=fc;
    state.preloadedMunicipalityCoverageSource=source;
    console.info("UTILITY_COLOR_PRELOAD_READY",out);
    return out;
  }

  window.applyNeighborContrastColors=(features,brands)=>{const graph=buildNeighbourGraph(features,brands),result=assignColors(graph,brands),out=qa(graph,brands,result);if(typeof state!=="undefined")state.colorQa=out;console.info("UTILITY_COLOR_QA",out);return out;};
  window.prepareCanonicalColors=prepareCanonicalColors;
  window.spildevandskortColorState=()=>state?.colorQa||null;

  if(typeof renderPolygons==="function"){
    const coreRenderPolygons=renderPolygons;
    renderPolygons=function(){
      const firstAssignment=!!state.features?.length&&!state.colorQa;
      if(firstAssignment)window.applyNeighborContrastColors(state.features,state.brands);
      if(state.features?.length)for(const f of state.features){const p=f.properties||{},organization=organizationId(p.brandId),color=state.organizationColors.get(organization)||state.brandById.get(p.brandId)?.color;if(organization.startsWith("org:"))p.organizationId=organization;if(color)p.color=color;}
      if(state.features?.length&&state.colorQa&&!state.colorQa.firstPolygonRenderObserved){
        state.colorQa.firstPolygonRenderObserved=true;
        state.colorQa.colorReadyBeforeFirstPolygonRender=state.colorQa.basis==="administrative-coverage-preload";
        state.colorQa.firstDinForsyningColor=state.brandById.get("din-forsyning")?.color||null;
      }
      coreRenderPolygons();
    };
  }
})();
