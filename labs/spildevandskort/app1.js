const PROD = "./data";
const PULS_WFS = "https://pulsgeo.miljoeportal.dk/geoserver/wfs";
const PULS_QUERY_BASE = {
  service:"WFS", version:"2.0.0", request:"GetFeature",
  typeNames:"puls:Renseanlaeg", outputFormat:"application/json", srsName:"EPSG:4326"
};
const PULS_PAGE_SIZE = 1000;
const CURATED_VIRTUAL_BRANDS = [
  {id:"biofos",name:"BIOFOS",municipalities:[]},
  {id:"moelleaavaerket",name:"Mølleåværket",municipalities:[]},
  {id:"laesoe-forsyning",name:"Læsø Forsyning",municipalities:["Læsø"]}
];
const OWNER_ALIASES_RAW = {
  "syddjurs spildevand":"aquadjurs", "syddjurs spildevand a/s":"aquadjurs",
  "thy forsyning":"thisted-vand", "thy forsyning a/s":"thisted-vand",
  "ren forsyning mariagerfjord":"mariagerfjord-vand", "ren forsyning mariagerfjord a/s":"mariagerfjord-vand",
  "nordfyns forsyning":"vandcenter-syd", "nordfyns forsyning a/s":"vandcenter-syd",
  "langeland energi og forsyning":"langeland-forsyning", "langeland energi & forsyning":"langeland-forsyning",
  "mølleåværket":"moelleaavaerket", "mølleåværket a/s":"moelleaavaerket",
  "biofos":"biofos", "biofos a/s":"biofos"
};

const LANDDELE = [
  {id:"hovedstaden", name:"Hovedstaden", municipalities:["Albertslund","Ballerup","Brøndby","Dragør","Frederiksberg","Gentofte","Gladsaxe","Glostrup","Herlev","Hvidovre","Høje-Taastrup","Ishøj","København","Københavns","Rødovre","Tårnby","Vallensbæk"]},
  {id:"nordsjaelland", name:"Nordsjælland", municipalities:["Allerød","Egedal","Fredensborg","Frederikssund","Furesø","Gribskov","Halsnæs","Helsingør","Hillerød","Hørsholm","Lyngby-Taarbæk","Rudersdal"]},
  {id:"sjaelland", name:"Sjælland", municipalities:["Faxe","Greve","Guldborgsund","Holbæk","Kalundborg","Køge","Lejre","Lolland","Næstved","Odsherred","Ringsted","Roskilde","Slagelse","Solrød","Sorø","Stevns","Vordingborg"]},
  {id:"bornholm", name:"Bornholm", municipalities:["Bornholm"]},
  {id:"fyn", name:"Fyn", municipalities:["Assens","Faaborg-Midtfyn","Kerteminde","Langeland","Middelfart","Nordfyns","Nyborg","Odense","Svendborg","Ærø"]},
  {id:"sydjylland", name:"Syd- og Sønderjylland", municipalities:["Aabenraa","Billund","Esbjerg","Fanø","Fredericia","Haderslev","Kolding","Sønderborg","Tønder","Varde","Vejen","Vejle"]},
  {id:"midtjylland", name:"Midtjylland", municipalities:["Aarhus","Favrskov","Hedensted","Herning","Holstebro","Horsens","Ikast-Brande","Lemvig","Norddjurs","Odder","Randers","Ringkøbing-Skjern","Samsø","Silkeborg","Skanderborg","Skive","Struer","Syddjurs","Viborg"]},
  {id:"nordjylland", name:"Nordjylland", municipalities:["Aalborg","Brønderslev","Frederikshavn","Hjørring","Jammerbugt","Læsø","Mariagerfjord","Morsø","Rebild","Thisted","Vesthimmerlands"]}
];
const REGION_BY_MUNICIPALITY = new Map(LANDDELE.flatMap(r=>r.municipalities.map(m=>[normalizeRegionKey(m),r.id])));
const VIRTUAL_BRAND_REGION = {biofos:"hovedstaden",moelleaavaerket:"nordsjaelland","laesoe-forsyning":"nordjylland"};
function normalizeRegionKey(s=""){return String(s).toLocaleLowerCase("da").trim().replace(/\s+/g," ");}

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(["search","brandCount","activePlantCount","itemList","listHeading","visibleCount","brandControls","plantControls","showVerifiedPlants","showPulsRecords","includeClosed","selectedOnly","selectAll","selectNone","zoomSelected","statusBanner","mapStatus","detailPanel","detailContent","closeDetail"].map(k=>[k,$(k)]));
const state = {tab:"brands", brands:[], brandById:new Map(), selected:new Set(), features:[], plants:[], facilityPlants:[], ownerAliases:{}, canonicalRegistry:null, canonicalRegistryDocument:null, canonicalRegistryReady:null, facilityRegistry:null, facilityRegistryDocument:null, facilityRegistryReady:null, wastewaterRelations:null, wastewaterRelationsDocument:null, wastewaterRelationsReady:null, identityDataReady:null, canonicalRegistryParity:null, organizationColors:new Map(), polygonLayer:null, plantLayer:null, map:null, collapsedRegions:new Set(LANDDELE.map(r=>r.id))};

