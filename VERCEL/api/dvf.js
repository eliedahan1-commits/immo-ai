// ══ VERCEL FUNCTION : DVF ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const dist = parseInt(req.query.dist || '2000');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  // Normalise les items selon la source et retourne { surf, prix, date, type, adresse }
  function normalise(items) {
    return items.map(t => {
      const p = t.properties || t;
      const surf = parseFloat(p.surface_reelle_bati || p.surface_carrez || p.surface_habitable || p.surface || 0);
      const prix = parseFloat(p.valeur_fonciere || p.prix || 0);
      const prixM2 = (surf > 9 && prix > 10000) ? Math.round(prix / surf) : 0;
      return {
        surf: Math.round(surf), prix: Math.round(prix), prixM2,
        date: p.date_mutation || p.date_vente || p.date || '—',
        type: p.type_local || p.nature_mutation || p.type || '—',
        adresse: `${p.adresse_numero || p.no_voie || ''} ${p.adresse_nom_voie || p.voie || p.adresse || ''}`.trim()
      };
    }).filter(t => t.prixM2 > 500 && t.prixM2 < 50000);
  }

  function buildResult(valides, rayon, source) {
    const sorted = valides.map(t => t.prixM2).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return { success: true, count: valides.length, rayon,
      stats: { medianM2: median, minM2: sorted[0], maxM2: sorted[sorted.length - 1] },
      recentes: valides.slice(0, 8), source, dateExtraction: new Date().toISOString() };
  }

  // Source 1 : API Etalab officielle (data.gouv.fr)
  try {
    const url = `https://api.dvf.etalab.gouv.fr/dvf/around/?lat=${lat}&lon=${lon}&dist=${dist}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const data = await r.json();
      const items = data.features || data.results || data.items || [];
      const valides = normalise(items);
      if (valides.length > 0) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.status(200).json(buildResult(valides, dist, 'DVF DGFiP · etalab.gouv.fr'));
      }
    }
  } catch(e) { /* suivant */ }

  // Source 2 : api.cquest.org
  try {
    const url = `https://api.cquest.org/dvf?lat=${lat}&lon=${lon}&dist=${dist}&nature_mutation=Vente`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (r.ok) {
      const data = await r.json();
      const items = data.resultats || data.results || [];
      const valides = normalise(items);
      if (valides.length > 0) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.status(200).json(buildResult(valides, dist, 'DVF DGFiP · api.cquest.org'));
      }
    }
  } catch(e) { /* suivant */ }

  // Source 3 : dvf.bienici.com
  try {
    const url = `https://dvf.bienici.com/ventes?lat=${lat}&lon=${lon}&radius=${dist}&nb_resultats=30`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (r.ok) {
      const data = await r.json();
      const items = data.ventes || data.hits || [];
      const valides = normalise(items);
      if (valides.length > 0) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.status(200).json(buildResult(valides, dist, 'DVF DGFiP · bienici.com'));
      }
    }
  } catch(e) { /* suivant */ }

  return res.status(200).json({ success: true, count: 0, stats: null, message: 'Données indisponibles · Source DVF temporairement hors ligne' });
}
