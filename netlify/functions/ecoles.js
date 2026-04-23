// ══ NETLIFY FUNCTION : ÉCOLES ══
// Source : data.education.gouv.fr
// Syntaxe correcte : within_distance(position, geom'POINT(lon lat)', Xkm)
export default async (req) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  const distM = parseInt(url.searchParams.get('dist') || '1000');
  const distKm = (distM / 1000).toFixed(1) + 'km';

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // Format correct : lon AVANT lat dans POINT, distance en km
    const where = `within_distance(position,geom'POINT(${lon} ${lat})',${distKm})`;
    const ecoUrl = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?where=${encodeURIComponent(where)}&limit=25&select=nom_etablissement,type_etablissement,statut_public_prive,adresse1,code_postal,nom_commune,latitude,longitude`;

    const r = await fetch(ecoUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });

    if (!r.ok) throw new Error(`API Éducation ${r.status}: ${await r.text()}`);

    const data = await r.json();
    const etablissements = data.results || [];

    // Calculer distance depuis l'adresse
    const withDist = etablissements.map(e => {
      if (!e.latitude || !e.longitude) return { ...e, distanceM: distM };
      const dLat = (parseFloat(e.latitude) - lat) * 111000;
      const dLon = (parseFloat(e.longitude) - lon) * 111000 * Math.cos(lat * Math.PI / 180);
      return { ...e, distanceM: Math.round(Math.sqrt(dLat * dLat + dLon * dLon)) };
    }).sort((a, b) => a.distanceM - b.distanceM);

    const types = {
      maternelle: etablissements.filter(e => (e.type_etablissement||'').toLowerCase().includes('maternelle')).length,
      elementaire: etablissements.filter(e => (e.type_etablissement||'').toLowerCase().includes('élémentaire') || (e.type_etablissement||'').toLowerCase().includes('elementaire')).length,
      college: etablissements.filter(e => (e.type_etablissement||'').toLowerCase().includes('collège') || (e.type_etablissement||'').toLowerCase().includes('college')).length,
      lycee: etablissements.filter(e => (e.type_etablissement||'').toLowerCase().includes('lycée') || (e.type_etablissement||'').toLowerCase().includes('lycee')).length,
    };

    return new Response(JSON.stringify({
      success: true,
      total: etablissements.length,
      types,
      etablissements: withDist.slice(0, 12).map(e => ({
        nom: e.nom_etablissement,
        type: e.type_etablissement,
        statut: e.statut_public_prive,
        adresse: e.adresse1,
        commune: e.nom_commune,
        codePostal: e.code_postal,
        distanceM: e.distanceM,
        lat: parseFloat(e.latitude) || null,
        lon: parseFloat(e.longitude) || null
      })),
      source: 'Annuaire Éducation Nationale · data.education.gouv.fr',
      dateExtraction: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=604800' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
export const config = { path: '/api/ecoles' };
