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
    const puls=loads.filter(l=>l.pe!==null&&!l.historical).length;
    const historical=loads.filter(l=>l.historical).length;
    note.textContent=plantLoadsState==='failed'?'Belastningsdata kunne ikke hentes. Prøv at genindlæse siden.':plantLoadsState==='loading'?'Indlæser belastningsdata…':`${puls} aktive anlæg med PULS-årsbelastning · ${historical} med EEA 2022 · ${loads.filter(l=>l.pe===null).length} uden belastning. ${puls===0?'PULS-årsbelastning er endnu ikke indlæst. ':''}Antal i belastningsgrupperne er ikke en myndighedsudpegning.`;
  }
  const legend=document.querySelector('.map-legend');
  if(legend&&screeningEnabled()){
    legend.innerHTML='<strong>Belastning · screening</strong>'+Object.entries(LoadScreening.labels).map(([k,label])=>`<span><i class="dot" style="background:${LoadScreening.colors[k]}"></i>${label}</span>`).join('')+'<small>Kilde og år ses på anlægget</small>';
  }else if(legend){
    legend.innerHTML='<strong>Teknisk kapacitet</strong><span><i class="dot small"></i>&lt;2.000 PE</span><span><i class="dot medium"></i>2–10.000 PE</span><span><i class="dot large"></i>10–100.000 PE</span><span><i class="dot xlarge"></i>≥100.000 PE</span>';
  }
}
function loadScreeningDetails(p){
  const load=plantLoad(p),band=LoadScreening.band(load);
  const section=document.createElement('section');section.className='load-screening-detail';
  const title=document.createElement('h3');title.textContent='Belastning og opgraderingsscreening';section.append(title);
  const value=document.createElement('p');value.className='load-screening-value';value.textContent=LoadScreening.summary(load);section.append(value);
  const status=document.createElement('p');
  status.textContent=!p.active?'Nedlagt anlæg · indgår ikke i screeningen.':load.pe===null?'Kan ikke placeres i en belastningsgruppe.':`${LoadScreening.labels[band]}${load.historical?' · historisk grundlag fra 2022':''}. `+(band==='high'?'Kandidat til vurdering af krav om 3. og 4. rensetrin.':band==='mid'?'Mulig kandidat. Kræver vurdering af byområde, recipient og risikoudpegning.':'Under 10.000 PE i det valgte datagrundlag. Lokale krav kan stadig gælde.');section.append(status);
  const caveat=document.createElement('p');caveat.className='source-note';caveat.textContent='Screening efter direktiv (EU) 2024/3019, artikel 7 og 8. Årsbelastning dokumenterer ikke i sig selv maksimal gennemsnitlig ugebelastning. Byområde, recipient, tilladelse og eksisterende renseevne skal afklares, før opgraderingsbehov kan fastslås. Kapacitet og godkendt belastning indgår ikke i screeningen.';section.append(caveat);
  const source=document.createElement('p');source.className='source-note';
  if(load.url&&/^https:\/\//.test(load.url)){const link=document.createElement('a');link.href=load.url;link.target='_blank';link.rel='noopener';link.textContent='Se belastningskilde';source.append(link,document.createTextNode(' · '));}
  const law=document.createElement('a');law.href='https://eur-lex.europa.eu/eli/dir/2024/3019/oj';law.target='_blank';law.rel='noopener';law.textContent='EU-direktivet';source.append(law);section.append(source);
  const license=document.createElement('p');license.className='source-note';license.textContent='Indeholder data, som benyttes i henhold til vilkår for brug af danske offentlige data.';section.append(license);
  return section;
}
