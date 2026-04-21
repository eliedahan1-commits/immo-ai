// ══ NETLIFY FUNCTION : MOBILITÉ ══
// Récupère les arrêts de transport et infrastructures mobilité
// Source : transport.data.gouv.fr + overpass API OpenStreetMap
// Appel : /.netlify/functions/mobilite?lat=48.85&lon=2.35

export default async (req) => {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const dist = parseInt(url.searchParams.get('dist') || '500');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // Overpass API pour transports en commun (OpenStreetMap)
    const overpassQuery = `
      [out:json][timeout:10];
      (
        node["public_transport"="stop_position"](around:${dist},${lat},${lon});
        node["highway"="bus_stop"](around:${dist},${lat},${lon});
        node["railway"="station"](around:${dist},${lat},${lon});
        node["railway"="subway_entrance"](around:${dist},${lat},${lon});
        node["amenity"="bicycle_rental"](around:${dist},${lat},${lon});
        node["amenity"="charging_station"](around:${dist},${lat},${lon});
      );
      out body;
    `;

    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const overpassRes = await fetch(overpassUrl, {
      method: 'POST',
      body: `data=${encodeURIComponent(overpassQuery)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000)
    });

    if (!overpassRes.ok) throw new Error(`Overpass error: ${overpassRes.status}`);

    const overpassData = await overpassRes.json();
    const elements = overpassData.elements || [];

    // Catégoriser
    const arrets = elements.filter(e => e.tags?.public_transport === 'stop_position' || e.tags?.highway === 'bus_stop');
    const metro = elements.filter(e => e.tags?.railway === 'subway_entrance' || e.tags?.station === 'subway');
    const gares = elements.filter(e => e.tags?.railway === 'station');
    const velos = elements.filter(e => e.tags?.amenity === 'bicycle_rental');
    const bornesElec = elements.filter(e => e.tags?.amenity === 'charging_station');

    // Score mobilité /10
    let score = 0;
    if (metro.length > 0) score += 4;
    if (gares.length > 0) score += 3;
    if (arrets.length >= 3) score += 2;
    else if (arrets.length >= 1) score += 1;
    if (velos.length > 0) score += 1;
    score = Math.min(score, 10);

    // Noms des arrêts proches
    const arretNoms = [...new Set(
      [...arrets, ...metro, ...gares]
        .filter(e => e.tags?.name)
        .map(e => e.tags.name)
    )].slice(0, 5);

    return new Response(JSON.stringify({
      success: true,
      score,
      scoreLabel: score >= 8 ? 'Excellent' : score >= 6 ? 'Très bon' : score >= 4 ? 'Bon' : score >= 2 ? 'Moyen' : 'Faible',
      stats: {
        metro: metro.length,
        gares: gares.length,
        arretsBus: arrets.length,
        velos: velos.length,
        bornesElec: bornesElec.length
      },
      arretsPrincipaux: arretNoms,
      source: 'OpenStreetMap via Overpass API',
      dateExtraction: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

export const config = { path: '/api/mobilite' };
