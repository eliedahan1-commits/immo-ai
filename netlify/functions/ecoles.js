// ══ NETLIFY FUNCTION : ÉCOLES ══
// Source : data.education.gouv.fr API Explore v2
export default async (req) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  const dist = parseInt(url.searchParams.get('dist') || '1000');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // API Éducation nationale - endpoint correct
    const ecoUrl = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?where=distance(position%2C+geom'POINT(${lon}+${lat})'%2C+${dist}m)&limit=20&select=nom_etablissement%2Ctype_etablissement%2Cstatut_public_prive%2Cadresse1%2Ccode_postal%2Cnom_commune%2Clatitude%2Clongitude`;

    const r = await fetch(ecoUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (!r.ok) throw new Error(`API Éducation ${r.status}`);

    const data = await r.json();
    const etablissements = data.results || [];

    const withDist = etablissements.map(e => {
      if (!e.latitude || !e.longitude) return { ...e, distanceM: dist };
      const dLat = (parseFloat(e.latitude) - lat) * 111000;
      const dLon = (parseFloat(e.longitude) - lon) * 111000 * Math.cos(lat * Math.PI / 180);
      return { ...e, distanceM: Math.round(Math.sqrt(dLat * dLat + dLon * dLon)) };
    }).sort((a, b) => a.distanceM - b.distanceM);

    const types = {
      maternelle: etablissements.filter(e => (e.type_etablissement || '').toLowerCase().includes('maternelle')).length,
      elementaire: etablissements.filter(e => (e.type_etablissement || '').toLowerCase().includes('élémentaire') || (e.nom_etablissement || '').toLowerCase().includes('école')).length,
      college: etablissements.filter(e => (e.type_etablissement || '').toLowerCase().includes('collège')).length,
      lycee: etablissements.filter(e => (e.type_etablissement || '').toLowerCase().includes('lycée')).length,
    };

    return new Response(JSON.stringify({
      success: true,
      total: etablissements.length,
      types,
      etablissements: withDist.slice(0, 10).map(e => ({
        nom: e.nom_etablissement,
        type: e.type_etablissement,
        statut: e.statut_public_prive,
        adresse: e.adresse1,
        commune: e.nom_commune,
        codePostal: e.code_postal,
        distanceM: e.distanceM,
        lat: e.latitude,
        lon: e.longitude
      })),
      source: 'Annuaire Éducation Nationale',
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
