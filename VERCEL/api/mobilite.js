// ══ VERCEL FUNCTION : MOBILITÉ ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const dist = parseInt(req.query.dist || '1000');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    const query = `[out:json][timeout:8];(
      node["public_transport"="stop_position"](around:${dist},${lat},${lon});
      node["highway"="bus_stop"](around:${dist},${lat},${lon});
      node["railway"="station"](around:${dist},${lat},${lon});
      node["railway"="subway_entrance"](around:${dist},${lat},${lon});
      node["railway"="tram_stop"](around:${dist},${lat},${lon});
      node["amenity"="bicycle_rental"](around:${dist},${lat},${lon});
      node["amenity"="charging_station"](around:${dist},${lat},${lon});
      node["amenity"="fuel"](around:${dist},${lat},${lon});
    );out body;`;

    const OVERPASS_URLS = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter',
    ];
    let data = null;
    for (const url of OVERPASS_URLS) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(9000)
        });
        if (!r.ok) continue;
        data = await r.json();
        break;
      } catch { continue; }
    }
    if (!data) throw new Error('Tous les serveurs Overpass sont indisponibles');
    const elements = data.elements || [];

    const metro = elements.filter(e => e.tags?.railway === 'subway_entrance' || e.tags?.station === 'subway');
    const gares = elements.filter(e => e.tags?.railway === 'station');
    const trams = elements.filter(e => e.tags?.railway === 'tram_stop');
    const bus = elements.filter(e => e.tags?.highway === 'bus_stop' || e.tags?.public_transport === 'stop_position');
    const velos = elements.filter(e => e.tags?.amenity === 'bicycle_rental');
    const bornes = elements.filter(e => e.tags?.amenity === 'charging_station');
    const pompes = elements.filter(e => e.tags?.amenity === 'fuel');

    let score = 0;
    if (metro.length > 0) score += 4;
    if (gares.length > 0) score += 3;
    if (trams.length > 0) score += 2;
    if (bus.length >= 3) score += 2; else if (bus.length >= 1) score += 1;
    if (velos.length > 0) score += 1;
    score = Math.min(score, 10);

    const noms = [...new Set([...metro, ...gares, ...trams, ...bus].filter(e => e.tags?.name).map(e => e.tags.name))].slice(0, 5);

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({
      success: true, score,
      scoreLabel: score >= 8 ? 'Excellent' : score >= 6 ? 'Très bon' : score >= 4 ? 'Bon' : score >= 2 ? 'Moyen' : 'Faible',
      stats: { metro: metro.length, gares: gares.length, trams: trams.length, arretsBus: bus.length, velos: velos.length, bornesElec: bornes.length, pompes: pompes.length },
      arretsPrincipaux: noms,
      elements: elements.filter(e => e.lat && e.lon),
      source: 'OpenStreetMap via Overpass API',
      dateExtraction: new Date().toISOString()
    });
  } catch (error) {
    const isTimeout = error.message?.includes('timeout') || error.name === 'TimeoutError';
    return res.status(200).json({
      success: false,
      score: 0, scoreLabel: 'Non disponible',
      stats: { metro: 0, gares: 0, trams: 0, arretsBus: 0, velos: 0, bornesElec: 0 },
      arretsPrincipaux: [], elements: [],
      error: isTimeout ? 'Délai dépassé · Réessayez dans quelques secondes' : error.message,
      source: 'OpenStreetMap via Overpass API'
    });
  }
}
