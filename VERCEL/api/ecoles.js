// ══ VERCEL FUNCTION : ÉCOLES via Overpass ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const dist = parseInt(req.query.dist || '1500');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    const query = `[out:json][timeout:12];(
      node["amenity"="school"](around:${dist},${lat},${lon});
      node["amenity"="kindergarten"](around:${dist},${lat},${lon});
      node["amenity"="college"](around:${dist},${lat},${lon});
    );out body;`;

    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'IMMOAI/2.0 (https://immo-ai-nu.vercel.app)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!r.ok) throw new Error(`Overpass ${r.status}`);
    const data = await r.json();
    const elements = data.elements || [];

    const etablissements = elements
      .filter(el => el.lat && el.lon)
      .map(el => {
        const dLat = (el.lat - lat) * 111000;
        const dLon = (el.lon - lon) * 111000 * Math.cos(lat * Math.PI / 180);
        const distanceM = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));
        const amenity = el.tags?.amenity || '';
        const nom = el.tags?.name || 'Établissement scolaire';
        let type = 'École élémentaire';
        if (amenity === 'kindergarten') type = 'École maternelle';
        else if (nom.toLowerCase().includes('lycée') || nom.toLowerCase().includes('lycee')) type = 'Lycée';
        else if (nom.toLowerCase().includes('collège') || nom.toLowerCase().includes('college')) type = 'Collège';
        else if (nom.toLowerCase().includes('maternelle')) type = 'École maternelle';
        return {
          nom, type,
          statut: el.tags?.operator_type || '',
          adresse: el.tags?.['addr:street'] || '',
          commune: el.tags?.['addr:city'] || '',
          codePostal: el.tags?.['addr:postcode'] || '',
          distanceM, lat: el.lat, lon: el.lon
        };
      })
      .sort((a, b) => a.distanceM - b.distanceM);

    const isEcole   = e => e.type.includes('cole');
    const isCollege = e => e.type.includes('ollège') || e.type.includes('ollege');
    const isLycee   = e => e.type.includes('ycée') || e.type.includes('ycee');
    const types = {
      ecoles:      etablissements.filter(isEcole).length,
      maternelle:  etablissements.filter(e => e.type.includes('maternelle')).length,
      elementaire: etablissements.filter(e => isEcole(e) && !e.type.includes('maternelle')).length,
      college:     etablissements.filter(isCollege).length,
      lycee:       etablissements.filter(isLycee).length,
    };
    const total = types.ecoles + types.college + types.lycee;

    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({
      success: true, total, types, etablissements,
      source: 'OpenStreetMap · Overpass',
      dateExtraction: new Date().toISOString()
    });

  } catch (error) {
    return res.status(200).json({
      success: false, total: 0,
      types: { ecoles: 0, maternelle: 0, elementaire: 0, college: 0, lycee: 0 },
      etablissements: [],
      error: error.message,
      source: 'OpenStreetMap · Overpass'
    });
  }
}