function normalize(s="") { return String(s).toLocaleLowerCase("da").replace(/\(cvr[^)]*\)/gi,"").replace(/\bcvr[:\s-]*\d+\b/gi,"").replace(/\ba\/s\b|\baps\b|\bi\/s\b/gi,"").replace(/&/g," og ").replace(/[^a-z0-9æøå]+/gi," ").trim().replace(/\s+/g," "); }
function pick(p,...keys){ if(!p)return null; const m=new Map(Object.entries(p).map(([k,v])=>[k.toLowerCase(),v])); for(const k of keys){ if(m.has(k.toLowerCase())) return m.get(k.toLowerCase()); } return null; }
function n(v){ if(v===null||v===undefined||String(v).trim()==="")return null; const x=Number(String(v).trim().replace(/\./g,"").replace(",",".")); return Number.isFinite(x)?x:null; }
function fmtPE(v){ const x=n(v); return x===null?"Ikke oplyst":new Intl.NumberFormat("da-DK",{maximumFractionDigits:0}).format(x)+" PE"; }
function fmt(v){ return v===null||v===undefined||String(v).trim()===""?"Ikke oplyst":String(v); }
function fmtVolume(v){ const x=n(v); return x===null?fmt(v):new Intl.NumberFormat("da-DK",{maximumFractionDigits:0}).format(x)+" m³/år"; }
function activeFrom(v){ return ["aktivt","aktiv","active","i drift","drift"].includes(normalize(v)); }
function capacityRadius(pe){ const x=n(pe); if(x===null)return 5; if(x<2000)return 4; if(x<10000)return 6; if(x<100000)return 8; return 11; }
function capacityClass(pe){ const x=n(pe); if(x===null)return "Ukendt"; if(x<2000)return "<2.000 PE"; if(x<10000)return "2.000–10.000 PE"; if(x<100000)return "10.000–100.000 PE"; return ">100.000 PE"; }
function brandMatch(owner){ const key=normalize(owner); const direct=state.ownerAliases[key]; if(direct && state.brandById.has(direct)) return direct; for(const b of state.brands){ const bn=normalize(b.name); if(key===bn || (bn.length>=6 && (key.includes(bn)||bn.includes(key)))) return b.id; } return direct || null; }
function organizationIdForBrandId(legacyBrandId){ return legacyBrandId?state.canonicalRegistry?.organizationIdForLegacyBrandId(legacyBrandId)||null:null; }
function organizationColor(organizationId,legacyBrandId=null){ return (organizationId&&state.organizationColors.get(organizationId))||state.brandById.get(legacyBrandId)?.color||null; }
function plantPresentationColor(plant){ return organizationColor(plant?.organizationId,plant?.responsibleBrandId)||"#087e90"; }
function wastewaterSemanticsForOrganizationId(organizationId){ return organizationId?state.wastewaterRelations?.semanticsForOrganizationId(organizationId)||null:null; }
function activePulsRecordCountForOrganizationId(organizationId){
  const legacyIds=state.canonicalRegistry?.legacyBrandIdsForOrganizationId(organizationId)||[];
  return state.plants.filter(plant=>plant.active&&legacyIds.includes(plant.responsibleBrandId)).length;
}
function wastewaterListSummary(organizationId){
  const semantics=wastewaterSemanticsForOrganizationId(organizationId);
  if(!semantics||semantics.auditStatus!=="verified")return "Anlægstal ikke verificeret";
  const count=semantics.directActiveFacilityCount;
  const destinations=[...new Set(semantics.routes.map(route=>route.treatmentOrganization?.displayName).filter(Boolean))];
  return `${count} egne/driftede renseanlæg${destinations.length?` · Behandles hos ${destinations.join(" og ")}`:""}`;
}
function status(msg, error=false){ els.statusBanner.hidden=!msg; els.statusBanner.textContent=msg||""; els.statusBanner.style.background=error?"#6a352b":"#1b5665"; }

