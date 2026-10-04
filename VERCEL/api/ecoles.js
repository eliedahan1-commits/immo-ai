// ══ VERCEL FUNCTION : ÉCOLES via Overpass ══


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const dist = parseInt(req.query.dist || '500');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    // nwr = node + way + relation (capture les écoles mappées comme bâtiment ou relation)
    // out center = retourne les coordonnées du centre pour les ways/relations
    const query = `[out:json][timeout:22];(
      nwr["amenity"="school"](around:${dist},${lat},${lon});
      nwr["amenity"="kindergarten"](around:${dist},${lat},${lon});
      nwr["amenity"="college"](around:${dist},${lat},${lon});
    );out center;`;

    // Un seul serveur fiable (le miroir kumi.systems ne répond plus — retiré le 04/10/2026).
    // 2 tentatives : la 2e absorbe un refus passager (saturation 429/504), après une courte pause.
    const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
    const NB_TENTATIVES = 2;
    const PAUSE_MS = 2000;
    const BUDGET_MS = 25000;
    const start = Date.now();
    let elements = null;
    for (let tentative = 1; tentative <= NB_TENTATIVES; tentative++) {
      if (tentative > 1) await new Promise(r => setTimeout(r, PAUSE_MS));
      const url = OVERPASS_URL;
      const remaining = BUDGET_MS - (Date.now() - start);
      if (remaining < 3000) break;
      try {
        const _r = await fetch(url, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'IMMOAI/2.0 (https://immo-ai-nu.vercel.app)', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(remaining)
        });
        if (!_r.ok) continue;
        const json = await _r.json();
        // Overpass peut répondre 200 avec une erreur interne (requête interrompue) : ce n'est pas « 0 école »
        if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) continue;
        elements = json.elements || [];
        break;
      } catch { continue; }
    }
    if (elements === null) throw new Error('Serveurs Overpass indisponibles');

    const etablissements = elements
      .filter(el => (el.lat && el.lon) || (el.center?.lat && el.center?.lon))
      .map(el => {
        // Les nodes ont lat/lon directement, les ways/relations ont center.lat/center.lon
        const elLat = el.lat ?? el.center?.lat;
        const elLon = el.lon ?? el.center?.lon;
        const dLat = (elLat - lat) * 111000;
        const dLon = (elLon - lon) * 111000 * Math.cos(lat * Math.PI / 180);
        const distanceM = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));
        const amenity = el.tags?.amenity || '';
        const nom = el.tags?.name || 'Établissement scolaire';
        // Tags OSM spécifiques au niveau scolaire
        const schoolType = (el.tags?.['school:type'] || el.tags?.['education'] || el.tags?.['school:FR'] || '').toLowerCase();
        const isced = parseInt(el.tags?.['isced:level'] || el.tags?.['isced'] || '0');
        let type = 'École élémentaire';
        if (amenity === 'kindergarten' || schoolType.includes('maternelle') || nom.toLowerCase().includes('maternelle')) {
          type = 'École maternelle';
        } else if (isced === 3 || schoolType.includes('lycée') || schoolType.includes('lycee') || schoolType.includes('secondaire') || schoolType.includes('secondary') || nom.toLowerCase().includes('lycée') || nom.toLowerCase().includes('lycee')) {
          type = 'Lycée';
        } else if (isced === 2 || schoolType.includes('collège') || schoolType.includes('college') || nom.toLowerCase().includes('collège') || nom.toLowerCase().includes('college')) {
          type = 'Collège';
        }
        return {
          nom, type,
          statut: el.tags?.operator_type || '',
          adresse: el.tags?.['addr:street'] || '',
          commune: el.tags?.['addr:city'] || '',
          codePostal: el.tags?.['addr:postcode'] || '',
          phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
          distanceM, lat: elLat, lon: elLon
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
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: false, total: 0,
      types: { ecoles: 0, maternelle: 0, elementaire: 0, college: 0, lycee: 0 },
      etablissements: [],
      error: error.message,
      source: 'OpenStreetMap · Overpass'
    });
  }
}
