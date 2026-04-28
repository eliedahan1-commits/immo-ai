// ══ VERCEL FUNCTION : DVF (nouvelle API dvf-api.data.gouv.fr) ══

// ── Configuration ──
const DIST_DEFAUT_M        = 3000;   // rayon de recherche par défaut (mètres)
const DIST_MIN_TRANSACTIONS = 5;     // nb minimum de ventes avant d'élargir aux sections voisines
const PRIX_M2_MIN          = 500;    // filtre : prix/m² minimum valide (€)
const PRIX_M2_MAX          = 50000;  // filtre : prix/m² maximum valide (€)
const SURFACE_MIN_M2       = 9;      // filtre : surface minimum (m²)
const PRIX_MIN_TOTAL       = 10000;  // filtre : valeur foncière minimum (€)
const NB_RECENTES          = 8;      // nb de transactions récentes retournées dans le détail
const CACHE_SECONDES       = 86400;  // durée du cache CDN (1 jour)
const TIMEOUT_IGN_MS       = 6000;   // timeout appel IGN
const TIMEOUT_DVF_MS       = 8000;   // timeout appel dvf-api
const IGN_BBOX_LIMIT       = 50;     // nb max parcelles retournées pour la découverte de sections
const IDU_COMMUNE_END      = 5;      // position fin du code commune dans l'IDU
const IDU_SECTION_END      = 10;     // position fin du préfixe section dans l'IDU

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

  function buildResult(valides, rayon, source) {
    const prix = valides.map(t => t.prixM2).sort((a, b) => a - b);
    return {
      success: true, count: valides.length, rayon, source,
      stats: { medianM2: prix[Math.floor(prix.length / 2)], minM2: prix[0], maxM2: prix[prix.length - 1] },
      recentes: valides.slice(0, NB_RECENTES),
      dateExtraction: new Date().toISOString()
    };
  }

  function normalise(mutations, lat, lon, rayon) {
    return mutations
      .filter(m => {
        if (!m.latitude || !m.longitude) return false;
        if (distM(lat, lon, m.latitude, m.longitude) > rayon) return false;
        if (m.nature_mutation !== 'Vente') return false;
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
          adresse: `${m.adresse_numero || ''} ${m.adresse_nom_voie || ''}`.trim()
        };
      })
      .filter(t => t.prixM2 > PRIX_M2_MIN && t.prixM2 < PRIX_M2_MAX);
  }

  // Étape 1 : récupérer commune + section via IGN Cadastre
  try {
    const ignUrl = `https://apicarto.ign.fr/api/cadastre/parcelle?geom={"type":"Point","coordinates":[${lon},${lat}]}&_limit=1`;
    const ignRes = await fetch(ignUrl, { signal: AbortSignal.timeout(TIMEOUT_IGN_MS) });
    if (!ignRes.ok) throw new Error('IGN ' + ignRes.status);

    const ignData = await ignRes.json();
    const idu = ignData.features?.[0]?.properties?.idu;
    if (!idu || idu.length < IDU_SECTION_END) throw new Error('idu manquant');

    const codeCommune = idu.substring(0, IDU_COMMUNE_END);
    const sectionPrefix = idu.substring(IDU_COMMUNE_END, IDU_SECTION_END);

    // Étape 2 : mutations DVF pour cette section
    const dvfUrl = `https://dvf-api.data.gouv.fr/mutations/${codeCommune}/${sectionPrefix}`;
    const dvfRes = await fetch(dvfUrl, { signal: AbortSignal.timeout(TIMEOUT_DVF_MS) });
    if (!dvfRes.ok) throw new Error('DVF API ' + dvfRes.status);

    const dvfData = await dvfRes.json();
    const mutations = dvfData.data || [];

    const valides = normalise(mutations, lat, lon, dist);

    if (valides.length >= DIST_MIN_TRANSACTIONS) {
      res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDES}`);
      return res.status(200).json(buildResult(valides, dist, 'DVF DGFiP · dvf-api.data.gouv.fr'));
    }

    // Si section courante insuffisante : découvrir les sections voisines via IGN (bbox)
    const deg = dist / 111000;
    const bbox = `${lon - deg},${lat - deg},${lon + deg},${lat + deg}`;
    const ignWide = await fetch(
      `https://apicarto.ign.fr/api/cadastre/parcelle?bbox=${bbox}&_limit=${IGN_BBOX_LIMIT}`,
      { signal: AbortSignal.timeout(TIMEOUT_DVF_MS) }
    );
    const sections = new Set([sectionPrefix]);
    if (ignWide.ok) {
      const wideData = await ignWide.json();
      for (const f of wideData.features || []) {
        const idu2 = f.properties?.idu;
        if (idu2 && idu2.startsWith(codeCommune)) {
          sections.add(idu2.substring(IDU_COMMUNE_END, IDU_SECTION_END));
        }
      }
    }

    // Interroger toutes les sections découvertes dynamiquement
    let toutesValides = [...valides];
    const autresSections = [...sections].filter(s => s !== sectionPrefix);
    await Promise.all(autresSections.map(async (sec) => {
      try {
        const r2 = await fetch(`https://dvf-api.data.gouv.fr/mutations/${codeCommune}/${sec}`, { signal: AbortSignal.timeout(TIMEOUT_IGN_MS) });
        if (r2.ok) {
          const d2 = await r2.json();
          toutesValides = toutesValides.concat(normalise(d2.data || [], lat, lon, dist));
        }
      } catch(e) {}
    }));

    if (toutesValides.length > 0) {
      res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDES}`);
      return res.status(200).json(buildResult(toutesValides, dist, 'DVF DGFiP · dvf-api.data.gouv.fr'));
    }

    throw new Error('Aucune transaction dans le secteur');

  } catch(e) {
    return res.status(200).json({ success: false, count: 0, stats: null, message: e.message });
  }
}
