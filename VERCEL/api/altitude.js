// ══ VERCEL FUNCTION : ALTITUDE IGN ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { lat, lon } = req.query;

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  function makeResponse(alt, source) {
    const altRounded = Math.round(alt);
    let label = '';
    if (altRounded < 50) label = 'Terrain plat (basse altitude)';
    else if (altRounded < 200) label = 'Plaine';
    else if (altRounded < 600) label = 'Plateau / collines';
    else if (altRounded < 1500) label = 'Montagne basse';
    else label = 'Haute montagne';
    return { success: true, altitude: altRounded, unite: 'mètres NGF', label, source, precision: '1m', dateExtraction: new Date().toISOString() };
  }

  // Source 1 : IGN (officielle France, précision 1m)
  try {
    const ignUrl = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=true`;
    const ignRes = await fetch(ignUrl, { signal: AbortSignal.timeout(6000) });
    if (ignRes.ok) {
      const ignData = await ignRes.json();
      const altitude = ignData?.elevations?.[0] ?? null;
      if (altitude !== null && altitude !== -99999) {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
        return res.status(200).json(makeResponse(altitude, 'IGN RGE Alti · data.geopf.fr'));
      }
    }
  } catch(e) { /* suivant */ }

  // Source 2 : Open Topo Data (backup mondial)
  try {
    const otoUrl = `https://api.opentopodata.org/v1/srtm90m?locations=${lat},${lon}`;
    const otoRes = await fetch(otoUrl, { signal: AbortSignal.timeout(6000) });
    if (otoRes.ok) {
      const otoData = await otoRes.json();
      const altitude = otoData?.results?.[0]?.elevation ?? null;
      if (altitude !== null) {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
        return res.status(200).json(makeResponse(altitude, 'SRTM · opentopodata.org'));
      }
    }
  } catch(e) { /* suivant */ }

  return res.status(500).json({ success: false, error: 'Altitude non disponible' });
}
