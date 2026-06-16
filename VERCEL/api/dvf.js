// ══ VERCEL FUNCTION : DVF (nouvelle API dvf-api.data.gouv.fr) ══

// ── Configuration ──
const ANNEE_MIN = new Date().getFullYear() - 10;  // 10 ans glissants depuis la date du jour
const DIST_DEFAUT_M        = 3000;   // rayon de recherche par défaut (mètres)
const PRIX_M2_MIN          = 500;    // filtre : prix/m² minimum valide (€)
const PRIX_M2_MAX          = 50000;  // filtre : prix/m² maximum valide (€)
const SURFACE_MIN_M2       = 9;      // filtre : surface minimum (m²)
const PRIX_MIN_TOTAL       = 10000;  // filtre : valeur foncière minimum (€)
const CACHE_SECONDES       = 86400;  // durée du cache CDN (1 jour)
const TIMEOUT_IGN_MS       = 6000;   // timeout appel IGN
const TIMEOUT_DVF_MS       = 8000;   // timeout appel dvf-api
const IGN_BBOX_LIMIT       = 100;    // nb max parcelles retournées pour la découverte de sections
const IDU_COMMUNE_END      = 5;      // position fin du code commune dans l'IDU
const IDU_SECTION_END      = 10;     // position fin du préfixe section dans l'IDU
// Types de biens principaux (priorité sur les dépendances lors de la déduplication par mutation)
const TYPES_PRIORITAIRES   = ['Appartement', 'Maison'];
// Décalages en mètres [nord/sud, est/ouest] pour sonder les parcelles voisines si le point exact est sur une voie
const IGN_OFFSETS_M = [[0,0],[15,0],[-15,0],[0,15],[0,-15],[15,15],[-15,-15]];


