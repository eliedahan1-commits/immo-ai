// ══ VERCEL FUNCTION : AMÉNITÉS — établissements seniors (OpenStreetMap via Overpass API) ══
// Seule la liste des seniors est utilisée par le site (carte « Commerces, services & santé », filtre 🏡 Seniors).
// Les anciens comptages (restaurants, culture, parcs, sport, commerces) n'étaient affichés nulle part
// et saturaient Overpass (requêtes simultanées rejetées) : ils ont été retirés.

// ── Configuration ──
const RAYON_SENIORS_M    = 2000;  // rayon établissements seniors / EHPAD (mètres)
const TIMEOUT_SENIORS_MS = 22000; // < 25 s attendus par le navigateur (loadAmenites) et < 30 s max (vercel.json)
const CACHE_SECONDES     = 86400; // 1 jour (uniquement pour les réponses réussies)

const UA = 'IMMOAI/2.0 (https://immo-ai-nu.vercel.app)';

const SENIORS_TYPE_MAP = {
  nursing_home:    'EHPAD / Maison de retraite',
  retirement_home: 'Résidence autonomie',
  assisted_living: 'Résidence autonomie',
  group_home:      'Résidence senior',
  social_facility: 'Centre social seniors',
  community_centre:'Centre communautaire',
};

// Serveur Overpass (les miroirs kumi.systems et openstreetmap.ru ne répondent plus — retirés le 04/10/2026)
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  // Requête allégée : une seule recherche géographique (amenity = nursing_home ou social_facility),
  // puis filtrage de ce petit ensemble — mêmes résultats que 3 recherches séparées, beaucoup plus rapide.
  const q = `[out:json][timeout:20];nwr["amenity"~"^(nursing_home|social_facility)$"](around:${RAYON_SENIORS_M},${lat},${lon})->.a;(nwr.a["amenity"="nursing_home"];nwr.a["social_facility"~"nursing_home|assisted_living|group_home"];nwr.a["social_facility:for"~"senior|elderly"];);out center tags;`;

  try {
    const r = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, 'Accept': 'application/json' },
      body: 'data=' + encodeURIComponent(q),
      signal: AbortSignal.timeout(TIMEOUT_SENIORS_MS)
    });
    if (!r.ok) throw new Error('Overpass HTTP ' + r.status);
    const d = await r.json();
    const seniors = (d.elements || []).map(el => {
      const t = el.tags || {};
      return {
        nom: t.name || t['name:fr'] || 'Établissement sans nom',
        // Le type précis (social_facility) prime sur la catégorie générale (amenity=social_facility)
        type: SENIORS_TYPE_MAP[t.social_facility] || SENIORS_TYPE_MAP[t.amenity] || 'Établissement senior',
        lat: el.lat ?? el.center?.lat,
        lon: el.lon ?? el.center?.lon,
        adresse: [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ') || null,
        phone: t.phone || t['contact:phone'] || null
      };
    }).filter(e => e.lat && e.lon);

    res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDES}`);
    return res.status(200).json({
      success: true,
      rayons: { seniors: RAYON_SENIORS_M },
      seniors: { total: seniors.length, etablissements: seniors },
      source: 'OpenStreetMap via Overpass API',
      dateExtraction: new Date().toISOString()
    });
  } catch (e) {
    // Échec : on le signale (le site affiche « Données non disponibles ») au lieu de renvoyer 0 établissement
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: false, error: e.message, source: 'OpenStreetMap via Overpass API' });
  }
}
