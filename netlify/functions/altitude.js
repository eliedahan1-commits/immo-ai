// ══ NETLIFY FUNCTION : ALTITUDE IGN ══
// Source : data.geopf.fr (Géoportail IGN) — RGE Alti
// Appel : /api/altitude?lat=48.85&lon=2.35

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
    // API IGN Géoportail — élévation RGE Alti (précision 1m)
    const ignUrl = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=true`;

    const ignRes = await fetch(ignUrl, { signal: AbortSignal.timeout(6000) });

    if (!ignRes.ok) throw new Error(`IGN API error: ${ignRes.status}`);

    const ignData = await ignRes.json();
    const altitude = ignData?.elevations?.[0] ?? null;

    if (altitude === null || altitude === -99999) {
      throw new Error('Altitude non disponible pour ce point');
    }

    const altRounded = Math.round(altitude);

    // Classification
    let label = '';
    if (altRounded < 50) label = 'Terrain plat (basse altitude)';
    else if (altRounded < 200) label = 'Plaine';
    else if (altRounded < 600) label = 'Plateau / collines';
    else if (altRounded < 1500) label = 'Montagne basse';
    else label = 'Haute montagne';

    return new Response(JSON.stringify({
      success: true,
      altitude: altRounded,
      unite: 'mètres NGF',
      label,
      source: 'IGN RGE Alti · data.geopf.fr',
      precision: '1m',
      dateExtraction: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=2592000'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

export const config = { path: '/api/altitude' };
