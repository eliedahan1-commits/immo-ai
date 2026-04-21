// ══ NETLIFY FUNCTION : GÉORISQUES ══
// Récupère les risques naturels officiels pour une adresse GPS
// Source : georisques.gouv.fr (API officielle BRGM/État)
// Appel : /.netlify/functions/risques?lat=48.85&lon=2.35

export default async (req) => {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // API Géorisques officielle
    const geoUrl = `https://georisques.gouv.fr/api/v1/gaspar/risques?latlon=${lon},${lat}&rayon=500`;
    const geoRes = await fetch(geoUrl, {
      signal: AbortSignal.timeout(8000)
    });

    if (!geoRes.ok) throw new Error(`Géorisques API error: ${geoRes.status}`);

    const geoData = await geoRes.json();
    const risques = geoData.data || [];

    // Catégorisation des risques
    const categories = {
      inondation: risques.filter(r => r.libelle_risque_jo?.toLowerCase().includes('inondation')),
      seisme: risques.filter(r => r.libelle_risque_jo?.toLowerCase().includes('séisme') || r.libelle_risque_jo?.toLowerCase().includes('seisme')),
      argile: risques.filter(r => r.libelle_risque_jo?.toLowerCase().includes('argile')),
      mouvement: risques.filter(r => r.libelle_risque_jo?.toLowerCase().includes('mouvement')),
      autres: risques.filter(r => {
        const lib = r.libelle_risque_jo?.toLowerCase() || '';
        return !lib.includes('inondation') && !lib.includes('séisme') && !lib.includes('seisme') && !lib.includes('argile') && !lib.includes('mouvement');
      })
    };

    // Score de risque global
    let scoreRisque = 'faible';
    if (risques.length >= 3) scoreRisque = 'élevé';
    else if (risques.length >= 1) scoreRisque = 'modéré';

    return new Response(JSON.stringify({
      success: true,
      total: risques.length,
      score: scoreRisque,
      categories: {
        inondation: categories.inondation.length > 0,
        seisme: categories.seisme.length > 0,
        argile: categories.argile.length > 0,
        mouvement: categories.mouvement.length > 0,
        nbAutres: categories.autres.length
      },
      detail: risques.map(r => ({
        libelle: r.libelle_risque_jo,
        code: r.code_risque
      })),
      source: 'Géorisques - BRGM / État',
      dateExtraction: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=604800' // Cache 7 jours
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

export const config = { path: '/api/risques' };
