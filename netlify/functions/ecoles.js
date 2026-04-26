// ══ NETLIFY FUNCTION : ÉCOLES ══
// Source : data.education.gouv.fr
// Stratégie : filtrer par code commune INSEE (plus fiable que within_distance)
export default async (req) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  const codeInsee = url.searchParams.get('codeInsee') || '';
  const dist = parseInt(url.searchParams.get('dist') || '1500');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    let ecoUrl;

    // Méthode 1 : par code commune INSEE si disponible (plus fiable)
    if (codeInsee) {
      ecoUrl = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?where=code_commune%3D%22${codeInsee}%22&limit=30&select=nom_etablissement,type_etablissement,statut_public_prive,adresse_1,code_postal,nom_commune,latitude,longitude`;
    } else {
      // Méthode 2 : bounding box autour des coordonnées
      const deg = dist / 111000;
      const latMin = lat - deg, latMax = lat + deg;
      const lonMin = lon - deg, lonMax = lon + deg;
      ecoUrl = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?where=latitude>${latMin} AND latitude<${latMax} AND longitude>${lonMin} AND longitude<${lonMax}&limit=30&select=nom_etablissement,type_etablissement,statut_public_prive,adresse_1,code_postal,nom_commune,latitude,longitude`;
    }

    const r = await fetch(ecoUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`API Éducation ${r.status}: ${errText.substring(0, 100)}`);
    }

    const data = await r.json();
    const etablissements = data.results || [];

    // Calculer distance réelle depuis l'adresse
    const withDist = etablissements
      .filter(e => e.latitude && e.longitude)
      .map(e => {
        const dLat = (parseFloat(e.latitude) - lat) * 111000;
        const dLon = (parseFloat(e.longitude) - lon) * 111000 * Math.cos(lat * Math.PI / 180);
        return { ...e, distanceM: Math.round(Math.sqrt(dLat * dLat + dLon * dLon)) };
      })
      .filter(e => e.distanceM <= dist * 1.5) // garder dans rayon élargi
      .sort((a, b) => a.distanceM - b.distanceM);

    const types = {
      maternelle: withDist.filter(e => (e.type_etablissement||'').toLowerCase().includes('maternelle')).length,
      elementaire: withDist.filter(e => (e.type_etablissement||'').toLowerCase().includes('lémentaire') || (e.type_etablissement||'').toLowerCase().includes('primaire')).length,
      college: withDist.filter(e => (e.type_etablissement||'').toLowerCase().includes('coll')).length,
      lycee: withDist.filter(e => (e.type_etablissement||'').toLowerCase().includes('lyc')).length,
    };

    return new Response(JSON.stringify({
      success: true,
      total: withDist.length,
      types,
      etablissements: withDist.slice(0, 12).map(e => ({
        nom: e.nom_etablissement,
        type: e.type_etablissement,
        statut: e.statut_public_prive,
        adresse: e.adresse_1,
        commune: e.nom_commune,
        codePostal: e.code_postal,
        distanceM: e.distanceM,
        lat: parseFloat(e.latitude),
        lon: parseFloat(e.longitude)
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
