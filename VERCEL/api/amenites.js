// ══ VERCEL FUNCTION : AMÉNITÉS (OpenStreetMap via Overpass API) ══

// ── Configuration ──
const RAYON_RESTAU_M   = 1000;  // rayon restaurants / cafés / bars (mètres)
const RAYON_CULTURE_M  = 2000;  // rayon lieux culturels
const RAYON_PARCS_M    = 2000;  // rayon espaces verts
const RAYON_SPORT_M    = 2000;  // rayon équipements sportifs
const RAYON_COMMERCE_M = 1000;  // rayon commerces alimentaires
const TIMEOUT_MS       = 7000;  // timeout par requête Overpass (Vercel max 30s configuré)
const CACHE_SECONDES   = 86400; // 1 jour

// Instances Overpass en fallback (la première disponible est utilisée)
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  async function countOverpass(filtre, rayon) {
    const query = `[out:json][timeout:6];\nnwr${filtre}(around:${rayon},${lat},${lon});\nout count;`;
    for (const url of OVERPASS_URLS) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        if (!r.ok) continue;
        const d = await r.json();
        return parseInt(d.elements?.[0]?.tags?.total || 0);
      } catch { continue; }
    }
    return 0;
  }

  const [restaurants, culture, parcs, sport, commerces] = await Promise.all([
    countOverpass('["amenity"~"restaurant|cafe|bar|fast_food|brasserie"]',          RAYON_RESTAU_M),
    countOverpass('["amenity"~"theatre|cinema|museum|arts_centre|library|art_gallery"]', RAYON_CULTURE_M),
    countOverpass('["leisure"~"park|garden|nature_reserve|playground"]',            RAYON_PARCS_M),
    countOverpass('["leisure"~"sports_centre|fitness_centre|swimming_pool|pitch|track"]', RAYON_SPORT_M),
    countOverpass('["shop"~"supermarket|convenience|mall"]',                        RAYON_COMMERCE_M),
  ]);

  res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDES}`);
  return res.status(200).json({
    success: true,
    rayons: { restau: RAYON_RESTAU_M, culture: RAYON_CULTURE_M, parcs: RAYON_PARCS_M, sport: RAYON_SPORT_M, commerces: RAYON_COMMERCE_M },
    counts: { restaurants, culture, parcs, sport, commerces },
    source: 'OpenStreetMap via Overpass API',
    dateExtraction: new Date().toISOString()
  });
}
