// ══ VERCEL FUNCTION : ÉCOLES ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const codeInsee = req.query.codeInsee || '';
  const dist = parseInt(req.query.dist || '1500');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    let ecoUrl;
    const fields = 'nom_etablissement,type_etablissement,statut_public_prive,adresse_1,code_postal,nom_commune,latitude,longitude,ecole_maternelle,ecole_elementaire';
    // Limite dynamique selon le rayon pour ne pas manquer d'établissements proches
    const limit = dist <= 1000 ? 100 : dist <= 2000 ? 200 : 400;

    if (codeInsee) {
      ecoUrl = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?where=code_commune%3D%22${codeInsee}%22&limit=${limit}&select=${fields}`;
    } else {
      const deg = dist / 111000;
      ecoUrl = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?where=latitude>${lat - deg} AND latitude<${lat + deg} AND longitude>${lon - deg} AND longitude<${lon + deg}&limit=${limit}&select=${fields}`;
    }

    const r = await fetch(ecoUrl, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) { const t = await r.text(); throw new Error(`API Éducation ${r.status}: ${t.substring(0, 100)}`); }

    const data = await r.json();
    const etablissements = data.results || [];

    const withDist = etablissements
      .filter(e => e.latitude && e.longitude)
      .map(e => {
        const dLat = (parseFloat(e.latitude) - lat) * 111000;
        const dLon = (parseFloat(e.longitude) - lon) * 111000 * Math.cos(lat * Math.PI / 180);
        return { ...e, distanceM: Math.round(Math.sqrt(dLat * dLat + dLon * dLon)) };
      })
      .filter(e => e.distanceM <= dist)
      .sort((a, b) => a.distanceM - b.distanceM);

    const matchTexte = (e, ...mots) => {
      const type = (e.type_etablissement||'').toLowerCase();
      const nom = (e.nom_etablissement||'').toLowerCase();
      return mots.some(m => type.includes(m) || nom.includes(m));
    };
    const isEcole = e => {
      const t = (e.type_etablissement||'').toLowerCase();
      return t.includes('ecole') || t.includes('école');
    };
    const isCollege = e => matchTexte(e, 'collège', 'college');
    const isLycee   = e => matchTexte(e, 'lycée', 'lycee');
    const types = {
      ecoles:   withDist.filter(isEcole).length,
      maternelle: withDist.filter(e => isEcole(e) && matchTexte(e, 'maternelle')).length,
      elementaire: withDist.filter(e => isEcole(e) && !matchTexte(e, 'maternelle')).length,
      college: withDist.filter(isCollege).length,
      lycee:   withDist.filter(isLycee).length,
    };

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({
      success: true, total: types.ecoles + types.college + types.lycee, types,
      etablissements: withDist.map(e => ({
        nom: e.nom_etablissement, type: e.type_etablissement, statut: e.statut_public_prive,
        adresse: e.adresse_1, commune: e.nom_commune, codePostal: e.code_postal,
        distanceM: e.distanceM, lat: parseFloat(e.latitude), lon: parseFloat(e.longitude)
      })),
      source: 'Annuaire Éducation Nationale · data.education.gouv.fr',
      dateExtraction: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
