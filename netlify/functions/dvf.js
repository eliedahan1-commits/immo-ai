// ══ NETLIFY FUNCTION : DVF ══
// Sources multiples avec fallback automatique
export default async (req) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  const dist = parseInt(url.searchParams.get('dist') || '500');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // Essayer plusieurs sources DVF
  const sources = [
    `https://api.cquest.org/dvf?lat=${lat}&lon=${lon}&dist=${dist}&nature_mutation=Vente`,
    `https://dvf.bienici.com/ventes?lat=${lat}&lon=${lon}&radius=${dist}&nb_resultats=30`,
  ];

  for (const srcUrl of sources) {
    try {
      const r = await fetch(srcUrl, {
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'IMMOAI/2.0 (immo-ai.netlify.app)'
        },
        signal: AbortSignal.timeout(7000)
      });
      
      if (!r.ok) continue;
      const data = await r.json();
      
      // Parser selon la source
      let items = data.resultats || data.hits || data.ventes || data.results || [];
      
      const prixM2 = items.map(t => {
        const p = t.properties || t;
        const surf = p.surface_reelle_bati || p.surface_carrez || p.surface_habitable || p.surface || 0;
        const prix = p.valeur_fonciere || p.prix || 0;
        return (surf > 9 && prix > 10000) ? Math.round(prix / surf) : null;
      }).filter(p => p && p > 500 && p < 50000).sort((a, b) => a - b);

      if (!prixM2.length) continue;

      const median = prixM2[Math.floor(prixM2.length / 2)];
      
      return new Response(JSON.stringify({
        success: true,
        count: prixM2.length,
        rayon: dist,
        stats: {
          medianM2: median,
          minM2: prixM2[0],
          maxM2: prixM2[prixM2.length - 1],
          nbTransactions: prixM2.length
        },
        recentes: items.slice(0, 8).map(t => {
          const p = t.properties || t;
          const surf = p.surface_reelle_bati || p.surface_carrez || p.surface_habitable || p.surface || 0;
          const prix = p.valeur_fonciere || p.prix || 0;
          return {
            date: p.date_mutation || p.date || '—',
            type: p.type_local || p.type || '—',
            surface: surf,
            prix: prix,
            prixM2: surf > 0 ? Math.round(prix / surf) : 0,
            adresse: `${p.adresse_numero || ''} ${p.adresse_nom_voie || p.adresse || p.rue || ''}`.trim()
          };
        }).filter(t => t.prixM2 > 0),
        source: 'DVF DGFiP',
        dateExtraction: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' }
      });
    } catch(e) { continue; }
  }

  return new Response(JSON.stringify({ success: true, count: 0, stats: null, message: 'Aucune donnée DVF disponible pour ce secteur' }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};

export const config = { path: '/api/dvf' };
