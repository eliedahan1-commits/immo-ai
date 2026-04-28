// ══ VERCEL FUNCTION : INSEE ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const codeInsee = req.query.codeInsee || '';

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    const geoUrl = codeInsee
      ? `https://geo.api.gouv.fr/communes/${codeInsee}?fields=nom,population,surface,codesPostaux,codeDepartement`
      : `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=nom,population,surface,codesPostaux,codeDepartement&format=json&limit=1`;

    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(6000) });
    if (!geoRes.ok) throw new Error(`geo.api ${geoRes.status}`);

    const geoData = await geoRes.json();
    const commune = Array.isArray(geoData) ? geoData[0] : geoData;
    if (!commune) throw new Error('Commune introuvable');

    const population = commune.population || 0;
    const surfaceHa = commune.surface || 0; // geo.api retourne en hectares
    const superficieKm2 = surfaceHa > 0 ? surfaceHa / 100 : 1; // ha → km²
    const densite = superficieKm2 > 0 ? Math.round(population / superficieKm2) : null;

    const communeCode = codeInsee || commune.code || '';
    let revenuMedian = null;
    let revenuMensuel = null;

    if (communeCode) {
      try {
        const filosUrl = `https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets/revenus-filosofi-des-menages-par-commune@public/records?where=code_commune_de_la_commune%3D%22${communeCode}%22&limit=1&select=median_level_of_standard_of_living_euros`;
        const filosRes = await fetch(filosUrl, { signal: AbortSignal.timeout(5000) });
        if (filosRes.ok) {
          const filosData = await filosRes.json();
          const val = filosData.results?.[0]?.median_level_of_standard_of_living_euros;
          if (val) {
            revenuMedian = Math.round(parseFloat(val));
            revenuMensuel = Math.round(revenuMedian / 12);
          }
        }
      } catch { /* revenus non disponibles */ }
    }

    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.status(200).json({
      success: true,
      commune: {
        nom: commune.nom,
        codeInsee: communeCode,
        population,
        superficie: superficieKm2,
        densite,
        codesPostaux: commune.codesPostaux,
        departement: commune.codeDepartement
      },
      revenus: { medianAnnuel: revenuMedian, medianMensuel: revenuMensuel, annee: 2021 },
      source: 'INSEE Filosofi + geo.api.gouv.fr',
      dateExtraction: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
