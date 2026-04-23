// ══ NETLIFY FUNCTION : MÉTÉO ══
// Source : open-meteo.com (gratuit, sans clé)
// Utilise l'API forecast + historical pour avoir les données annuelles
export default async (req) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // API historical weather open-meteo — données 2020-2024 (plus rapide que climate API)
    const meteoUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2020-01-01&end_date=2024-12-31&daily=sunshine_duration,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FParis`;

    const r = await fetch(meteoUrl, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`open-meteo ${r.status}`);

    const data = await r.json();
    const daily = data.daily;
    if (!daily) throw new Error('Pas de données daily');

    const dates = daily.time || [];
    const sunshineSeconds = daily.sunshine_duration || [];
    const tempMax = daily.temperature_2m_max || [];
    const tempMin = daily.temperature_2m_min || [];
    const precip = daily.precipitation_sum || [];

    // Ensoleillement par année
    const yearlyHours = {};
    sunshineSeconds.forEach((sec, i) => {
      const year = dates[i]?.substring(0, 4);
      if (year && sec !== null && sec !== undefined) {
        yearlyHours[year] = (yearlyHours[year] || 0) + (sec / 3600);
      }
    });
    const yearVals = Object.values(yearlyHours).filter(h => h > 0);
    const avgHours = yearVals.length ? Math.round(yearVals.reduce((a, b) => a + b, 0) / yearVals.length) : null;

    // Températures moyennes
    const validMax = tempMax.filter(t => t !== null);
    const validMin = tempMin.filter(t => t !== null);
    const avgMax = validMax.length ? Math.round(validMax.reduce((a, b) => a + b, 0) / validMax.length * 10) / 10 : null;
    const avgMin = validMin.length ? Math.round(validMin.reduce((a, b) => a + b, 0) / validMin.length * 10) / 10 : null;

    // Précipitations annuelles
    const validPrecip = precip.filter(p => p !== null && p >= 0);
    const totalPrecip = validPrecip.reduce((a, b) => a + b, 0);
    const annualPrecip = yearVals.length ? Math.round(totalPrecip / yearVals.length) : null;

    let label = 'Données indisponibles';
    if (avgHours !== null) {
      if (avgHours > 2200) label = 'Très ensoleillé';
      else if (avgHours > 1800) label = 'Ensoleillé';
      else if (avgHours > 1400) label = 'Moyennement ensoleillé';
      else label = 'Peu ensoleillé';
    }

    return new Response(JSON.stringify({
      success: true,
      ensoleillement: { heuresAnnuelles: avgHours, label },
      temperatures: { maxMoyenne: avgMax, minMoyenne: avgMin },
      precipitations: { annuellesMm: annualPrecip },
      periode: '2020-2024 (moyenne 5 ans)',
      source: 'open-meteo.com · Archive météo ERA5',
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
export const config = { path: '/api/meteo' };
