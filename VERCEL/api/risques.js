// ══ VERCEL FUNCTION : GÉORISQUES ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { lat, lon } = req.query;

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    const geoUrl = `https://georisques.gouv.fr/api/v1/gaspar/risques?latlon=${lon},${lat}&rayon=500`;
    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) });
    if (!geoRes.ok) throw new Error(`Géorisques API error: ${geoRes.status}`);

    const geoData = await geoRes.json();
    const communeData = geoData.data?.[0] || {};
    const risques = communeData.risques_detail || [];

    const categories = {
      inondation: risques.filter(r => r.libelle_risque_long?.toLowerCase().includes('inondation')),
      seisme: risques.filter(r => r.libelle_risque_long?.toLowerCase().includes('séisme') || r.libelle_risque_long?.toLowerCase().includes('seisme')),
      argile: risques.filter(r => r.libelle_risque_long?.toLowerCase().includes('argile')),
      mouvement: risques.filter(r => r.libelle_risque_long?.toLowerCase().includes('mouvement')),
      autres: risques.filter(r => {
        const lib = r.libelle_risque_long?.toLowerCase() || '';
        return !lib.includes('inondation') && !lib.includes('séisme') && !lib.includes('seisme') && !lib.includes('argile') && !lib.includes('mouvement');
      })
    };

    let scoreRisque = 'faible';
    if (risques.length >= 3) scoreRisque = 'élevé';
    else if (risques.length >= 1) scoreRisque = 'modéré';

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
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
      detail: risques.map(r => ({ libelle: r.libelle_risque_long, code: r.num_risque })),
      source: 'Géorisques - BRGM / État',
      dateExtraction: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
