// Input must be a documented ANNUAL INLET export, never sample results or capacity.
const fs=require('node:fs');
const S=require('../labs/spildevandskort/load-screening.js');
function mergeAnnual(dataset,input){
  if(input.basis!=='annual-inlet'||!/^https:\/\//.test(input.sourceUrl||'')||!/^\d{4}-\d{2}-\d{2}$/.test(input.retrievedAt||'')||!Array.isArray(input.records)||!input.records.length)throw Error('Årligt indløbsgrundlag, kilde, hentningsdato og records er påkrævet');
  const records=new Map(dataset.records.map(r=>[S.id(r.plantId),{...r}])),seen=new Set();
  for(const row of input.records){
    const plantId=S.id(row.plantId),key=`${plantId}/${row.year}`;
    if(!/^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(plantId)||!S.valid(row.inletLoadPE,row.year))throw Error(`Ugyldigt anlægs-id, år eller indløbs-PE: ${key}`);
    if(seen.has(key))throw Error(`Dubleret anlæg/år: ${key}`);seen.add(key);
    const existing=records.get(plantId)||{plantId};
    if(existing.year===row.year&&existing.inletLoadPE!==row.inletLoadPE)throw Error(`Modstridende årsbelastning: ${key}`);
    if(!S.valid(existing.inletLoadPE,existing.year)||row.year>=existing.year)records.set(plantId,{...existing,plantId,year:row.year,inletLoadPE:row.inletLoadPE,basis:input.basis,sourceUrl:input.sourceUrl,retrievedAt:input.retrievedAt});
  }
  return {...dataset,annualLoadStatus:'loaded',note:'Seneste dokumenterede PULS-årsbelastning prioriteres; EEA 2022 bruges kun ved manglende PULS-årsbelastning.',records:[...records.values()]};
}
if(require.main===module){
  const inputPath=process.argv[2],outputPath=process.argv[3];
  if(!inputPath||!outputPath)throw Error('Brug: node scripts/import-annual-puls-loads.cjs annual.json plant-loads.json');
  const input=JSON.parse(fs.readFileSync(inputPath,'utf8')),dataset=JSON.parse(fs.readFileSync(outputPath,'utf8'));
  fs.writeFileSync(outputPath,JSON.stringify(mergeAnnual(dataset,input),null,2)+'\n');
}
module.exports={mergeAnnual};
