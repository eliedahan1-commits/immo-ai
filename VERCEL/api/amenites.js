// ══ VERCEL FUNCTION : AMÉNITÉS (OpenStreetMap via Overpass API) ══

// ── Configuration ──
const RAYON_RESTAU_M   = 1000;  // rayon restaurants / cafés / bars (mètres)
const RAYON_CULTURE_M  = 2000;  // rayon lieux culturels
const RAYON_PARCS_M    = 2000;  // rayon espaces verts
const RAYON_SPORT_M    = 2000;  // rayon équipements sportifs
const RAYON_COMMERCE_M = 1000;  // rayon commerces alimentaires
const RAYON_SENIORS_M  = 2000;  // rayon établissements seniors / EHPAD
const TIMEOUT_MS       = 7000;  // timeout par requête Overpass (Vercel max 30s configuré)
const CACHE_SECONDES   = 86400; // 1 jour

const SENIORS_TYPE_MAP = {
  nursing_home:    'EHPAD / Maison de retraite',
  retirement_home: 'Résidence autonomie',
  social_facility: 'Centre social seniors',
  community_centre:'Centre communautaire',
};

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

  // Requête seniors avec liste nominative
  async function listSeniors() {
    const q = `[out:json][timeout:10];(nwr["amenity"="nursing_home"](around:${RAYON_SENIORS_M},${lat},${lon});nwr["amenity"="retirement_home"](around:${RAYON_SENIORS_M},${lat},${lon});nwr["amenity"="social_facility"]["social_facility:for"~"senior|elderly"](around:${RAYON_SENIORS_M},${lat},${lon});nwr["social_facility"~"nursing_home|group_home"](around:${RAYON_SENIORS_M},${lat},${lon}););out center tags;`;
    for (const url of OVERPASS_URLS) {
      try {
        const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'data='+encodeURIComponent(q), signal:AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) continue;
        const d = await r.json();
        return (d.elements||[]).map(el => {
          const t = el.tags||{};
          return { nom: t.name||t['name:fr']||'Établissement sans nom', type: SENIORS_TYPE_MAP[t.amenity||t.social_facility]||'Établissement senior', lat: el.lat??el.center?.lat, lon: el.lon??el.center?.lon, adresse:[t['addr:housenumber'],t['addr:street'],t['addr:city']].filter(Boolean).join(' ')||null };
        }).filter(e=>e.lat&&e.lon);
      } catch { continue; }
    }
    return [];
  }

  const [restaurants, culture, parcs, sport, commerces, seniors] = await Promise.all([
    countOverpass('["amenity"~"restaurant|cafe|bar|fast_food|brasserie"]',          RAYON_RESTAU_M),
    countOverpass('["amenity"~"theatre|cinema|museum|arts_centre|library|art_gallery"]', RAYON_CULTURE_M),
    countOverpass('["leisure"~"park|garden|nature_reserve|playground"]',            RAYON_PARCS_M),
    countOverpass('["leisure"~"sports_centre|fitness_centre|swimming_pool|stadium|golf_course|ice_rink|bowling_alley"]', RAYON_SPORT_M),
    countOverpass('["shop"~"supermarket|convenience|mall"]',                        RAYON_COMMERCE_M),
    listSeniors(),
  ]);

  res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDES}`);
  return res.status(200).json({
    success: true,
    rayons: { restau: RAYON_RESTAU_M, culture: RAYON_CULTURE_M, parcs: RAYON_PARCS_M, sport: RAYON_SPORT_M, commerces: RAYON_COMMERCE_M, seniors: RAYON_SENIORS_M },
    counts: { restaurants, culture, parcs, sport, commerces },
    seniors: { total: seniors.length, etablissements: seniors },
    source: 'OpenStreetMap via Overpass API',
    dateExtraction: new Date().toISOString()
  });
}
