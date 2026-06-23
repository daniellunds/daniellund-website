export default async function handler(req, res) {
  const ticker = String(req.query.ticker || 'AAPL').toUpperCase();
  const range = String(req.query.range || '1Y');

  const map = {
    '1M': ['1mo', '1d'],
    '3M': ['3mo', '1d'],
    '6M': ['6mo', '1d'],
    '1Y': ['1y', '1wk'],
    '2Y': ['2y', '1wk'],
    '5Y': ['5y', '1mo'],
  };

  const [yahooRange, interval] = map[range] || map['1Y'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${yahooRange}&interval=${interval}&includePrePost=false`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
    });

    const text = await upstream.text();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    res.status(upstream.status).send(text);
  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    res.status(500).send(JSON.stringify({
      error: 'Failed to fetch market data',
      detail: String(error),
    }));
  }
}
