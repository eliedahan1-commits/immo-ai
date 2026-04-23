// ══ NETLIFY FUNCTION : MOBILITÉ ══
// Source : Overpass API (OpenStreetMap) avec User-Agent correct
export default async (req) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  const dist = parseInt(url.searchParams.get('dist') || '500');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const query = `[out:json][timeout:12];(
      node["public_transport"="stop_position"](around:${dist},${lat},${lon});
      node["highway"="bus_stop"](around:${dist},${lat},${lon});
      node["railway"="station"](around:${dist},${lat},${lon});
      node["railway"="subway_entrance"](around:${dist},${lat},${lon});
      node["railway"="tram_stop"](around:${dist},${lat},${lon});
      node["amenity"="bicycle_rental"](around:${dist},${lat},${lon});
      node["amenity"="charging_station"](around:${dist},${lat},${lon});
    );out body;`;

    // Utiliser l'instance Overpass officielle avec bon User-Agent
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'IMMOAI/2.0 (https://immo-ai.netlify.app; contact@immoai.fr)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!r.ok) throw new Error(`Overpass ${r.status}`);

    const data = await r.json();
    const elements = data.elements || [];

    const metro = elements.filter(e => e.tags?.railway === 'subway_entrance' || e.tags?.station === 'subway');
    const gares = elements.filter(e => e.tags?.railway === 'station');
    const trams = elements.filter(e => e.tags?.railway === 'tram_stop');
    const bus = elements.filter(e => e.tags?.highway === 'bus_stop' || e.tags?.public_transport === 'stop_position');
    const velos = elements.filter(e => e.tags?.amenity === 'bicycle_rental');
    const bornes = elements.filter(e => e.tags?.amenity === 'charging_station');

    let score = 0;
    if (metro.length > 0) score += 4;
    if (gares.length > 0) score += 3;
    if (trams.length > 0) score += 2;
    if (bus.length >= 3) score += 2;
    else if (bus.length >= 1) score += 1;
    if (velos.length > 0) score += 1;
    score = Math.min(score, 10);

    const noms = [...new Set([...metro, ...gares, ...trams, ...bus]
      .filter(e => e.tags?.name).map(e => e.tags.name))].slice(0, 5);

    return new Response(JSON.stringify({
      success: true,
      score,
      scoreLabel: score >= 8 ? 'Excellent' : score >= 6 ? 'Très bon' : score >= 4 ? 'Bon' : score >= 2 ? 'Moyen' : 'Faible',
      stats: { metro: metro.length, gares: gares.length, trams: trams.length, arretsBus: bus.length, velos: velos.length, bornesElec: bornes.length },
      arretsPrincipaux: noms,
      elements: elements.filter(e => e.lat && e.lon && e.tags?.name).slice(0, 50),
      source: 'OpenStreetMap via Overpass API',
      dateExtraction: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

export const config = { path: '/api/mobilite' };
