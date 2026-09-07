export default async function handler(req, res) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'pdk:theme_pdk_kloakopland_vedtaget',
    outputFormat: 'application/json',
    count: '5',
    srsName: 'EPSG:4326',
  });
  const url = `https://geoserver.plandata.dk/geoserver/wfs?${params}`;
  try {
    const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Plandata WFS failed', body: text.slice(0, 2000) });
      return;
    }
    const data = JSON.parse(text);
    const samples = (data.features || []).map(f => ({
      id: f.id,
      properties: f.properties,
      geometryType: f.geometry?.type || null,
    }));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      numberMatched: data.numberMatched,
      numberReturned: data.numberReturned,
      propertyKeys: [...new Set(samples.flatMap(s => Object.keys(s.properties || {})))].sort(),
      samples,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
}
