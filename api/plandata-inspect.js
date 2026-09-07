import { gunzipSync } from 'node:zlib';

function countBy(features, key) {
  const out = {};
  for (const f of features) {
    const value = f?.properties?.[key];
    const label = value === null || value === undefined || value === '' ? '(missing)' : String(value);
    out[label] = (out[label] || 0) + 1;
  }
  return out;
}
function nestedCount(features, firstKey, secondKey) {
  const out = {};
  for (const f of features) {
    const p=f.properties||{};
    const a=p[firstKey] == null || p[firstKey] === '' ? '(missing)' : String(p[firstKey]);
    const b=p[secondKey] == null || p[secondKey] === '' ? '(missing)' : String(p[secondKey]);
    out[a] ||= {}; out[a][b]=(out[a][b]||0)+1;
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const base = {
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: 'pdk:theme_pdk_kloakopland_vedtaget', outputFormat: 'application/json'
    };
    const sampleParams = new URLSearchParams({...base,count:'5',srsName:'EPSG:4326'});
    const statsParams = new URLSearchParams({...base,count:'100000',propertyName:'komnr,komnavn,nuvkode,ejerkode,ejertekst'});
    const [sampleResponse,statsResponse] = await Promise.all([
      fetch(`https://geoserver.plandata.dk/geoserver/wfs?${sampleParams}`, {headers:{Accept:'application/json'}}),
      fetch(`https://geoserver.plandata.dk/geoserver/wfs?${statsParams}`, {headers:{Accept:'application/json'}})
    ]);
    if (!sampleResponse.ok) throw new Error(`Plandata sample WFS ${sampleResponse.status}`);
    if (!statsResponse.ok) throw new Error(`Plandata stats WFS ${statsResponse.status}`);
    const source=await sampleResponse.json();
    const stats=await statsResponse.json();
    const statsFeatures=stats.features||[];

    const chunks = await Promise.all([1,2,3,4].map(async i => {
      const url = `https://raw.githubusercontent.com/daniellunds/daniellund-website/main/labs/spildevandskort/data/spildevandsoplande-${i}.geojson.gz`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Static chunk ${i}: ${r.status}`);
      return JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8'));
    }));
    const staticFeatures=chunks.flatMap(c=>c.features||[]);
    const sourceSamples=(source.features||[]).map(f=>({id:f.id,properties:f.properties,geometryType:f.geometry?.type||null}));
    const municipalityOwnership={};
    for(const f of statsFeatures){
      const p=f.properties||{}; const name=p.komnavn||String(p.komnr||'(missing)'); const owner=p.ejerkode==null?'(missing)':String(p.ejerkode);
      municipalityOwnership[name] ||= {}; municipalityOwnership[name][owner]=(municipalityOwnership[name][owner]||0)+1;
    }
    const municipalitiesWithPrivateOrMixed=Object.entries(municipalityOwnership)
      .filter(([,c])=>(c['2']||0)+(c['3']||0)>0)
      .map(([name,counts])=>({name,counts}));
    const municipalitiesMissingOwnership=Object.entries(municipalityOwnership)
      .filter(([,c])=>(c['(missing)']||0)>0)
      .map(([name,counts])=>({name,counts}));

    res.setHeader('Cache-Control','no-store');
    res.status(200).json({
      sourceWfs:{
        numberMatched:source.numberMatched,
        statsReturned:statsFeatures.length,
        propertyKeys:[...new Set(sourceSamples.flatMap(s=>Object.keys(s.properties||{})))].sort(),
        samples:sourceSamples,
        ownerCodeCounts:countBy(statsFeatures,'ejerkode'),
        sewerTypeCounts:countBy(statsFeatures,'nuvkode'),
        ownerBySewerType:nestedCount(statsFeatures,'ejerkode','nuvkode'),
        municipalityCount:Object.keys(municipalityOwnership).length,
        municipalitiesWithPrivateOrMixed,
        municipalitiesMissingOwnership
      },
      staticMapData:{
        featureCount:staticFeatures.length,
        propertyKeys:[...new Set(staticFeatures.flatMap(f=>Object.keys(f.properties||{})))].sort(),
        firstSamples:staticFeatures.slice(0,3).map(f=>({properties:f.properties,geometryType:f.geometry?.type||null})),
        counts:{
          brandId:countBy(staticFeatures,'brandId'), municipality:countBy(staticFeatures,'municipality'),
          sewerType:countBy(staticFeatures,'sewerType'), sewerTypeCode:countBy(staticFeatures,'sewerTypeCode'),
          ownership:countBy(staticFeatures,'ownership'), localBrand:countBy(staticFeatures,'localBrand')
        }
      }
    });
  } catch(error){res.status(500).json({error:String(error),stack:error?.stack});}
}
