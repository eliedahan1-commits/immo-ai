// ══ VERCEL FUNCTION : SERVICES ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const dist = parseInt(req.query.dist || '1000');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    const query = `[out:json][timeout:25];(
      node["amenity"="pharmacy"](around:${dist},${lat},${lon});
      node["amenity"="doctors"](around:${dist},${lat},${lon});
      node["amenity"="hospital"](around:${dist},${lat},${lon});
      node["amenity"="clinic"](around:${dist},${lat},${lon});
      node["amenity"="dentist"](around:${dist},${lat},${lon});
      node["shop"="supermarket"](around:${dist},${lat},${lon});
      node["shop"="convenience"](around:${dist},${lat},${lon});
      node["amenity"="bank"](around:${dist},${lat},${lon});
      node["amenity"="post_office"](around:${dist},${lat},${lon});
      node["leisure"="fitness_centre"](around:${dist},${lat},${lon});
      node["amenity"="restaurant"](around:${dist},${lat},${lon});
      node["amenity"="cafe"](around:${dist},${lat},${lon});
      node["amenity"="charging_station"](around:${dist},${lat},${lon});
      node["amenity"="bicycle_rental"](around:${dist},${lat},${lon});
    );out body;`;

    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'IMMOAI/2.0 (https://immo-ai.vercel.app)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(25000)
    });

    if (!r.ok) throw new Error(`Overpass ${r.status}`);

    const data = await r.json();
    const elements = data.elements || [];

    const services = elements
      .filter(e => e.lat && e.lon)
      .map(e => {
        const tags = e.tags || {};
        let categorie = 'autre', icone = '📍', couleur = '#888', priorite = 10;
        if (tags.amenity === 'pharmacy') { categorie = 'sante'; icone = '💊'; couleur = '#e63946'; priorite = 1; }
        else if (['doctors','hospital','clinic'].includes(tags.amenity)) { categorie = 'sante'; icone = '🏥'; couleur = '#e63946'; priorite = 1; }
        else if (tags.amenity === 'dentist') { categorie = 'sante'; icone = '🦷'; couleur = '#e63946'; priorite = 2; }
        else if (tags.shop === 'supermarket') { categorie = 'commerce'; icone = '🛒'; couleur = '#f4a261'; priorite = 2; }
        else if (tags.shop === 'convenience') { categorie = 'commerce'; icone = '🏪'; couleur = '#f4a261'; priorite = 3; }
        else if (tags.amenity === 'bank') { categorie = 'service'; icone = '🏦'; couleur = '#457b9d'; priorite = 4; }
        else if (tags.amenity === 'post_office') { categorie = 'service'; icone = '📮'; couleur = '#457b9d'; priorite = 4; }
        else if (tags.leisure === 'fitness_centre') { categorie = 'sport'; icone = '🏋️'; couleur = '#2a9d8f'; priorite = 5; }
        else if (tags.amenity === 'restaurant') { categorie = 'restauration'; icone = '🍽️'; couleur = '#e9c46a'; priorite = 6; }
        else if (tags.amenity === 'cafe') { categorie = 'restauration'; icone = '☕'; couleur = '#e9c46a'; priorite = 7; }
        else if (tags.amenity === 'charging_station') { categorie = 'mobilite'; icone = '⚡'; couleur = '#4caf50'; priorite = 5; }
        else if (tags.amenity === 'bicycle_rental') { categorie = 'mobilite'; icone = '🚲'; couleur = '#4caf50'; priorite = 5; }

        const dLat = (e.lat - lat) * 111000;
        const dLon = (e.lon - lon) * 111000 * Math.cos(lat * Math.PI / 180);
        const distanceM = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));

        return {
          id: e.id, nom: tags.name || tags.amenity || tags.shop || 'Service',
          categorie, icone, couleur, priorite, lat: e.lat, lon: e.lon, distanceM,
          tags: { amenity: tags.amenity, shop: tags.shop, opening_hours: tags.opening_hours, phone: tags.phone }
        };
      })
      .sort((a, b) => a.priorite - b.priorite || a.distanceM - b.distanceM);

    const stats = {
      sante: services.filter(s => s.categorie === 'sante').length,
      commerce: services.filter(s => s.categorie === 'commerce').length,
      education: services.filter(s => s.categorie === 'education').length,
      sport: services.filter(s => s.categorie === 'sport').length,
      restauration: services.filter(s => s.categorie === 'restauration').length,
      mobilite: services.filter(s => s.categorie === 'mobilite').length,
      service: services.filter(s => s.categorie === 'service').length,
    };

    let score = 0;
    if (stats.sante >= 1) score += 2;
    if (stats.commerce >= 1) score += 2;
    if (stats.restauration >= 2) score += 1;
    if (stats.sport >= 1) score += 1;
    if (stats.service >= 1) score += 1;
    if (services.filter(s => s.distanceM <= 300).length >= 5) score += 2;
    if (services.length >= 15) score += 1;
    score = Math.min(score, 10);

    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({
      success: true, score,
      scoreLabel: score >= 8 ? 'Excellent' : score >= 6 ? 'Très bien' : score >= 4 ? 'Bien' : 'Limité',
      total: services.length, stats,
      services: services,
      source: 'OpenStreetMap via Overpass API',
      dateExtraction: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