// ── Estimation du nombre de pièces par surface (fallback quand DVF ne renseigne pas le champ) ──
const SURFACE_PIECES_APPART = [
  [35, 1],   // < 35 m² → Studio/T1
  [55, 2],   // 35–55 m² → T2
  [80, 3],   // 55–80 m² → T3
  [110, 4],  // 80–110 m² → T4
  [Infinity, 5], // > 110 m² → T5+
];
const SURFACE_PIECES_MAISON = [
  [50, 2],
  [80, 3],
  [110, 4],
  [Infinity, 5],
];
function estimePieces(surf, type) {
  if (!surf || surf < 9) return null;
  const table = (type === 'Maison') ? SURFACE_PIECES_MAISON : SURFACE_PIECES_APPART;
  for (const [seuil, p] of table) {
    if (surf < seuil) return p;
  }
  return 5;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const dist = parseInt(req.query.dist || String(DIST_DEFAUT_M));

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  function distM(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * 111000;
    const dLon = (lon2 - lon1) * 111000 * Math.cos(lat1 * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }

  // Déduplique les lots issus d'une même mutation (même vente = même id_mutation)
  // Conserve le lot principal (Appartement/Maison) plutôt que les dépendances
  function deduplique(items) {
    const map = new Map();
    for (const t of items) {
      const key = t.idMutation || `${t.date}|${t.prix}|${t.adresse}`;
      if (!map.has(key)) {
        map.set(key, t);
      } else {
        const existing  = map.get(key);
        const existPrio = TYPES_PRIORITAIRES.includes(existing.type);
        const currPrio  = TYPES_PRIORITAIRES.includes(t.type);
        if (currPrio && !existPrio) { map.set(key, t); continue; }
        if (currPrio && existPrio && !existing.pieces && t.pieces) map.set(key, t);
      }
    }
    return [...map.values()];
  }

  function buildResult(valides, rayon, source) {
    const prix = valides.map(t => t.prixM2).sort((a, b) => a - b);
    const dates = valides.map(t => t.date).filter(d => d && d !== '—').sort();
    const anneeMin = dates.length ? dates[0].substring(0, 4) : null;
    const anneeMax = dates.length ? dates[dates.length - 1].substring(0, 4) : null;
    const dateRange = anneeMin ? (anneeMin === anneeMax ? anneeMin : `${anneeMin}–${anneeMax}`) : null;
    const tries = [...valides].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return {
      success: true, count: valides.length, rayon, source, dateRange,
      stats: { medianM2: Math.round(prix.reduce((a,b)=>a+b,0)/prix.length), minM2: prix[0], maxM2: prix[prix.length - 1] },
      recentes: tries,
      dateExtraction: new Date().toISOString()
    };
  }

  function normalise(mutations, lat, lon, rayon) {
    return mutations
      .filter(m => {
        if (!m.latitude || !m.longitude) return false;
        if (distM(lat, lon, m.latitude, m.longitude) > rayon) return false;
        if (m.nature_mutation !== 'Vente') return false;
        const annee = parseInt((m.date_mutation || '').substring(0, 4));
        if (annee < ANNEE_MIN) return false;
        const surf = parseFloat(m.surface_reelle_bati || m.lot1_surface_carrez || 0);
        const prix = parseFloat(m.valeur_fonciere || 0);
        return surf > SURFACE_MIN_M2 && prix > PRIX_MIN_TOTAL;
      })
      .map(m => {
        const surf = parseFloat(m.surface_reelle_bati || m.lot1_surface_carrez || 0);
        const prix = parseFloat(m.valeur_fonciere || 0);
        const prixM2 = Math.round(prix / surf);
        return { surf: Math.round(surf), prix: Math.round(prix), prixM2,
          date: m.date_mutation || '—',
          type: m.type_local || '—',
          adresse: `${m.adresse_numero || ''} ${m.adresse_nom_voie || ''}`.trim(),
          lat: parseFloat(m.latitude) || null,
          lon: parseFloat(m.longitude) || null,
          idMutation: m.id_mutation || null,
          pieces: parseInt(m.nombre_pieces_principales) || estimePieces(parseFloat(m.surface_reelle_bati || m.lot1_surface_carrez || 0), m.type_local || '—'),
          piecesEstime: !parseInt(m.nombre_pieces_principales),
          surfaceTerrain: Math.round(parseFloat(m.surface_terrain || 0)) || null
        };
      })
      .filter(t => t.prixM2 > PRIX_M2_MIN && t.prixM2 < PRIX_M2_MAX);
  }

  try {
    // Étape 1 : identifier la commune via sondes IGN autour du point GPS
    const offsetsDeg = IGN_OFFSETS_M.map(([dm, dn]) => [dm / 111000, dn / (111000 * Math.cos(lat * Math.PI / 180))]);
    const idus = await Promise.all(offsetsDeg.map(async ([dlat, dlon]) => {
      try {
        const url = `https://apicarto.ign.fr/api/cadastre/parcelle?geom={"type":"Point","coordinates":[${lon+dlon},${lat+dlat}]}&_limit=1`;
        const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_IGN_MS) });
        if (!r.ok) return null;
        const d = await r.json();
        return d.features?.[0]?.properties?.idu || null;
      } catch { return null; }
    }));

    const validIdus = idus.filter(Boolean);
    if (!validIdus.length) throw new Error('Aucune parcelle trouvée à proximité');

    const codeCommune = validIdus[0].substring(0, IDU_COMMUNE_END);

    // Étape 2 : découvrir TOUTES les sections cadastrales dans le rayon via bbox IGN
    // (garantit des résultats identiques quelle que soit la rue de départ dans le secteur)
    const deg = dist / 111000;
    const bbox = `${lon - deg},${lat - deg},${lon + deg},${lat + deg}`;
    const sectionsSet = new Set(validIdus.map(idu => idu.substring(IDU_COMMUNE_END, IDU_SECTION_END)));

    try {
      const ignWide = await fetch(
        `https://apicarto.ign.fr/api/cadastre/parcelle?bbox=${bbox}&_limit=${IGN_BBOX_LIMIT}`,
        { signal: AbortSignal.timeout(TIMEOUT_IGN_MS) }
      );
      if (ignWide.ok) {
        const wideData = await ignWide.json();
        for (const f of wideData.features || []) {
          const idu2 = f.properties?.idu;
          // Uniquement les sections de la même commune (pas les communes voisines)
          if (idu2 && idu2.startsWith(codeCommune)) {
            sectionsSet.add(idu2.substring(IDU_COMMUNE_END, IDU_SECTION_END));
          }
        }
      }
    } catch(e) { /* bbox IGN échoue → on utilise les sections des sondes initiales */ }

    const sections = [...sectionsSet];

    // Étape 3 : interroger toutes les sections découvertes en parallèle
    let toutesValides = [];
    await Promise.all(sections.map(async (sec) => {
      try {
        const r = await fetch(`https://dvf-api.data.gouv.fr/mutations/${codeCommune}/${sec}`, { signal: AbortSignal.timeout(TIMEOUT_DVF_MS) });
        if (r.ok) {
          const d = await r.json();
          toutesValides = toutesValides.concat(normalise(d.data || [], lat, lon, dist));
        }
      } catch(e) {}
    }));

    toutesValides = deduplique(toutesValides);

    if (toutesValides.length > 0) {
      res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDES}`);
      return res.status(200).json(buildResult(toutesValides, dist, 'DVF DGFiP · dvf-api.data.gouv.fr'));
    }

    throw new Error('Aucune transaction dans le secteur');

  } catch(e) {
    return res.status(200).json({ success: false, count: 0, stats: null, message: e.message });
  }
}
