// ══ VERCEL FUNCTION : ALTITUDE IGN + TAUX IMMOBILIERS ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── Branche TAUX : /api/altitude?type=taux ──────────────────────────────
  if (req.query.type === 'taux') {
    // Taux de fallback (derniers taux connus)
    const FALLBACK = { 10: 3.10, 15: 3.27, 20: 3.42, 25: 3.50 };

    // Utilitaire : combler les durées manquantes par interpolation
    function fillGaps(found) {
      if (!found[10]) found[10] = parseFloat(((found[15] || 3.27) - 0.17).toFixed(2));
      if (!found[15]) found[15] = found[20] ? parseFloat((found[20] - 0.15).toFixed(2)) : 3.27;
      if (!found[20]) found[20] = found[25] ? parseFloat((found[25] - 0.08).toFixed(2)) : 3.42;
      if (!found[25]) found[25] = found[20] ? parseFloat((found[20] + 0.08).toFixed(2)) : 3.50;
      return found;
    }

    // ── Source 1 : Pretto.fr (SSR, taux par durée dans le HTML) ─────────────
    try {
      const pageRes = await fetch('https://www.pretto.fr/taux-immobilier/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9'
        },
        signal: AbortSignal.timeout(10000)
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const pattern = /(\d[,\.]\d+)\s*%\s*sur\s*(\d+)\s*ans/gi;
        const found = {};
        let m;
        while ((m = pattern.exec(html)) !== null) {
          const rate = parseFloat(m[1].replace(',', '.'));
          const duree = parseInt(m[2]);
          if ([10, 15, 20, 25].includes(duree) && rate > 1 && rate < 8) {
            if (!found[duree]) found[duree] = rate;
          }
        }
        if (Object.keys(found).length >= 2) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.status(200).json({ success: true, taux: fillGaps(found), source: 'pretto.fr', date: new Date().toISOString().slice(0, 10) });
        }
      }
    } catch(e) { /* source suivante */ }

    // ── Source 2 : BCE (API officielle, taux moyen FR toutes durées) ─────────
    try {
      const ecbUrl = 'https://data-api.ecb.europa.eu/service/data/MIR/M.FR.B.A2C.AM.R.A.2250.EUR.N?lastNObservations=1&format=jsondata';
      const ecbRes = await fetch(ecbUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (ecbRes.ok) {
        const ecbData = await ecbRes.json();
        const series = Object.values(ecbData?.dataSets?.[0]?.series || {})[0];
        const obsValue = series ? Object.values(series.observations || {})[0]?.[0] : null;
        const baseRate = parseFloat(obsValue);
        if (baseRate > 1 && baseRate < 10) {
          const found = {
            10: parseFloat((baseRate - 0.30).toFixed(2)),
            15: parseFloat((baseRate - 0.15).toFixed(2)),
            20: parseFloat(baseRate.toFixed(2)),
            25: parseFloat((baseRate + 0.10).toFixed(2))
          };
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.status(200).json({ success: true, taux: found, source: 'BCE (MIR)', date: new Date().toISOString().slice(0, 10) });
        }
      }
    } catch(e) { /* source suivante */ }

    // ── Fallback : derniers taux connus ──────────────────────────────────────
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ success: true, taux: FALLBACK, source: 'Fallback (dernier connu)', date: '2026-04-30' });
  }

  // ── Branche ALTITUDE (comportement original) ────────────────────────────
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
