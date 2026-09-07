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

export default async function handler(req, res) {
  try {
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'pdk:theme_pdk_kloakopland_vedtaget',
      outputFormat: 'application/json',
      count: '5',
      srsName: 'EPSG:4326',
    });
    const sourceUrl = `https://geoserver.plandata.dk/geoserver/wfs?${params}`;
    const sourceResponse = await fetch(sourceUrl, { headers: { Accept: 'application/json' } });
    if (!sourceResponse.ok) throw new Error(`Plandata WFS ${sourceResponse.status}`);
    const source = await sourceResponse.json();

    const chunks = await Promise.all([1,2,3,4].map(async i => {
      const url = `https://raw.githubusercontent.com/daniellunds/daniellund-website/main/labs/spildevandskort/data/spildevandsoplande-${i}.geojson.gz`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Static chunk ${i}: ${r.status}`);
      const compressed = Buffer.from(await r.arrayBuffer());
      return JSON.parse(gunzipSync(compressed).toString('utf8'));
    }));
    const staticFeatures = chunks.flatMap(c => c.features || []);
    const staticKeys = [...new Set(staticFeatures.flatMap(f => Object.keys(f.properties || {})))].sort();
    const firstStatic = staticFeatures.slice(0, 3).map(f => ({ id: f.id, properties: f.properties, geometryType: f.geometry?.type || null }));
    const sourceSamples = (source.features || []).map(f => ({ id: f.id, properties: f.properties, geometryType: f.geometry?.type || null }));

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      sourceWfs: {
        numberMatched: source.numberMatched,
        numberReturned: source.numberReturned,
        propertyKeys: [...new Set(sourceSamples.flatMap(s => Object.keys(s.properties || {})))].sort(),
        samples: sourceSamples,
      },
      staticMapData: {
        featureCount: staticFeatures.length,
        propertyKeys: staticKeys,
        firstSamples: firstStatic,
        counts: {
          brandId: countBy(staticFeatures, 'brandId'),
          displayType: countBy(staticFeatures, 'displayType'),
          ownerCode: countBy(staticFeatures, 'ownerCode'),
          ownerText: countBy(staticFeatures, 'ownerText'),
          ejerkode: countBy(staticFeatures, 'ejerkode'),
          ejertekst: countBy(staticFeatures, 'ejertekst'),
          currentSewerCode: countBy(staticFeatures, 'currentSewerCode'),
          nuvkode: countBy(staticFeatures, 'nuvkode'),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: String(error), stack: error?.stack });
  }
}
