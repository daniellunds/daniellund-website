// Neighbor-aware wastewater utility colors.
// The normal map keeps the established palette and current-operator color assignment.
// Administrative-neighbour conflicts are resolved afterwards with the SAME palette,
// and the resulting brand color is then used consistently for admin areas, sewer catchments and WWTPs.
(function initNeighborContrastColors(){
  const GRID_DEG=0.03;
  const PROXIMITY_DEG=0.012;
  const PALETTE=["#0057B8","#E4D600","#E3261C","#35A7D6","#D51BC4","#138A2E","#E67E22","#7436A8","#00A875","#A91D63"];
  const BASE_REQUIRED_PAIRS=[["HOFOR","Ishøj Forsyning"]];
  const BASE_COLOR_LOCKS=new Map([["silkeborg-forsyning","#E4D600"]]);
  const PRESERVE_BASE_COLORS=new Set(BASE_COLOR_LOCKS.keys());
  const ADMIN_REQUIRED_PAIRS=[
    ["HOFOR","Ishøj Forsyning"],
    ["Energi Viborg Vand","Ikast-Brande Spildevand"],
    ["SAMN Forsyning","Silkeborg Forsyning"]
  ];
  const MERGED_OPERATOR_PAIRS=[
    ["AquaDjurs","Syddjurs Spildevand"],
    ["VandCenter Syd","Nordfyns Forsyning"]
  ];
  const operatorId=id=>typeof currentOperatorForBrand==="function"?currentOperatorForBrand(id).operatorBrandId:id;

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

  function connectNamedPairs(graph,brands,pairs){
    const byName=new Map(brands.map(b=>[String(b.name||"").toLocaleLowerCase("da"),b.id]));
    for(const [a,b] of pairs||[]){
      const ai=byName.get(a.toLocaleLowerCase("da")),bi=byName.get(b.toLocaleLowerCase("da"));
      if(ai&&bi){graph.get(ai)?.add(bi);graph.get(bi)?.add(ai);}
    }
  }

  function buildNeighbourGraph(features,brands,requiredPairs=BASE_REQUIRED_PAIRS){
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
    connectNamedPairs(graph,brands,requiredPairs);
    return graph;
  }

  function groupedGraph(graph,brands){
    const groups=new Map(),sourceCounts=new Map();
    for(const b of brands){const g=operatorId(b.id);if(!groups.has(g))groups.set(g,new Set());sourceCounts.set(g,(sourceCounts.get(g)||0)+(b.sourceFeatureCount||0));}
    for(const [a,ns] of graph){const ga=operatorId(a);for(const b of ns){const gb=operatorId(b);if(ga===gb)continue;groups.get(ga)?.add(gb);groups.get(gb)?.add(ga);}}
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
    const remaining=new Set([...groups.keys()].filter(id=>(sourceCounts.get(id)||0)>0));
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
    for(const b of brands){const color=assignedGroups.get(operatorId(b.id))||b.color||"#58757E";b.color=color;assigned.set(b.id,color);}
    return {assigned,assignedGroups,operatorGroups:groups.size};
  }

  function baselineQa(graph,brands,result){
    const {assigned,operatorGroups}=result,pairs=[];
    for(const [a,ns] of graph)for(const b of ns)if(a<b&&operatorId(a)!==operatorId(b))pairs.push([a,b]);
    const sameOperatorPairs=[];for(const [a,ns] of graph)for(const b of ns)if(a<b&&operatorId(a)===operatorId(b))sameOperatorPairs.push([a,b]);
    const distances=pairs.map(([a,b])=>colorDistance(assigned.get(a)||"#58757E",assigned.get(b)||"#58757E"));
    const sameColorPairs=pairs.filter(([a,b])=>assigned.get(a)&&assigned.get(a)===assigned.get(b));
    const find=name=>brands.find(b=>String(b.name).toLocaleLowerCase("da")===name.toLocaleLowerCase("da"));
    const hofor=find("HOFOR"),ishoej=find("Ishøj Forsyning");
    return {strategy:"current-operator-near-neighbour-max-contrast",palette:PALETTE.slice(),operatorGroups,neighbourPairs:pairs.length,sameOperatorNeighbourPairs:sameOperatorPairs.length,sameColorNeighbourPairs:sameColorPairs.length,minNeighbourDistance:distances.length?Math.min(...distances):null,proximityGridDegrees:GRID_DEG,hoforIshoej:hofor&&ishoej?{hofor:hofor.color,ishoej:ishoej.color,distance:colorDistance(hofor.color,ishoej.color)}:null};
  }

  function allStablePairs(graph){
    const pairs=[];for(const [a,ns] of graph)for(const b of ns)if(a<b&&operatorId(a)!==operatorId(b))pairs.push([a,b]);return pairs;
  }
  function currentColor(brandsById,id){return brandsById.get(id)?.color||"#58757E";}

  function resolveAdministrativeNeighborColors(neighbourPairs,brands){
    const graph=new Map(brands.map(b=>[b.id,new Set()]));
    for(const pair of neighbourPairs||[]){
      const a=pair?.a,b=pair?.b;
      if(!graph.has(a)||!graph.has(b)||a===b)continue;
      graph.get(a).add(b);graph.get(b).add(a);
    }
    // Named guards keep the known critical adjacencies protected even if the
    // small precomputed neighbour file ever becomes temporarily unavailable.
    connectNamedPairs(graph,brands,ADMIN_REQUIRED_PAIRS);
    const byId=new Map(brands.map(b=>[b.id,b]));
    const before=new Map(brands.map(b=>[b.id,b.color]));
    const changed=new Map();
    const conflictEdges=()=>allStablePairs(graph).filter(([a,b])=>currentColor(byId,a)===currentColor(byId,b));

    const chooseTarget=(a,b)=>{
      const aPreserved=PRESERVE_BASE_COLORS.has(a),bPreserved=PRESERVE_BASE_COLORS.has(b);
      if(aPreserved!==bPreserved)return aPreserved?b:a;
      const aAlias=operatorId(a)!==a,bAlias=operatorId(b)!==b;
      if(aAlias!==bAlias)return aAlias?a:b;
      const aCount=byId.get(a)?.sourceFeatureCount||0,bCount=byId.get(b)?.sourceFeatureCount||0;
      if(aCount!==bCount)return aCount<bCount?a:b;
      const aDegree=graph.get(a)?.size||0,bDegree=graph.get(b)?.size||0;
      if(aDegree!==bDegree)return aDegree<bDegree?a:b;
      return String(a)<String(b)?a:b;
    };

    let guard=0;
    while(guard++<100){
      const conflicts=conflictEdges();if(!conflicts.length)break;
      const [a,b]=conflicts[0],target=chooseTarget(a,b),brand=byId.get(target);
      if(!brand)break;
      const neighbourColors=[...(graph.get(target)||[])].map(id=>currentColor(byId,id));
      const forbidden=new Set(neighbourColors);
      const candidates=PALETTE.filter(c=>c!==brand.color&&!forbidden.has(c));
      if(!candidates.length)break;
      let winner=candidates[0],winnerScore=-Infinity;
      for(const c of candidates){
        const distances=neighbourColors.map(nc=>colorDistance(c,nc));
        const min=distances.length?Math.min(...distances):1;
        const avg=distances.length?distances.reduce((sum,v)=>sum+v,0)/distances.length:1;
        const score=min*1000+avg*100-PALETTE.indexOf(c)*0.0001;
        if(score>winnerScore){winner=c;winnerScore=score;}
      }
      const original=before.get(target);
      brand.color=winner;
      changed.set(target,{id:target,name:brand.name,before:original,after:winner});
    }

    const remaining=conflictEdges();
    const namedPairs={};
    const mergedPairs={};
    const byName=new Map(brands.map(b=>[String(b.name||"").toLocaleLowerCase("da"),b]));
    for(const [a,b] of ADMIN_REQUIRED_PAIRS){
      const aa=byName.get(a.toLocaleLowerCase("da")),bb=byName.get(b.toLocaleLowerCase("da"));
      namedPairs[`${a} / ${b}`]=aa&&bb?{
        aColor:aa.color,bColor:bb.color,connected:graph.get(aa.id)?.has(bb.id)||false,sameColor:aa.color===bb.color
      }:null;
    }
    for(const [a,b] of MERGED_OPERATOR_PAIRS){
      const aa=byName.get(a.toLocaleLowerCase("da")),bb=byName.get(b.toLocaleLowerCase("da"));
      mergedPairs[`${a} / ${b}`]=aa&&bb?{
        aColor:aa.color,bColor:bb.color,sameOperator:operatorId(aa.id)===operatorId(bb.id),sameColor:aa.color===bb.color
      }:null;
    }
    const qa={
      strategy:"minimal-change-original-palette",
      palette:PALETTE.slice(),
      neighbourPairs:allStablePairs(graph).length,
      sameColorNeighbourPairs:remaining.length,
      changed:[...changed.values()],
      namedPairs,
      mergedPairs,
      colors:Object.fromEntries(brands.map(b=>[b.id,b.color]))
    };
    if(typeof state!=="undefined"){
      state.colorQa=state.colorQa||{};
      state.colorQa.administrativeResolution=qa;
    }
    console.info("ADMIN_NEIGHBOR_COLOR_QA",qa);
    return qa;
  }

  window.applyNeighborContrastColors=(features,brands)=>{
    const graph=buildNeighbourGraph(features,brands),result=assignColors(graph,brands);
    for(const [id,color] of BASE_COLOR_LOCKS){
      const brand=brands.find(b=>b.id===id);
      if(brand){brand.color=color;result.assigned.set(id,color);}
    }
    const out=baselineQa(graph,brands,result);
    if(typeof state!=="undefined")state.colorQa=out;
    console.info("UTILITY_COLOR_QA",out);
    return out;
  };
  window.resolveAdministrativeNeighborColors=resolveAdministrativeNeighborColors;
  window.spildevandskortColorState=()=>state?.colorQa||null;

  if(typeof renderPolygons==="function"){
    const coreRenderPolygons=renderPolygons;
    renderPolygons=function(){
      const firstAssignment=!!state.features?.length&&!state.colorQa;
      if(firstAssignment)window.applyNeighborContrastColors(state.features,state.brands);
      if(state.features?.length)for(const f of state.features){const p=f.properties||{},color=state.brandById.get(p.brandId)?.color;if(color)p.color=color;}
      coreRenderPolygons();
      if(firstAssignment){if(typeof renderList==="function")renderList();if(state.plants?.length&&typeof renderPlants==="function")renderPlants();}
    };
  }
})();
