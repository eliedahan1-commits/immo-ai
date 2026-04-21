// ══ NETLIFY FUNCTION : INSEE ══
// Source : geo.api.gouv.fr + API données locales INSEE
// Appel : /api/insee?codeInsee=92012

export default async (req) => {
  const url = new URL(req.url);
  const codeInsee = url.searchParams.get('codeInsee');
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  if (!codeInsee && (!lat || !lon)) {
    return new Response(JSON.stringify({ error: 'codeInsee ou lat+lon requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    let insee = codeInsee;

    // Si pas de code INSEE, le trouver via geo.api.gouv.fr
    if (!insee && lat && lon) {
      const geoRes = await fetch(
        `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=code,nom,population,codesPostaux&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData?.[0]) {
          insee = geoData[0].code;
        }
      }
    }

    if (!insee) throw new Error('Code INSEE introuvable');

    // Données communes via geo.api.gouv.fr
    const communeRes = await fetch(
      `https://geo.api.gouv.fr/communes/${insee}?fields=nom,population,superficie,codesPostaux,codeDepartement,codeRegion`,
      { signal: AbortSignal.timeout(5000) }
    );

    const commune = communeRes.ok ? await communeRes.json() : {};

    // Données statistiques via API INSEE données locales
    // Cube : population, logements, revenus médians
    const statsUrl = `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-REVMEDIAN@GEO2021COM2021/COM-${insee}.all`;
    let revenuMedian = null;
    try {
      const statsRes = await fetch(statsUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        // Parser la réponse SDMX-JSON
        const obs = statsData?.dataSets?.[0]?.series?.['0:0:0']?.observations;
        if (obs) {
          const vals = Object.values(obs);
          revenuMedian = vals?.[0]?.[0] ? Math.round(vals[0][0]) : null;
        }
      }
    } catch { /* revenu non disponible */ }

    // Densité
    const superficie = commune.superficie || 1;
    const population = commune.population || 0;
    const densite = superficie > 0 ? Math.round(population / (superficie / 100)) : null;

    return new Response(JSON.stringify({
      success: true,
      commune: {
        nom: commune.nom,
        codeInsee: insee,
        population,
        superficie: commune.superficie,
        densite,
        codesPostaux: commune.codesPostaux,
        departement: commune.codeDepartement,
        region: commune.codeRegion
      },
      revenus: {
        medianAnnuel: revenuMedian,
        medianMensuel: revenuMedian ? Math.round(revenuMedian / 12) : null,
        annee: 2021
      },
      source: 'INSEE Filosofi + geo.api.gouv.fr',
      dateExtraction: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=2592000' // Cache 30 jours
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

export const config = { path: '/api/insee' };
