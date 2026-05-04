// ══ VERCEL FUNCTION : PRIX AU M² PAR COMMUNE ══
// geo.api.gouv.fr → communes dans le rayon → contours + prix DVF Etalab

const PRIX_M2_MIN  = 400;
const PRIX_M2_MAX  = 30000;
const SURFACE_MIN  = 9;
const PRIX_MIN     = 5000;
const MAX_COMMUNES = 20;
const RAYON_DVF_M  = 4000;   // rayon DVF autour du centre de chaque commune
const TIMEOUT_GEO  = 7000;
const TIMEOUT_DVF  = 9000;
const CACHE        = 86400;  // 24h

function distKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * 111;
  const dLon = (lon2 - lon1) * 111 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function medianPrix(features) {
  const vals = (features || [])
    .filter(f => {
      const p = f.properties || {};
      return p.nature_mutation === 'Vente'
        && (p.surface_reelle_bati || 0) > SURFACE_MIN
        && (p.valeur_fonciere || 0) > PRIX_MIN;
    })
    .map(f => {
      const p = f.properties;
      return Math.round(p.valeur_fonciere / p.surface_reelle_bati);
    })
    .filter(p => p > PRIX_M2_MIN && p < PRIX_M2_MAX)
    .sort((a, b) => a - b);
  return vals.length ? { median: vals[Math.floor(vals.length / 2)], count: vals.length } : { median: null, count: 0 };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat    = parseFloat(req.query.lat);
  const lon    = parseFloat(req.query.lon);
  const rayonKm = parseInt(req.query.rayon || '18');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    // 1. Commune principale → code département
    const r0 = await fetch(
      `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=nom,code,codeDepartement`,
      { signal: AbortSignal.timeout(TIMEOUT_GEO) }
    );
    const arr0 = await r0.json();
    const c0   = arr0?.[0];
    if (!c0) throw new Error('Commune introuvable');

    // 2. Toutes les communes du département (centres uniquement, léger)
    const rDept = await fetch(
      `https://geo.api.gouv.fr/departements/${c0.codeDepartement}/communes?fields=nom,code,centre`,
      { signal: AbortSignal.timeout(TIMEOUT_GEO) }
    );
    if (!rDept.ok) throw new Error('geo.api.gouv.fr indisponible');
    const allCommunes = await rDept.json();

    // 3. Filtrer dans le rayon, trier par distance, limiter
    const nearby = allCommunes
      .filter(c => {
        const coords = c.centre?.coordinates;
        return coords && distKm(lat, lon, coords[1], coords[0]) <= rayonKm;
      })
      .sort((a, b) => {
        const ca = a.centre.coordinates, cb = b.centre.coordinates;
        return distKm(lat, lon, ca[1], ca[0]) - distKm(lat, lon, cb[1], cb[0]);
      })
      .slice(0, MAX_COMMUNES);

    // 4. Contour + DVF en parallèle pour chaque commune
    const results = await Promise.all(nearby.map(async c => {
      const [cLon, cLat] = c.centre.coordinates;
      const distFromCenter = Math.round(distKm(lat, lon, cLat, cLon) * 10) / 10;

      const [contourRes, dvfRes] = await Promise.all([
        fetch(
          `https://geo.api.gouv.fr/communes/${c.code}?fields=contour`,
          { signal: AbortSignal.timeout(TIMEOUT_GEO) }
        ).catch(() => null),
        fetch(
          `https://api.dvf.etalab.gouv.fr/dvf/around/?lat=${cLat}&lon=${cLon}&dist=${RAYON_DVF_M}`,
          { signal: AbortSignal.timeout(TIMEOUT_DVF) }
        ).catch(() => null),
      ]);

      // Contour GeoJSON
      let contour = null;
      try {
        if (contourRes?.ok) {
          const gj = await contourRes.json();
          contour = gj.contour || null;
        }
      } catch {}

      // Prix médian
      let median = null, count = 0;
      try {
        if (dvfRes?.ok) {
          const dvfData = await dvfRes.json();
          const r = medianPrix(dvfData.features || []);
          median = r.median;
          count  = r.count;
        }
      } catch {}

      return { code: c.code, nom: c.nom, lat: cLat, lon: cLon, distFromCenter, contour, medianM2: median, count };
    }));

    const withContour = results.filter(r => r.contour);

    res.setHeader('Cache-Control', `public, max-age=${CACHE}`);
    return res.status(200).json({
      success: true,
      communePrincipale: c0.nom,
      communes: withContour,
      dvfDisponible: withContour.some(c => c.medianM2 !== null),
      source: 'geo.api.gouv.fr · DVF Etalab DGFiP',
      dateExtraction: new Date().toISOString()
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
