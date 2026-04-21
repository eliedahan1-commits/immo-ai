// ══ NETLIFY FUNCTION : ÉCOLES ══
// Récupère les établissements scolaires autour d'une adresse
// Source : data.education.gouv.fr (API officielle Ministère Éducation)
// Appel : /.netlify/functions/ecoles?lat=48.85&lon=2.35&dist=1000

export default async (req) => {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const dist = parseInt(url.searchParams.get('dist') || '1000'); // rayon en mètres

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // Conversion rayon mètres → degrés approximatif
    const rayonDeg = dist / 111000;
    const latMin = parseFloat(lat) - rayonDeg;
    const latMax = parseFloat(lat) + rayonDeg;
    const lonMin = parseFloat(lon) - rayonDeg;
    const lonMax = parseFloat(lon) + rayonDeg;

    // API Établissements Éducation nationale
    const ecoUrl = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?where=position%20within%20distance(${lat}%2C${lon}%2C${dist}m)&limit=20&select=nom_etablissement%2Ctype_etablissement%2Cstatut_public_prive%2Cadresse1%2Ccode_postal%2Cnom_commune%2Clatitude%2Clongitude%2Ccodepostalville`;

    const ecoRes = await fetch(ecoUrl, {
      signal: AbortSignal.timeout(8000)
    });

    if (!ecoRes.ok) throw new Error(`Éducation API error: ${ecoRes.status}`);

    const ecoData = await ecoRes.json();
    const etablissements = ecoData.results || [];

    // Grouper par type
    const types = {
      maternelle: etablissements.filter(e => e.type_etablissement?.toLowerCase().includes('maternelle') || e.nom_etablissement?.toLowerCase().includes('maternelle')),
      elementaire: etablissements.filter(e => e.type_etablissement?.toLowerCase().includes('élémentaire') || e.type_etablissement?.toLowerCase().includes('elementaire') || e.nom_etablissement?.toLowerCase().includes('école')),
      college: etablissements.filter(e => e.type_etablissement?.toLowerCase().includes('collège') || e.type_etablissement?.toLowerCase().includes('college')),
      lycee: etablissements.filter(e => e.type_etablissement?.toLowerCase().includes('lycée') || e.type_etablissement?.toLowerCase().includes('lycee')),
    };

    // Calcul distance approximative depuis l'adresse
    const withDistance = etablissements.map(e => {
      if (!e.latitude || !e.longitude) return { ...e, distanceM: null };
      const dLat = (parseFloat(e.latitude) - parseFloat(lat)) * 111000;
      const dLon = (parseFloat(e.longitude) - parseFloat(lon)) * 111000 * Math.cos(parseFloat(lat) * Math.PI / 180);
      const distance = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));
      return { ...e, distanceM: distance };
    }).sort((a, b) => (a.distanceM || 9999) - (b.distanceM || 9999));

    return new Response(JSON.stringify({
      success: true,
      total: etablissements.length,
      types: {
        maternelle: types.maternelle.length,
        elementaire: types.elementaire.length,
        college: types.college.length,
        lycee: types.lycee.length
      },
      etablissements: withDistance.slice(0, 10).map(e => ({
        nom: e.nom_etablissement,
        type: e.type_etablissement,
        statut: e.statut_public_prive,
        adresse: e.adresse1,
        commune: e.nom_commune,
        codePostal: e.code_postal,
        distanceM: e.distanceM
      })),
      source: 'Annuaire Éducation Nationale - data.education.gouv.fr',
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

export const config = { path: '/api/ecoles' };
