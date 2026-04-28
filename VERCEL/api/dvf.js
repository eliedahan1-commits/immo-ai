// ══ VERCEL FUNCTION : DVF ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const dist = parseInt(req.query.dist || '2000');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  const sources = [
    `https://api.cquest.org/dvf?lat=${lat}&lon=${lon}&dist=${dist}&nature_mutation=Vente`,
    `https://dvf.bienici.com/ventes?lat=${lat}&lon=${lon}&radius=${dist}&nb_resultats=30`,
  ];

  for (const srcUrl of sources) {
    try {
      const r = await fetch(srcUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'IMMOAI/2.0 (immo-ai.vercel.app)' },
        signal: AbortSignal.timeout(7000)
      });
      if (!r.ok) continue;
      const data = await r.json();

      let items = data.resultats || data.hits || data.ventes || data.results || [];
      const prixM2 = items.map(t => {
        const p = t.properties || t;
        const surf = p.surface_reelle_bati || p.surface_carrez || p.surface_habitable || p.surface || 0;
        const prix = p.valeur_fonciere || p.prix || 0;
        return (surf > 9 && prix > 10000) ? Math.round(prix / surf) : null;
      }).filter(p => p && p > 500 && p < 50000).sort((a, b) => a - b);

      if (!prixM2.length) continue;
      const median = prixM2[Math.floor(prixM2.length / 2)];

      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).json({
        success: true, count: prixM2.length, rayon: dist,
        stats: { medianM2: median, minM2: prixM2[0], maxM2: prixM2[prixM2.length - 1], nbTransactions: prixM2.length },
        recentes: items.slice(0, 8).map(t => {
          const p = t.properties || t;
          const surf = p.surface_reelle_bati || p.surface_carrez || p.surface_habitable || p.surface || 0;
          const prix = p.valeur_fonciere || p.prix || 0;
          return { date: p.date_mutation || p.date || '—', type: p.type_local || p.type || '—', surface: surf, prix, prixM2: surf > 0 ? Math.round(prix / surf) : 0, adresse: `${p.adresse_numero || ''} ${p.adresse_nom_voie || p.adresse || p.rue || ''}`.trim() };
        }).filter(t => t.prixM2 > 0),
        source: 'DVF DGFiP', dateExtraction: new Date().toISOString()
      });
    } catch(e) { continue; }
  }

  return res.status(200).json({ success: true, count: 0, stats: null, message: 'Données indisponibles · Source DVF temporairement hors ligne' });
}
