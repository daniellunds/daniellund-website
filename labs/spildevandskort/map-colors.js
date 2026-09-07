// Neighbor-aware wastewater utility colors.
// Goal: maximize local visual contrast between utilities that touch or lie close together.
(function initNeighborContrastColors(){
  const GRID_DEG=0.03;      // ~2-3 km in Denmark; deliberately treats near-neighbours as conflicts.
  const PROXIMITY_DEG=0.012;
  const PALETTE=[
    "#0057B8", // blue
    "#E4D600", // yellow
    "#E3261C", // red
    "#35A7D6", // cyan
    "#D51BC4", // magenta
    "#138A2E", // green
    "#E67E22", // orange
    "#7436A8", // purple
    "#00A875", // emerald
    "#A91D63"  // wine
  ];

  function featureBBox(feature){
    const coords=feature?.geometry?.coordinates;
    if(!coords)return null;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const visit=value=>{
      if(!Array.isArray(value))return;
      if(value.length>=2 && Number.isFinite(+value[0]) && Number.isFinite(+value[1])){
        const x=+value[0],y=+value[1];
        if(x>=5&&x<=16&&y>=54&&y<=58.5){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
        return;
      }
      for(const child of value)visit(child);
    };
    visit(coords);
    return Number.isFinite(minX)?[minX,minY,maxX,maxY]:null;
  }

  function buildNeighbourGraph(features,brands){
    const graph=new Map(brands.map(b=>[b.id,new Set()]));
    const cells=new Map();
    const add=(x,y,id)=>{
      const key=`${x}:${y}`;
      if(!cells.has(key))cells.set(key,new Set());
      cells.get(key).add(id);
    };
    for(const f of features||[]){
      const id=f?.properties?.brandId;
      if(!id||!graph.has(id))continue;
      const box=featureBBox(f);if(!box)continue;
      const [minX,minY,maxX,maxY]=box;
      const x0=Math.floor((minX-PROXIMITY_DEG)/GRID_DEG),x1=Math.floor((maxX+PROXIMITY_DEG)/GRID_DEG);
      const y0=Math.floor((minY-PROXIMITY_DEG)/GRID_DEG),y1=Math.floor((maxY+PROXIMITY_DEG)/GRID_DEG);
      const cellsWide=x1-x0+1,cellsHigh=y1-y0+1;
      if(cellsWide*cellsHigh<=64){
        for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)add(x,y,id);
      }else{
        // Large/irregular catchments: use the expanded bbox perimeter plus centre.
        for(let x=x0;x<=x1;x++){add(x,y0,id);add(x,y1,id);}
        for(let y=y0+1;y<y1;y++){add(x0,y,id);add(x1,y,id);}
        add(Math.floor((x0+x1)/2),Math.floor((y0+y1)/2),id);
      }
    }
    for(const ids of cells.values()){
      const arr=[...ids];
      for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
        graph.get(arr[i])?.add(arr[j]);graph.get(arr[j])?.add(arr[i]);
      }
    }

    // Explicit regression pair identified during visual QA.
    const byName=new Map(brands.map(b=>[String(b.name||"").toLocaleLowerCase("da"),b.id]));
    const connectNames=(a,b)=>{
      const ai=byName.get(a.toLocaleLowerCase("da")),bi=byName.get(b.toLocaleLowerCase("da"));
      if(ai&&bi){graph.get(ai)?.add(bi);graph.get(bi)?.add(ai);}
    };
    connectNames("HOFOR","Ishøj Forsyning");
    return graph;
  }

  function hexRgb(hex){
    const h=String(hex).replace("#","");
    return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
  }
  function oklab(hex){
    let [r,g,b]=hexRgb(hex);
    const lin=c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
    r=lin(r);g=lin(g);b=lin(b);
    let l=0.4122214708*r+0.5363325363*g+0.0514459929*b;
    let m=0.2119034982*r+0.6806995451*g+0.1073969566*b;
    let s=0.0883024619*r+0.2817188376*g+0.6299787005*b;
    l=Math.cbrt(l);m=Math.cbrt(m);s=Math.cbrt(s);
    return [
      0.2104542553*l+0.793617785*m-0.0040720468*s,
      1.9779984951*l-2.428592205*m+0.4505937099*s,
      0.0259040371*l+0.7827717662*m-0.808675766*s
    ];
  }
  const LAB=new Map(PALETTE.map(c=>[c,oklab(c)]));
  function colorDistance(a,b){
    const aa=LAB.get(a)||oklab(a),bb=LAB.get(b)||oklab(b);
    return Math.hypot(aa[0]-bb[0],aa[1]-bb[1],aa[2]-bb[2]);
  }

  function assignColors(graph,brands){
    const assigned=new Map(),usage=new Map(PALETTE.map(c=>[c,0]));
    const brandById=new Map(brands.map(b=>[b.id,b]));
    const remaining=new Set(brands.filter(b=>(b.sourceFeatureCount||0)>0).map(b=>b.id));

    while(remaining.size){
      let next=null,bestRank=null;
      for(const id of remaining){
        const neighbourColors=new Set([...(graph.get(id)||[])].map(n=>assigned.get(n)).filter(Boolean));
        const degree=graph.get(id)?.size||0;
        const sourceCount=brandById.get(id)?.sourceFeatureCount||0;
        const rank=[neighbourColors.size,degree,sourceCount,String(id)];
        if(!bestRank || rank[0]>bestRank[0] || (rank[0]===bestRank[0]&&rank[1]>bestRank[1]) || (rank[0]===bestRank[0]&&rank[1]===bestRank[1]&&rank[2]>bestRank[2]) || (rank[0]===bestRank[0]&&rank[1]===bestRank[1]&&rank[2]===bestRank[2]&&rank[3]<bestRank[3])){
          next=id;bestRank=rank;
        }
      }
      const neighbourColors=[...(graph.get(next)||[])].map(n=>assigned.get(n)).filter(Boolean);
      const forbidden=new Set(neighbourColors);
      let candidates=PALETTE.filter(c=>!forbidden.has(c));
      if(!candidates.length)candidates=PALETTE.slice();
      let winner=candidates[0],winnerScore=-Infinity;
      for(const c of candidates){
        const ds=neighbourColors.map(nc=>colorDistance(c,nc));
        const min=ds.length?Math.min(...ds):1;
        const avg=ds.length?ds.reduce((a,b)=>a+b,0)/ds.length:1;
        const score=min*1000+avg*120-(usage.get(c)||0)*4-PALETTE.indexOf(c)*0.0001;
        if(score>winnerScore){winner=c;winnerScore=score;}
      }
      assigned.set(next,winner);usage.set(winner,(usage.get(winner)||0)+1);remaining.delete(next);
    }

    // Utilities without polygon geography keep a stable fallback color.
    for(const b of brands)b.color=assigned.get(b.id)||b.color||"#58757E";
    return assigned;
  }

  function qa(graph,brands,assigned){
    const pairs=[];
    for(const [a,ns] of graph)for(const b of ns)if(a<b)pairs.push([a,b]);
    const distances=pairs.map(([a,b])=>colorDistance(assigned.get(a)||"#58757E",assigned.get(b)||"#58757E"));
    const sameColorPairs=pairs.filter(([a,b])=>assigned.get(a)&&assigned.get(a)===assigned.get(b));
    const find=name=>brands.find(b=>String(b.name).toLocaleLowerCase("da")===name.toLocaleLowerCase("da"));
    const hofor=find("HOFOR"),ishoej=find("Ishøj Forsyning");
    const pairDistance=hofor&&ishoej?colorDistance(hofor.color,ishoej.color):null;
    return {
      strategy:"near-neighbour-max-contrast",
      palette:PALETTE.slice(),
      neighbourPairs:pairs.length,
      sameColorNeighbourPairs:sameColorPairs.length,
      minNeighbourDistance:distances.length?Math.min(...distances):null,
      proximityGridDegrees:GRID_DEG,
      hoforIshoej:hofor&&ishoej?{hofor:hofor.color,ishoej:ishoej.color,distance:pairDistance}:null
    };
  }

  window.applyNeighborContrastColors=(features,brands)=>{
    const graph=buildNeighbourGraph(features,brands);
    const assigned=assignColors(graph,brands);
    const result=qa(graph,brands,assigned);
    if(typeof state!=="undefined")state.colorQa=result;
    console.info("UTILITY_COLOR_QA",result);
    return result;
  };
  window.spildevandskortColorState=()=>state?.colorQa||null;

  // Patch the existing polygon renderer without changing project geography logic.
  // The first polygon render computes the neighbour graph and then propagates the
  // new brand colors to polygons, list swatches, PULS markers and project markers.
  if(typeof renderPolygons==="function"){
    const coreRenderPolygons=renderPolygons;
    renderPolygons=function(){
      const firstAssignment=!!state.features?.length&&!state.colorQa;
      if(firstAssignment)window.applyNeighborContrastColors(state.features,state.brands);
      if(state.features?.length){
        for(const f of state.features){
          const p=f.properties||{},color=state.brandById.get(p.brandId)?.color;
          if(color)p.color=color;
        }
      }
      coreRenderPolygons();
      if(firstAssignment){
        if(typeof renderList==="function")renderList();
        if(state.plants?.length&&typeof renderPlants==="function")renderPlants();
      }
    };
  }
})();
