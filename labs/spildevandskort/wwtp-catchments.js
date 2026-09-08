// Official Copenhagen treatment-plant catchment geometry takes precedence for Lynetten and Damhusåen.
// The source-backed Plandata/municipal-plan pilot remains the fallback and provides Mølleåværket coverage.
// Official geometry is a dissolved municipal WebGIS layer; it is not expanded into invented individual Plandata relations.
// Relation datasets use current Plandata sewer type filtering (nuvkode) and exclude rainwater-only/unsewered areas.
(async function integrateWwtpCatchmentPilot(){
  let pilot=null,meta=null,official=null,officialMeta=null,highlightLayer=null,selectedPlantMarker=null,activePlantKey=null;
  const MAIN_PULS_IDS={
    lynetten:'Renseanlaeg.8793f333-ad28-446d-8d0e-c9c854ca4a6d',
    damhusaen:'Renseanlaeg.87c30072-633c-440b-b3a1-1b0f529acf6f',
    moelleaavaerket:'Renseanlaeg.44f9a35f-2848-47f1-a82f-bdc2da36947c'
  };

  const esc=v=>typeof profileEscape==='function'?profileEscape(String(v)):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nkey=v=>String(v||'').toLocaleLowerCase('da').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9æøå]+/g,'');
  const plantKeyFor=p=>{
    if(!p)return null;
    const id=String(p.id||'');
    for(const [key,mainId] of Object.entries(MAIN_PULS_IDS))if(id===mainId)return key;
    const name=nkey(p.name);
    if(name===nkey('Renseanlæg Lynetten'))return 'lynetten';
    if(name===nkey('Renseanlæg Damhusåen'))return 'damhusaen';
    if(name===nkey('Mølleåværket A/S')||name===nkey('Mølleåværket'))return 'moelleaavaerket';
    return null;
  };
  const featuresFor=key=>{
    const officialFeatures=officialFeaturesFor(key);
    return officialFeatures.length?officialFeatures:(pilot?.features||[]).filter(f=>f.properties?.plantKey===key);
  };
  const officialFeaturesFor=key=>(official?.features||[]).filter(f=>nkey(f.properties?.opland)===nkey(key==='lynetten'?'Renseanlæg Lynetten':key==='damhusaen'?'Renseanlæg Damhusåen':''));
  const isOfficial=key=>officialFeaturesFor(key).length>0;
  const unique=(values)=>[...new Set(values.filter(v=>v!==null&&v!==undefined&&v!==''))];

  function resetCatchmentHighlight(){
    activePlantKey=null;
    if(highlightLayer){highlightLayer.remove();highlightLayer=null;}
    if(selectedPlantMarker){selectedPlantMarker.remove();selectedPlantMarker=null;}
    if(typeof renderPolygons==='function')renderPolygons();
  }

  function dimBaseCatchments(){
    state.polygonLayer?.eachLayer(layer=>{
      if(layer.setStyle)layer.setStyle({fillOpacity:.055,opacity:.16,weight:.35});
    });
  }

  function showCatchmentHighlight(p,key){
    const features=featuresFor(key);
    if(!features.length)return false;
    resetCatchmentHighlight();
    activePlantKey=key;
    dimBaseCatchments();

    const brand=p.responsibleBrandId?state.brandById.get(p.responsibleBrandId):null;
    const color=brand?.color||'#006f8b';
    highlightLayer=L.geoJSON({type:'FeatureCollection',features},{
      style:{color,fillColor:color,weight:2.2,opacity:1,fillOpacity:.58},
      interactive:false
    }).addTo(state.map);

    if(Array.isArray(p.coordinates)){
      selectedPlantMarker=L.circleMarker([p.coordinates[1],p.coordinates[0]],{
        radius:capacityRadius(p.capacity)+4,color:'#102f3b',weight:3,fillColor:color,fillOpacity:1,pane:'markerPane',interactive:false
      }).addTo(state.map);
    }
    const bounds=highlightLayer.getBounds();
    if(bounds.isValid())state.map.fitBounds(bounds,{padding:[35,35],maxZoom:13});
    return true;
  }

  function appendCatchmentInfo(p,key){
    const features=featuresFor(key);if(!features.length)return;
    const officialCoverage=isOfficial(key);
    const info=meta?.plants?.[key]||{};
    const planNumbers=unique(features.map(f=>f.properties?.planNumber)).sort((a,b)=>String(a).localeCompare(String(b),'da',{numeric:true}));
    const planNumberPreview=officialCoverage?'Samlet officiel geometri':(planNumbers.length>24?planNumbers.slice(0,24).join(', ')+' · +'+(planNumbers.length-24)+' flere':planNumbers.join(', '));
    const municipalityCount=officialCoverage?'—':unique(features.map(f=>f.properties?.municipalityCode)).length;
    const matchedCount=Array.isArray(info.matchedRelations)?info.matchedRelations.length:planNumbers.length;
    const requestedCount=Array.isArray(info.requestedRelations)?info.requestedRelations.length:(info.requestedPlanNumbers||[]).length;
    const sourceFeatureCount=features.reduce((sum,f)=>sum+Number(f.properties?.sourceFeatureCount||0),0);
    const sources=officialCoverage
      ? [{url:officialMeta?.sourceUrl||'https://webgis.digitaleplaner.dk/app/koebenhavn/spildevandsplan%2Cskybrudsplan/',label:officialMeta?.sourceLabel||'Københavns Kommunes officielle WebGIS'}]
      : unique(features.flatMap(f=>(f.properties?.sources||[]).map(s=>JSON.stringify(s)))).map(x=>JSON.parse(x));
    const body=els.detailContent.querySelector('.detail-body');if(!body)return;
    const intro=officialCoverage
      ? 'Den fremhævede flade er hentet direkte fra Københavns Kommunes officielle WebGIS og repræsenterer den samlede registrerede geometri for anlæggets opland.'
      : 'De fremhævede flader er kun de oplande, hvor relationen til '+esc(info.plantName||p.name)+' er dokumenteret i de anvendte kommunale kilder. Piloten er endnu ikke et komplet renseanlægsopland.';
    const box=document.createElement('section');
    box.className='wwtp-catchment-pilot';
    box.innerHTML='<p class="source-note"><strong>Renseanlægsopland · '+(officialCoverage?'officiel geometri':'pilot')+'</strong><br>'+intro+'</p>'
      +'<div class="fact-grid">'
      +'<div class="fact"><span>Oplandsgeometri</span><strong>'+esc(planNumberPreview)+'</strong></div>'
      +(officialCoverage?'':'<div class="fact"><span>Oplandsrelationer matchet</span><strong>'+matchedCount+' / '+requestedCount+'</strong></div>')
      +(officialCoverage?'':'<div class="fact"><span>Kommuner i piloten</span><strong>'+municipalityCount+'</strong></div>')
      +(officialCoverage?'':'<div class="fact"><span>Plandata-objekter</span><strong>'+new Intl.NumberFormat('da-DK').format(sourceFeatureCount)+'</strong></div>')
      +'<div class="fact"><span>Datastatus</span><strong>'+(officialCoverage?'Komplet officiel geometri':'Dokumenteret pilot · delvis dækning')+'</strong></div>'
      +'</div>'
      +'<div class="detail-actions wwtp-catchment-actions"><button type="button" class="detail-action" data-reset-wwtp>Nulstil opland</button></div>'
      +(sources.length?'<p class="source-note"><strong>Kilde:</strong> '+sources.slice(0,4).map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.label)+'</a>').join(' · ')+(sources.length>4?' · +'+(sources.length-4)+' flere':'')+'</p>':'');
    body.append(box);
    box.querySelector('[data-reset-wwtp]').onclick=()=>resetCatchmentHighlight();
  }

  try{
    [pilot,meta,official,officialMeta]=await Promise.all([
      fetchJSON(`${PROD}/wwtp-catchment-pilot.geojson`),
      fetchJSON(`${PROD}/wwtp-catchment-pilot-meta.json`),
      fetchJSON(`${PROD}/kk-official-wwtp-catchment.geojson`),
      fetchJSON(`${PROD}/kk-official-wwtp-catchment-meta.json`)
    ]);
    const coreOpenPlant=openPlant;
    openPlant=function(p){
      const key=plantKeyFor(p);
      if(activePlantKey && activePlantKey!==key)resetCatchmentHighlight();
      coreOpenPlant(p);
      if(key && showCatchmentHighlight(p,key))appendCatchmentInfo(p,key);
    };
    window.resetWwtpCatchmentHighlight=resetCatchmentHighlight;
    window.WWTP_CATCHMENT_PILOT_READY=true;
    window.WWTP_CATCHMENT_PILOT_META=meta;
    window.WWTP_CATCHMENT_OFFICIAL_META=officialMeta;
    window.WWTP_CATCHMENT_MAIN_PULS_IDS=MAIN_PULS_IDS;
    console.info('WWTP_CATCHMENT_PILOT_READY',{features:pilot.features?.length||0,plants:Object.keys(meta.plants||{}),mainPulsIds:MAIN_PULS_IDS});
  }catch(err){
    window.WWTP_CATCHMENT_PILOT_READY=false;
    console.warn('WWTP catchment pilot unavailable',err);
  }
})();
