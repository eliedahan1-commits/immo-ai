// ══ VERCEL FUNCTION : ALTITUDE IGN ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { lat, lon } = req.query;

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    const ignUrl = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=true`;
    const ignRes = await fetch(ignUrl, { signal: AbortSignal.timeout(6000) });
    if (!ignRes.ok) throw new Error(`IGN API error: ${ignRes.status}`);

    const ignData = await ignRes.json();
    const altitude = ignData?.elevations?.[0] ?? null;
    if (altitude === null || altitude === -99999) throw new Error('Altitude non disponible');

    const altRounded = Math.round(altitude);
    let label = '';
    if (altRounded < 50) label = 'Terrain plat (basse altitude)';
    else if (altRounded < 200) label = 'Plaine';
    else if (altRounded < 600) label = 'Plateau / collines';
    else if (altRounded < 1500) label = 'Montagne basse';
    else label = 'Haute montagne';

    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.status(200).json({ success: true, altitude: altRounded, unite: 'mètres NGF', label, source: 'IGN RGE Alti · data.geopf.fr', precision: '1m', dateExtraction: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
