// ══ NETLIFY FUNCTION : DVF ══
// Récupère les vraies transactions DVF autour d'une adresse GPS
// Source : api.cquest.org (données DGFiP officielles)
// Appel : /.netlify/functions/dvf?lat=48.85&lon=2.35&dist=500&type=Appartement

export default async (req) => {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const dist = url.searchParams.get('dist') || '500';
  const type = url.searchParams.get('type') || ''; // Appartement ou Maison

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // Appel API DVF officielle
    let dvfUrl = `https://api.cquest.org/dvf?lat=${lat}&lon=${lon}&dist=${dist}&nature_mutation=Vente`;
    if (type) dvfUrl += `&type_local=${encodeURIComponent(type)}`;

    const dvfRes = await fetch(dvfUrl, {
      headers: { 'User-Agent': 'IMMO-AI/2.0 (contact: immoai@example.com)' },
      signal: AbortSignal.timeout(8000)
    });

    if (!dvfRes.ok) throw new Error(`DVF API error: ${dvfRes.status}`);

    const dvfData = await dvfRes.json();
    const transactions = dvfData.resultats || dvfData.features || [];

    if (!transactions.length) {
      return new Response(JSON.stringify({
        success: true,
        count: 0,
        message: 'Aucune transaction dans ce rayon',
        stats: null
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Calcul des statistiques
    const maintenant = new Date();
    const cinqAns = new Date(maintenant.getFullYear() - 5, maintenant.getMonth(), maintenant.getDate());

    // Filtrer les 5 dernières années et avec surface valide
    const filtered = transactions.filter(t => {
      const props = t.properties || t;
      const surface = parseFloat(props.surface_reelle_bati || props.surface_carrez || 0);
      const prix = parseFloat(props.valeur_fonciere || 0);
      const date = new Date(props.date_mutation || '2000-01-01');
      return surface > 9 && prix > 10000 && date >= cinqAns;
    });

    if (!filtered.length) {
      return new Response(JSON.stringify({
        success: true,
        count: 0,
        message: 'Aucune transaction récente avec données suffisantes',
        stats: null
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Calcul prix au m²
    const prixM2 = filtered
      .map(t => {
        const props = t.properties || t;
        const surface = parseFloat(props.surface_reelle_bati || props.surface_carrez || 0);
        const prix = parseFloat(props.valeur_fonciere || 0);
        return surface > 0 ? prix / surface : null;
      })
      .filter(p => p && p > 500 && p < 50000) // Filtrer valeurs aberrantes
      .sort((a, b) => a - b);

    const median = prixM2[Math.floor(prixM2.length / 2)];
    const moyenne = prixM2.reduce((a, b) => a + b, 0) / prixM2.length;
    const min = prixM2[0];
    const max = prixM2[prixM2.length - 1];

    // 10 dernières transactions
    const recentes = filtered
      .sort((a, b) => {
        const da = new Date((a.properties || a).date_mutation || 0);
        const db = new Date((b.properties || b).date_mutation || 0);
        return db - da;
      })
      .slice(0, 10)
      .map(t => {
        const p = t.properties || t;
        return {
          date: p.date_mutation,
          type: p.type_local,
          surface: parseFloat(p.surface_reelle_bati || p.surface_carrez || 0),
          prix: parseFloat(p.valeur_fonciere || 0),
          prixM2: Math.round(parseFloat(p.valeur_fonciere || 0) / parseFloat(p.surface_reelle_bati || p.surface_carrez || 1)),
          adresse: `${p.adresse_numero || ''} ${p.adresse_nom_voie || ''}`.trim(),
          commune: p.nom_commune,
          pieces: p.nombre_pieces_principales
        };
      });

    return new Response(JSON.stringify({
      success: true,
      count: filtered.length,
      rayon: parseInt(dist),
      stats: {
        medianM2: Math.round(median),
        moyenneM2: Math.round(moyenne),
        minM2: Math.round(min),
        maxM2: Math.round(max),
        nbTransactions: filtered.length
      },
      recentes,
      source: 'DVF DGFiP via api.cquest.org',
      dateExtraction: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400' // Cache 24h
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      fallback: true
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

export const config = { path: '/api/dvf' };
