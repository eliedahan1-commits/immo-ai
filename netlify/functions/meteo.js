// ══ NETLIFY FUNCTION : MÉTÉO & ENSOLEILLEMENT ══
// Source : open-meteo.com (gratuit, sans clé API, données ERA5/CERRA)
// Appel : /api/meteo?lat=48.85&lon=2.35

export default async (req) => {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // open-meteo : données climatiques historiques (moyenne 10 ans)
    // sunshine_duration = durée d'ensoleillement en secondes
    const meteoUrl = `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_date=2013-01-01&end_date=2022-12-31&models=CMCC_CM2_VHR4&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration&timezone=Europe%2FParis`;

    const meteoRes = await fetch(meteoUrl, { signal: AbortSignal.timeout(12000) });
    if (!meteoRes.ok) throw new Error(`open-meteo error: ${meteoRes.status}`);

    const meteoData = await meteoRes.json();
    const daily = meteoData.daily;

    if (!daily?.sunshine_duration?.length) throw new Error('Pas de données sunshine');

    // Calcul ensoleillement annuel moyen (en heures)
    const sunshineSeconds = daily.sunshine_duration;
    // Grouper par année et sommer
    const dates = daily.time;
    const yearlyHours = {};
    sunshineSeconds.forEach((sec, i) => {
      const year = dates[i]?.substring(0, 4);
      if (year && sec !== null) {
        yearlyHours[year] = (yearlyHours[year] || 0) + (sec / 3600);
      }
    });
    const years = Object.values(yearlyHours);
    const avgHours = years.length > 0 ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : null;

    // Températures moyennes
    const tempMax = daily.temperature_2m_max.filter(t => t !== null);
    const tempMin = daily.temperature_2m_min.filter(t => t !== null);
    const avgTempMax = tempMax.length ? Math.round(tempMax.reduce((a, b) => a + b, 0) / tempMax.length * 10) / 10 : null;
    const avgTempMin = tempMin.length ? Math.round(tempMin.reduce((a, b) => a + b, 0) / tempMin.length * 10) / 10 : null;

    // Précipitations annuelles moyennes
    const precip = daily.precipitation_sum.filter(p => p !== null);
    const dailyPrecip = precip.reduce((a, b) => a + b, 0) / (years.length || 1);
    const annualPrecip = Math.round(dailyPrecip);

    // Classification ensoleillement
    let ensoleillementLabel = 'Moyen';
    if (avgHours > 2200) ensoleillementLabel = 'Très ensoleillé';
    else if (avgHours > 1800) ensoleillementLabel = 'Ensoleillé';
    else if (avgHours > 1400) ensoleillementLabel = 'Moyen';
    else ensoleillementLabel = 'Peu ensoleillé';

    return new Response(JSON.stringify({
      success: true,
      ensoleillement: {
        heuresAnnuelles: avgHours,
        label: ensoleillementLabel
      },
      temperatures: {
        maxMoyenne: avgTempMax,
        minMoyenne: avgTempMin
      },
      precipitations: {
        annuellesMm: annualPrecip
      },
      periode: '2013-2022 (moyenne 10 ans)',
      source: 'open-meteo.com · Données climatiques ERA5/CERRA',
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

export const config = { path: '/api/meteo' };
