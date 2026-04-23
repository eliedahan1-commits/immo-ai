// ══ NETLIFY FUNCTION : INSEE ══
// Source : geo.api.gouv.fr (population, superficie, revenus)
export default async (req) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  const codeInsee = url.searchParams.get('codeInsee') || '';

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // Trouver la commune via coordonnées GPS
    const geoUrl = codeInsee
      ? `https://geo.api.gouv.fr/communes/${codeInsee}?fields=nom,population,superficie,codesPostaux,codeDepartement`
      : `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=nom,population,superficie,codesPostaux,codeDepartement&format=json&limit=1`;

    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(6000) });
    if (!geoRes.ok) throw new Error(`geo.api ${geoRes.status}`);

    const geoData = await geoRes.json();
    const commune = Array.isArray(geoData) ? geoData[0] : geoData;
    if (!commune) throw new Error('Commune introuvable');

    const population = commune.population || 0;
    const superficie = commune.superficie || 1; // geo.api retourne en km²
    // Densité = habitants / km²
    const densite = superficie > 0 ? Math.round(population / superficie) : null;

    // Revenus médians via API données locales INSEE (Filosofi)
    // Code commune = commune.code ou codeInsee
    const communeCode = codeInsee || commune.code || '';
    let revenuMedian = null;
    let revenuMensuel = null;

    if (communeCode) {
      try {
        // API Filosofi revenus par commune
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

    return new Response(JSON.stringify({
      success: true,
      commune: {
        nom: commune.nom,
        codeInsee: communeCode,
        population,
        superficie,
        densite,
        codesPostaux: commune.codesPostaux,
        departement: commune.codeDepartement
      },
      revenus: {
        medianAnnuel: revenuMedian,
        medianMensuel: revenuMensuel,
        annee: 2021
      },
      source: 'INSEE Filosofi + geo.api.gouv.fr',
      dateExtraction: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=2592000' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
export const config = { path: '/api/insee' };
