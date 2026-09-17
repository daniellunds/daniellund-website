const plantLoadRecords=new Map();
let plantLoadsState='loading';
function plantLoad(p){return LoadScreening.select(plantLoadRecords.get(LoadScreening.id(p.id)));}
function screeningEnabled(){return !!document.getElementById('loadScreeningEnabled')?.checked;}
function loadFilterMatches(p){
  const filter=document.getElementById('loadScreeningFilter')?.value||'all';
  return !screeningEnabled()||filter==='all'||(p.active&&LoadScreening.band(plantLoad(p))===filter);
}
async function loadPlantLoads(){
  try{
    const data=await fetchJSON(`${PROD}/plant-loads.json`);
    if(data.schemaVersion!==1||!Array.isArray(data.records))throw Error('Ugyldigt belastningsdatasæt');
    const records=new Map();
    for(const record of data.records){
      const key=LoadScreening.id(record.plantId);
      if(!key||records.has(key))throw Error('Dubleret anlægs-id i belastningsdata');
      records.set(key,record);
    }
    records.forEach((record,key)=>plantLoadRecords.set(key,record));
    plantLoadsState='ready';
  }catch(error){plantLoadsState='failed';console.warn('Belastningsdata kunne ikke indlæses',error);}
  updateLoadScreeningUI();
}
function updateLoadScreeningUI(){
  const note=document.getElementById('loadScreeningNote');
  const filter=document.getElementById('loadScreeningFilter');
  if(filter)filter.disabled=!screeningEnabled();
  if(note){
    const active=state.plants.filter(p=>p.active);
    const loads=active.map(plantLoad);
    const eea=loads.filter(l=>l.historical).length;
    note.textContent=plantLoadsState==='failed'?'EEA-belastningen kunne ikke hentes. Prøv at genindlæse siden.':plantLoadsState==='loading'?'Indlæser EEA-belastning…':`${eea} aktive anlæg med EEA-belastning fra 2022 · ${loads.filter(l=>l.pe===null).length} uden EEA-belastning. Screeningen er vejledende og ikke en myndighedsudpegning.`;
  }
  const legend=document.querySelector('.map-legend');
  if(legend&&screeningEnabled()){
    legend.innerHTML='<strong>EEA-belastning 2022 · EU-screening</strong>'+Object.entries(LoadScreening.labels).map(([k,label])=>`<span><i class="dot" style="background:${LoadScreening.colors[k]}"></i>${label}</span>`).join('')+'<small>Kilde, år og forbehold ses på anlægget</small>';
  }else if(legend){
    legend.innerHTML='<strong>Registreret designkapacitet (PULS)</strong><span><i class="dot small"></i>&lt;2.000 PE</span><span><i class="dot medium"></i>2–10.000 PE</span><span><i class="dot large"></i>10–100.000 PE</span><span><i class="dot xlarge"></i>≥100.000 PE</span>';
  }
}
function loadScreeningDetails(p){
  const load=plantLoad(p),band=LoadScreening.band(load);
  const section=document.createElement('section');section.className='load-screening-detail';
  const title=document.createElement('h3');title.textContent='EEA-belastning og EU-screening';section.append(title);
  const value=document.createElement('p');value.className='load-screening-value';value.textContent=LoadScreening.summary(load);section.append(value);
  const status=document.createElement('p');
  status.textContent=!p.active?'Nedlagt anlæg · indgår ikke i screeningen.':load.pe===null?'Kan ikke placeres i en belastningsgruppe.':band==='high'?'Direkte tærskelscreening: Anlæg på mindst 150.000 PE er omfattet af direktivets generelle krav om tertiær og kvaternær rensning, hvis EEA-belastningen svarer til direktivets juridiske belastningsgrundlag.':band==='mid'?'Risikobaseret screening: Et eventuelt krav afhænger af byområdets størrelse, recipienten og den nationale risikoudpegning.':'Under 10.000 PE i EEA 2022-grundlaget. Lokale eller konkrete udlederkrav kan stadig gælde.';section.append(status);
  const caveat=document.createElement('p');caveat.className='source-note';caveat.textContent='Screeningen bruger EEA-feltet uwwLoadEnteringUWWTP fra rapporteringsåret 2022. Det er historiske data og ikke en aktuel myndighedsafgørelse. Direktivet anvender maksimal gennemsnitlig ugebelastning i det relevante år. Byområde, recipient, risikoudpegning, udledningstilladelse og eksisterende renseevne skal derfor verificeres, før et opgraderingsbehov kan fastslås. PULS-felterne registreret designkapacitet og godkendt kapacitet vises separat og indgår ikke i screeningen.';section.append(caveat);
  const source=document.createElement('p');source.className='source-note';
  if(load.url&&/^https:\/\//.test(load.url)){const link=document.createElement('a');link.href=load.url;link.target='_blank';link.rel='noopener';link.textContent='Se belastningskilde';source.append(link,document.createTextNode(' · '));}
  const law=document.createElement('a');law.href='https://eur-lex.europa.eu/eli/dir/2024/3019/oj';law.target='_blank';law.rel='noopener';law.textContent='EU-direktivet';source.append(law);section.append(source);
  const license=document.createElement('p');license.className='source-note';license.textContent='Indeholder data, som benyttes i henhold til vilkår for brug af danske offentlige data.';section.append(license);
  return section;
}
