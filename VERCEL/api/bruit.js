// ══ VERCEL FUNCTION : BRUIT (estimation OSM) ══
// Interroge Overpass pour les sources de bruit proches et calcule un indicateur de risque.

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const TIMEOUT_MS = 8000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    const query = `[out:json][timeout:7];(
      way["highway"~"motorway|trunk"](around:500,${lat},${lon});
      way["highway"="primary"](around:300,${lat},${lon});
      way["highway"="secondary"](around:200,${lat},${lon});
      way["railway"~"rail|subway|tram"](around:400,${lat},${lon});
      node["aeroway"="aerodrome"](around:8000,${lat},${lon});
      way["aeroway"="aerodrome"](around:8000,${lat},${lon});
    );out tags;`;

    let elements = [];
    for (const url of OVERPASS_URLS) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!r.ok) continue;
        const d = await r.json();
        elements = d.elements || [];
        break;
      } catch { continue; }
    }

    // Analyse des sources
    const sources = [];
    let score = 0; // 0 = faible, accumule

    const autoroutes = elements.filter(e => ['motorway','trunk'].includes(e.tags?.highway));
    const voiesRapides = elements.filter(e => e.tags?.highway === 'primary');
    const voiesSecondaires = elements.filter(e => e.tags?.highway === 'secondary');
    const voiesFerrees = elements.filter(e => ['rail','subway','tram'].includes(e.tags?.railway));
    const aeroports = elements.filter(e => e.tags?.aeroway === 'aerodrome');

    if (autoroutes.length > 0) {
      score += 4;
      const noms = [...new Set(autoroutes.map(e => e.tags?.name || e.tags?.ref).filter(Boolean))].slice(0,3);
      sources.push({ icone: '🛣️', label: 'Autoroute / voie rapide', detail: noms.join(', ') || '', niveau: 'elevé' });
    }
    if (voiesFerrees.length > 0) {
      score += 3;
      const noms = [...new Set(voiesFerrees.map(e => e.tags?.name).filter(Boolean))].slice(0,3);
      sources.push({ icone: '🚆', label: 'Voie ferrée / ligne de transport', detail: noms.join(', ') || '', niveau: 'elevé' });
    }
    if (aeroports.length > 0) {
      score += 3;
      const noms = [...new Set(aeroports.map(e => e.tags?.name).filter(Boolean))].slice(0,2);
      sources.push({ icone: '✈️', label: 'Aéroport à proximité', detail: noms.join(', ') || '', niveau: 'elevé' });
    }
    if (voiesRapides.length > 0) {
      score += 2;
      const noms = [...new Set(voiesRapides.map(e => e.tags?.name || e.tags?.ref).filter(Boolean))].slice(0,3);
      sources.push({ icone: '🚗', label: 'Axe routier principal', detail: noms.join(', ') || '', niveau: 'modere' });
    }
    if (voiesSecondaires.length > 0 && score < 3) {
      score += 1;
      sources.push({ icone: '🚙', label: 'Voie secondaire', detail: '', niveau: 'faible' });
    }

    score = Math.min(score, 10);
    const niveau = score >= 7 ? 'Élevé' : score >= 4 ? 'Modéré' : score >= 2 ? 'Faible' : 'Très faible';
    const niveauCode = score >= 7 ? 'eleve' : score >= 4 ? 'modere' : 'faible';

    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({
      success: true,
      score,
      niveau,
      niveauCode,
      sources,
      avertissement: 'Estimation basée sur l\'infrastructure OSM — non certifiée',
      source: 'OpenStreetMap via Overpass API',
      dateExtraction: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(200).json({
      success: false,
      score: null,
      niveau: 'Non disponible',
      niveauCode: 'inconnu',
      sources: [],
      error: error.message,
      source: 'OpenStreetMap via Overpass API',
    });
  }
}
