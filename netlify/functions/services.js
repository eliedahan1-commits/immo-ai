// ══ NETLIFY FUNCTION : SERVICES DE PROXIMITÉ ══
// Source : OpenStreetMap via Overpass API (commerces, santé, services)
// + API Sirene INSEE pour les établissements officiels
// Appel : /api/services?lat=48.85&lon=2.35&dist=1000

export default async (req) => {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const dist = parseInt(url.searchParams.get('dist') || '1000');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat et lon requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // Overpass query pour tous les services essentiels
    const overpassQuery = `
      [out:json][timeout:15];
      (
        node["amenity"="pharmacy"](around:${dist},${lat},${lon});
        node["amenity"="doctors"](around:${dist},${lat},${lon});
        node["amenity"="hospital"](around:${dist},${lat},${lon});
        node["amenity"="clinic"](around:${dist},${lat},${lon});
        node["amenity"="dentist"](around:${dist},${lat},${lon});
        node["amenity"="supermarket"](around:${dist},${lat},${lon});
        node["shop"="supermarket"](around:${dist},${lat},${lon});
        node["shop"="convenience"](around:${dist},${lat},${lon});
        node["amenity"="bank"](around:${dist},${lat},${lon});
        node["amenity"="post_office"](around:${dist},${lat},${lon});
        node["amenity"="school"](around:${dist},${lat},${lon});
        node["amenity"="kindergarten"](around:${dist},${lat},${lon});
        node["leisure"="fitness_centre"](around:${dist},${lat},${lon});
        node["leisure"="sports_centre"](around:${dist},${lat},${lon});
        node["amenity"="restaurant"](around:${dist},${lat},${lon});
        node["amenity"="cafe"](around:${dist},${lat},${lon});
        node["amenity"="charging_station"](around:${dist},${lat},${lon});
        node["amenity"="bicycle_rental"](around:${dist},${lat},${lon});
        node["amenity"="parking"](around:${dist},${lat},${lon});
      );
      out body;
    `;

    const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(overpassQuery)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(15000)
    });

    if (!overpassRes.ok) throw new Error(`Overpass error: ${overpassRes.status}`);

    const data = await overpassRes.json();
    const elements = data.elements || [];

    // Catégoriser et enrichir chaque point
    const services = elements
      .filter(e => e.lat && e.lon && (e.tags?.name || e.tags?.amenity || e.tags?.shop))
      .map(e => {
        const tags = e.tags || {};
        
        // Déterminer la catégorie et l'icône
        let categorie = 'autre';
        let icone = '📍';
        let couleur = '#888';
        let priorite = 10;

        if (tags.amenity === 'pharmacy') { categorie = 'sante'; icone = '💊'; couleur = '#e63946'; priorite = 1; }
        else if (['doctors','hospital','clinic'].includes(tags.amenity)) { categorie = 'sante'; icone = '🏥'; couleur = '#e63946'; priorite = 1; }
        else if (tags.amenity === 'dentist') { categorie = 'sante'; icone = '🦷'; couleur = '#e63946'; priorite = 2; }
        else if (tags.amenity === 'supermarket' || tags.shop === 'supermarket') { categorie = 'commerce'; icone = '🛒'; couleur = '#f4a261'; priorite = 2; }
        else if (tags.shop === 'convenience') { categorie = 'commerce'; icone = '🏪'; couleur = '#f4a261'; priorite = 3; }
        else if (tags.amenity === 'bank') { categorie = 'service'; icone = '🏦'; couleur = '#457b9d'; priorite = 4; }
        else if (tags.amenity === 'post_office') { categorie = 'service'; icone = '📮'; couleur = '#457b9d'; priorite = 4; }
        else if (['school','kindergarten'].includes(tags.amenity)) { categorie = 'education'; icone = '🏫'; couleur = '#2a9d8f'; priorite = 3; }
        else if (['fitness_centre','sports_centre'].includes(tags.leisure)) { categorie = 'sport'; icone = '🏋️'; couleur = '#2a9d8f'; priorite = 5; }
        else if (tags.amenity === 'restaurant') { categorie = 'restauration'; icone = '🍽️'; couleur = '#e9c46a'; priorite = 6; }
        else if (tags.amenity === 'cafe') { categorie = 'restauration'; icone = '☕'; couleur = '#e9c46a'; priorite = 7; }
        else if (tags.amenity === 'charging_station') { categorie = 'mobilite'; icone = '⚡'; couleur = '#4caf50'; priorite = 5; }
        else if (tags.amenity === 'bicycle_rental') { categorie = 'mobilite'; icone = '🚲'; couleur = '#4caf50'; priorite = 5; }
        else if (tags.amenity === 'parking') { categorie = 'mobilite'; icone = '🅿️'; couleur = '#4caf50'; priorite = 8; }

        // Calcul distance
        const dLat = (e.lat - parseFloat(lat)) * 111000;
        const dLon = (e.lon - parseFloat(lon)) * 111000 * Math.cos(parseFloat(lat) * Math.PI / 180);
        const distanceM = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));

        return {
          id: e.id,
          nom: tags.name || tags.amenity || tags.shop || 'Sans nom',
          categorie,
          icone,
          couleur,
          priorite,
          lat: e.lat,
          lon: e.lon,
          distanceM,
          tags: {
            amenity: tags.amenity,
            shop: tags.shop,
            leisure: tags.leisure,
            opening_hours: tags.opening_hours,
            phone: tags.phone,
            website: tags.website
          }
        };
      })
      .sort((a, b) => a.priorite - b.priorite || a.distanceM - b.distanceM);

    // Statistiques par catégorie
    const stats = {
      sante: services.filter(s => s.categorie === 'sante').length,
      commerce: services.filter(s => s.categorie === 'commerce').length,
      education: services.filter(s => s.categorie === 'education').length,
      sport: services.filter(s => s.categorie === 'sport').length,
      restauration: services.filter(s => s.categorie === 'restauration').length,
      mobilite: services.filter(s => s.categorie === 'mobilite').length,
      service: services.filter(s => s.categorie === 'service').length,
    };

    // Score de proximité /10
    let score = 0;
    if (stats.sante >= 1) score += 2;
    if (stats.commerce >= 1) score += 2;
    if (stats.education >= 1) score += 1;
    if (stats.restauration >= 2) score += 1;
    if (stats.sport >= 1) score += 1;
    if (stats.service >= 1) score += 1;
    if (services.filter(s => s.distanceM <= 300).length >= 5) score += 1;
    if (services.length >= 20) score += 1;
    score = Math.min(score, 10);

    return new Response(JSON.stringify({
      success: true,
      score,
      scoreLabel: score >= 8 ? 'Excellent' : score >= 6 ? 'Très bien' : score >= 4 ? 'Bien' : 'Limité',
      total: services.length,
      stats,
      services: services.slice(0, 80), // Max 80 points sur la carte
      source: 'OpenStreetMap via Overpass API',
      dateExtraction: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

export const config = { path: '/api/services' };