async function fetchJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
async function fetchGzipJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); const buf=await r.arrayBuffer(); const bytes=new Uint8Array(buf); if(bytes[0]===0x1f && bytes[1]===0x8b){ if(!("DecompressionStream" in window)) throw new Error("Browseren understøtter ikke gzip-dekomprimering"); const stream=new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip")); return new Response(stream).json(); } return JSON.parse(new TextDecoder().decode(buf)); }

async function loadBrands(){
  const raw=await fetchJSON(`${PROD}/brands.json`); const arr=raw.brands||raw;
  const virtual=CURATED_VIRTUAL_BRANDS.map(b=>({...b,color:"#087e90",municipalities:b.municipalities||[],sourceFeatureCount:0}));
  state.brands=[...arr,...virtual.filter(v=>!arr.some(b=>b.id===v.id))].sort((a,b)=>a.name.localeCompare(b.name,"da"));
  state.brandById=new Map(state.brands.map(b=>[b.id,b])); state.selected=new Set(state.brands.map(b=>b.id));
}
async function loadCanonicalRegistry(){
  if(typeof createSpildevandskortCanonicalRegistry!=="function")throw new Error("Canonical registry-adapter mangler");
  const document=await fetchJSON(`${PROD}/model/organization-registry.json`);
  state.canonicalRegistryDocument=document;
  state.canonicalRegistry=createSpildevandskortCanonicalRegistry(document);
  els.brandCount.textContent=state.canonicalRegistry.counts.organizations;
}
async function loadFacilityRegistry(){
  if(typeof createSpildevandskortFacilityRegistry!=="function")throw new Error("Facility registry-adapter mangler");
  const document=await fetchJSON(`${PROD}/model/facility-registry.json`);
  state.facilityRegistryDocument=document;
  state.facilityRegistry=createSpildevandskortFacilityRegistry(document);
}
async function loadWastewaterRelations(){
  if(typeof createSpildevandskortWastewaterRelations!=="function")throw new Error("Wastewater relations-adapter mangler");
  const document=await fetchJSON(`${PROD}/model/wastewater-relations.json`);
  state.wastewaterRelationsDocument=document;
  state.wastewaterRelations=createSpildevandskortWastewaterRelations(document,{organizationRegistry:state.canonicalRegistry,facilityRegistry:state.facilityRegistry});
}
async function loadAliases(){
  const out={};
  for(const [k,v] of Object.entries(OWNER_ALIASES_RAW)) out[normalize(k)]=v;
  state.ownerAliases=out;
}

async function loadPolygons(){
  els.mapStatus.textContent="Indlæser kloakoplande…";
  const chunks=await Promise.all([1,2,3,4].map(i=>fetchGzipJSON(`${PROD}/spildevandsoplande-${i}.geojson.gz`)));
  state.features=chunks.flatMap(c=>c.features||[]); renderPolygons();
}
function renderPolygons(){
  if(state.polygonLayer) state.polygonLayer.remove();
  state.polygonLayer=L.geoJSON({type:"FeatureCollection",features:state.features.filter(f=>state.selected.has(f.properties?.brandId))},{
    style:f=>({color:f.properties?.color||state.brandById.get(f.properties?.brandId)?.color||"#7f9ca4",fillColor:f.properties?.color||state.brandById.get(f.properties?.brandId)?.color||"#7f9ca4",weight:.7,fillOpacity:.33}),
    onEachFeature:(f,l)=>{ const p=f.properties||{}; l.bindTooltip(`${fmt(p.brand||state.brandById.get(p.brandId)?.name)} · ${fmt(p.municipality)}`); l.on("click",()=>openArea(p)); }
  }).addTo(state.map);
}

function normalizeCoords(feature, props){
  let c=feature.geometry?.type==="Point"?feature.geometry.coordinates:null;
  if(!c){ const lon=pick(props,"Longitude","Lon","X","Længdegrad"), lat=pick(props,"Latitude","Lat","Y","Breddegrad"); if(lon!=null&&lat!=null)c=[Number(lon),Number(lat)]; }
  if(!Array.isArray(c)||c.length<2||!Number.isFinite(+c[0])||!Number.isFinite(+c[1])) return null;
  let a=+c[0],b=+c[1]; if(a>40&&b<30)[a,b]=[b,a]; if(a<5||a>16||b<54||b>58.5)return null; return [a,b];
}
function normalizePlant(f,i){
  const p=f.properties||{}; const discharge=pick(p,"DischargeType","Punktkildetype","Type"); if(discharge && !["renseanlæg","renseanlaeg"].includes(normalize(discharge)))return null;
  const owner=fmt(pick(p,"Owner","Ejer","OwnerName")); const statusValue=pick(p,"Closed","Status","Driftsstatus");
  const capacity=pick(p,"DesignedCapacity","DimensionedCapacity","DimensioneretKapacitet","Dimensioneret kapacitet","PE");
  const responsibleBrandId=brandMatch(owner);
  const sourceRecordId=String(pick(p,"WwtpId","Id","ID","PulsId","PULS_ID")||f.id||`puls-${i}`);
  const facilitySourceRecord=state.facilityRegistry?.sourceRecordForPulsId(sourceRecordId)||null;
  const facility=state.facilityRegistry?.facilityForPulsRecordId(sourceRecordId)||null;
  const organizationId=facility?.presentationOrganizationId||organizationIdForBrandId(responsibleBrandId);
  return {id:sourceRecordId,sourceRecordId,name:fmt(pick(p,"Name","Navn","PlantName","Renseanlægsnavn")),owner,status:fmt(statusValue),active:activeFrom(statusValue),coordinates:normalizeCoords(f,p),capacity,approvedLoad:pick(p,"AuthorizedLoad","ApprovedLoad","GodkendtBelastning","Godkendt belastning"),treatmentType:pick(p,"TreatmentType","Rensetype","RenseType","Treatment"),authority:pick(p,"Authority","Myndighed"),municipality:pick(p,"Municipality","Kommune"),latestYear:pick(p,"LatestDischargeYear","SenesteUdledningsår","Udledningsår","LatestYear"),latestVolume:pick(p,"LatestDischargeVolume","LatestWastewaterVolume","Spildevandsmængde","WastewaterVolume"),brandId:responsibleBrandId,responsibleBrandId,organizationId,facilityId:facility?.id||null,facilityName:facility?.name||null,facilityLifecycleStatus:facility?.lifecycleStatus||null,facilityVerification:facility?.verification||null,facilityMappingStatus:facilitySourceRecord?.mappingStatus||"unmapped",sourceRecordRole:facilitySourceRecord?.recordRole||"unclassifiedSourceRecord",includeInFacilityCount:facilitySourceRecord?.includeInFacilityCount===true,displayRecordType:"pulsSourceRecord",sourceProperties:p};
}
function facilityRecordRank(plant){
  return ({mainFacilityRecord:0,outletRecord:1,technicalDischargeRecord:2,fictitiousOutletRecord:3}[plant.sourceRecordRole]??4);
}
function buildFacilityPlants(plants){
  const groups=new Map();
  for(const plant of plants){
    if(plant.facilityMappingStatus!=="verified"||!plant.facilityId)continue;
    if(!groups.has(plant.facilityId))groups.set(plant.facilityId,[]);
    groups.get(plant.facilityId).push(plant);
  }
  return [...groups.entries()].map(([facilityId,records])=>{
    const ordered=[...records].sort((a,b)=>facilityRecordRank(a)-facilityRecordRank(b));
    const representative=ordered.find(row=>row.coordinates)||ordered[0];
    return {...representative,id:facilityId,name:representative.facilityName||representative.name,active:representative.facilityLifecycleStatus?representative.facilityLifecycleStatus==="active":representative.active,displayRecordType:"verifiedFacility",verifiedPhysicalFacility:true,sourceRecordIds:records.map(row=>row.sourceRecordId),facilitySourceCount:records.length};
  }).sort((a,b)=>a.name.localeCompare(b.name,"da"));
}
async function fetchAllPulsFeatures(){
  const all=[]; let startIndex=0; let expected=null;
  for(let page=0; page<50; page++){
    const qs=new URLSearchParams({...PULS_QUERY_BASE,count:String(PULS_PAGE_SIZE),startIndex:String(startIndex)});
    const raw=await fetchJSON(`${PULS_WFS}?${qs}`);
    const features=raw.features||[];
    if(expected===null && Number.isFinite(Number(raw.numberMatched))) expected=Number(raw.numberMatched);
    all.push(...features);
    els.mapStatus.textContent=`Henter aktuelle renseanlæg fra PULS… ${all.length}${expected!==null?` / ${expected}`:""}`;
    if(features.length<PULS_PAGE_SIZE || (expected!==null && all.length>=expected)) break;
    startIndex += features.length;
  }
  return all;
}
async function loadPlants(){
  els.mapStatus.textContent="Henter aktuelle renseanlæg fra PULS…";
  const [features]=await Promise.all([fetchAllPulsFeatures(),loadPlantLoads()]);
  const byId=new Map(); let duplicateIds=0;
  for(const [i,f] of features.entries()){ const p=normalizePlant(f,i); if(!p)continue; if(byId.has(p.id))duplicateIds++; byId.set(p.id,p); }
  state.plants=[...byId.values()];
  state.facilityPlants=buildFacilityPlants(state.plants);
  state.plantQa={rawFeatures:features.length,plants:state.plants.length,duplicateIds,missingCoordinates:state.plants.filter(p=>!p.coordinates).length,unmatchedOwners:state.plants.filter(p=>!p.brandId).length,canonicalOrganizations:state.plants.filter(p=>p.organizationId).length,verifiedFacilityMappings:state.plants.filter(p=>p.facilityMappingStatus==="verified"&&p.facilityId).length,unresolvedFacilityMappings:state.plants.filter(p=>p.facilityMappingStatus==="unresolved").length};
  console.info("PULS QA",state.plantQa);
  updateLoadScreeningUI();
  els.activePlantCount.textContent=state.facilityPlants.filter(p=>p.active).length; renderPlants(); renderList();
}
function plantSelectionIds(plant){
  const canonicalIds=plant.organizationId?state.canonicalRegistry?.legacyBrandIdsForOrganizationId(plant.organizationId)||[]:[];
  return [...new Set([plant.responsibleBrandId,...canonicalIds].filter(Boolean))];
}
function filteredPlants(){
  const q=normalize(els.search.value);
  const candidates=[];
  if(els.showVerifiedPlants.checked)candidates.push(...state.facilityPlants);
  if(els.showPulsRecords.checked)candidates.push(...state.plants.filter(p=>!p.includeInFacilityCount));
  return candidates.filter(p=>{
    const b=p.responsibleBrandId?state.brandById.get(p.responsibleBrandId):null;
    const followsSelection=!els.selectedOnly.checked || plantSelectionIds(p).some(id=>state.selected.has(id));
    const matchesSearch=!q||normalize([p.name,p.facilityName,p.owner,p.authority,p.municipality,b?.name].join(" ")).includes(q);
    return (els.includeClosed.checked||p.active)&&followsSelection&&matchesSearch&&loadFilterMatches(p);
  });
}
function activePlantCountForBrand(id){ return state.plants.filter(p=>p.active&&p.responsibleBrandId===id).length; }
function renderPlants(){
  if(state.plantLayer) state.plantLayer.remove(); state.plantLayer=L.layerGroup().addTo(state.map);
  for(const p of filteredPlants()){
    if(!p.coordinates)continue;
    const [lon,lat]=p.coordinates;
    const responsible=p.responsibleBrandId?state.brandById.get(p.responsibleBrandId):null;
    const load=plantLoad(p),band=LoadScreening.band(load),screen=screeningEnabled(),technical=p.displayRecordType==="pulsSourceRecord";
    const fill=screen&&p.active?LoadScreening.colors[band]:p.active?plantPresentationColor(p):"#737e84";
    const radius=screen?({high:11,mid:8,low:5,unknown:5}[band]):capacityRadius(p.capacity);
    const m=L.circleMarker([lat,lon],{radius,color:"#fff",weight:1.5,fillColor:fill,fillOpacity:.95,pane:"markerPane"}).addTo(state.plantLayer);
    const typeLabel=technical?"Teknisk PULS-post":"Verificeret fysisk anlæg";
    m.bindTooltip(`${typeLabel} · ${p.name} · ${responsible?.name||p.owner} · ${screen?LoadScreening.summary(load):"PULS-designkapacitet: "+capacityClass(p.capacity)}`);
    m.on("click",()=>openPlant(p));
  }
}
