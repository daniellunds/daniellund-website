/* Load selection is independent of plant capacity and the map UI. */
(function(root){
  'use strict';
  const id=value=>String(value||'').replace(/^Renseanlaeg\./i,'').toLowerCase();
  const valid=(pe,year)=>Number.isFinite(pe)&&pe>=0&&Number.isInteger(year)&&year>=1900&&year<new Date().getFullYear();
  function select(record){
    if(record&&valid(record.inletLoadPE,record.year)&&record.basis==='annual-inlet'&&record.sourceUrl){
      return {pe:record.inletLoadPE,year:record.year,source:'PULS årsbelastning',historical:false,url:record.sourceUrl};
    }
    if(record&&valid(record.historicalLoadPE,record.historicalLoadYear)&&record.historicalLoadYear===2022){
      return {pe:record.historicalLoadPE,year:2022,source:'EEA · historisk fallback',historical:true,url:record.historicalMatch?.sourceUrl};
    }
    return {pe:null,year:null,source:'Belastning mangler',historical:false,url:null};
  }
  function band(load){return load.pe===null?'unknown':load.pe>=150000?'high':load.pe>=10000?'mid':'low';}
  const labels={high:'≥150.000 PE',mid:'10.000–149.999 PE',low:'<10.000 PE',unknown:'Belastning mangler'};
  const colors={high:'#a62b71',mid:'#c36a08',low:'#217d86',unknown:'#747d87'};
  const number=value=>new Intl.NumberFormat('da-DK',{maximumFractionDigits:0}).format(value);
  function summary(load){return load.pe===null?load.source:`${number(load.pe)} PE · ${load.source} · ${load.year}`;}
  root.LoadScreening={id,valid,select,band,labels,colors,summary};
  if(typeof module==='object')module.exports=root.LoadScreening;
})(typeof window==='object'?window:globalThis);

