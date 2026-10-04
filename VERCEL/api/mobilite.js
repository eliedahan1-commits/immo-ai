// ══ VERCEL FUNCTION : MOBILITÉ ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const dist = parseInt(req.query.dist || '1000');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    const query = `[out:json][timeout:12];(
      node["public_transport"="stop_position"](around:${dist},${lat},${lon});
      node["highway"="bus_stop"](around:${dist},${lat},${lon});
      nwr["railway"="station"](around:${dist},${lat},${lon});
      node["railway"="subway_entrance"](around:${dist},${lat},${lon});
      node["railway"="tram_stop"](around:${dist},${lat},${lon});
      node["amenity"="bicycle_rental"](around:${dist},${lat},${lon});
      node["amenity"="charging_station"](around:${dist},${lat},${lon});
      node["amenity"="fuel"](around:${dist},${lat},${lon});
    );out center;`;

    // 2 tentatives : la 2e absorbe un refus passager d'Overpass (saturation 429/504), après une courte pause.
    // Budget total < 28 s attendus par le navigateur (loadMobilite) et < 30 s max (vercel.json).
    const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
    const NB_TENTATIVES = 2;
    const PAUSE_MS = 2000;
    const BUDGET_MS = 25000;
    const TIMEOUT_TENTATIVE_MS = 12000;
    const start = Date.now();
    let rawElements = null, derniereErreur = 'Overpass indisponible';
    for (let tentative = 1; tentative <= NB_TENTATIVES; tentative++) {
      if (tentative > 1) await new Promise(res => setTimeout(res, PAUSE_MS));
      const remaining = BUDGET_MS - (Date.now() - start);
      if (remaining < 3000) break;
      try {
        const r = await fetch(OVERPASS_URL, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'IMMOAI/2.0 (https://immo-ai-nu.vercel.app)', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(Math.min(TIMEOUT_TENTATIVE_MS, remaining))
        });
        if (!r.ok) { derniereErreur = `Overpass ${r.status}`; continue; }
        const json = await r.json();
        // Overpass peut répondre 200 avec une erreur interne : ce n'est pas « aucun transport »
        if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) { derniereErreur = 'Overpass : ' + json.remark; continue; }
        rawElements = json.elements || [];
        break;
      } catch (e) { derniereErreur = e.message; }
    }
    if (rawElements === null) throw new Error(derniereErreur);
    // Normaliser center pour les ways/relations (ex: grandes gares mappées comme bâtiment)
    const elements = rawElements.map(e => ({
      ...e,
      lat: e.lat ?? e.center?.lat,
      lon: e.lon ?? e.center?.lon
    })).filter(e => e.lat && e.lon);

    const metro = elements.filter(e => e.tags?.railway === 'subway_entrance' || e.tags?.station === 'subway');
    const gares = elements.filter(e => e.tags?.railway === 'station' && e.tags?.station !== 'subway');
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
