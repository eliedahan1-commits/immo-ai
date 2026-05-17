// ══ VERCEL FUNCTION : SERVICES ══


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const dist = parseInt(req.query.dist || '1000');

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    // Requête fusionnée avec regex : 4 sous-requêtes au lieu de 16 → beaucoup plus rapide
    // node pour amenity/shop (presque toujours des points) → léger et rapide
    // nwr pour les éléments cartographiés comme polygones (parcs, culture, sport, crèches)
    const ovpTimeout = dist >= 2000 ? 27 : 22;
    const query = `[out:json][timeout:${ovpTimeout}];(
      node["amenity"~"^(pharmacy|doctors|hospital|clinic|dentist|bank|post_office|restaurant|cafe|charging_station|bicycle_rental|childcare)$"](around:${dist},${lat},${lon});
      node["shop"~"^(supermarket|convenience|bakery|butcher|greengrocer)$"](around:${dist},${lat},${lon});
      nwr["leisure"~"^(fitness_centre|sports_centre|swimming_pool|stadium|sports_hall|golf_course|ice_rink|skatepark)$"](around:${dist},${lat},${lon});
      nwr["leisure"~"^(park|garden|nature_reserve|playground)$"](around:${dist},${lat},${lon});
      nwr["amenity"~"^(theatre|cinema|museum|library|arts_centre)$"](around:${dist},${lat},${lon});
      nwr["tourism"~"^(museum|gallery|artwork)$"](around:${dist},${lat},${lon});
      nwr["amenity"="kindergarten"]["name"~"cr.che|halte|accueil|multi.accueil|microcrech",i](around:${dist},${lat},${lon});
    );out center;`;

    const OVERPASS_URLS = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter',
    ];
    const BUDGET_MS = dist >= 2000 ? 29000 : 28000; // budget global < limite Vercel 30s
    const start = Date.now();
    let elements = null;
    for (const url of OVERPASS_URLS) {
      const remaining = BUDGET_MS - (Date.now() - start);
      if (remaining < 3000) break; // plus assez de temps
      try {
        const _r = await fetch(url, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'IMMOAI/2.0 (https://immo-ai-nu.vercel.app)', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(remaining)
        });
        if (!_r.ok) continue;
        const json = await _r.json();
        elements = json.elements || [];
        break;
      } catch { continue; }
    }
    if (elements === null) throw new Error('Serveurs Overpass indisponibles');

    const services = elements
      .filter(e => (e.lat && e.lon) || (e.center?.lat && e.center?.lon))
      .map(e => {
        const eLat = e.lat ?? e.center?.lat;
        const eLon = e.lon ?? e.center?.lon;
        const tags = e.tags || {};
        let categorie = 'autre', icone = '📍', couleur = '#888', priorite = 10;
        if (tags.amenity === 'pharmacy') { categorie = 'sante'; icone = '💊'; couleur = '#e63946'; priorite = 1; }
        else if (['doctors','hospital','clinic'].includes(tags.amenity)) { categorie = 'sante'; icone = '🏥'; couleur = '#e63946'; priorite = 1; }
        else if (tags.amenity === 'dentist') { categorie = 'sante'; icone = '🦷'; couleur = '#e63946'; priorite = 2; }
        else if (tags.shop === 'supermarket') { categorie = 'commerce'; icone = '🛒'; couleur = '#f4a261'; priorite = 2; }
        else if (tags.shop === 'convenience') { categorie = 'commerce'; icone = '🏪'; couleur = '#f4a261'; priorite = 3; }
        else if (tags.shop === 'bakery') { categorie = 'commerce'; icone = '🥖'; couleur = '#f4a261'; priorite = 3; }
        else if (tags.shop === 'butcher') { categorie = 'commerce'; icone = '🥩'; couleur = '#f4a261'; priorite = 4; }
        else if (tags.shop === 'greengrocer') { categorie = 'commerce'; icone = '🥦'; couleur = '#f4a261'; priorite = 4; }
        else if (tags.amenity === 'bank') { categorie = 'service'; icone = '🏦'; couleur = '#457b9d'; priorite = 4; }
        else if (tags.amenity === 'post_office') { categorie = 'service'; icone = '📮'; couleur = '#457b9d'; priorite = 4; }
        else if (['fitness_centre','sports_centre','swimming_pool','stadium','sports_hall','golf_course','ice_rink','skatepark'].includes(tags.leisure)) { categorie = 'sport'; icone = '🏋️'; couleur = '#2a9d8f'; priorite = 5; }
        else if (['park','garden','nature_reserve','playground'].includes(tags.leisure)) { categorie = 'parc'; icone = '🌳'; couleur = '#52b788'; priorite = 6; }
        else if (['theatre','cinema','museum','library','arts_centre'].includes(tags.amenity)) { categorie = 'culture'; icone = '🎭'; couleur = '#9b72cf'; priorite = 7; }
        else if (['museum','gallery','artwork'].includes(tags.tourism)) { categorie = 'culture'; icone = '🏛️'; couleur = '#9b72cf'; priorite = 7; }
        else if (tags.amenity === 'restaurant') { categorie = 'restauration'; icone = '🍽️'; couleur = '#e9c46a'; priorite = 6; }
        else if (tags.amenity === 'cafe') { categorie = 'restauration'; icone = '☕'; couleur = '#e9c46a'; priorite = 7; }
        else if (tags.amenity === 'charging_station') { categorie = 'mobilite'; icone = '⚡'; couleur = '#4caf50'; priorite = 5; }
        else if (tags.amenity === 'bicycle_rental') { categorie = 'mobilite'; icone = '🚲'; couleur = '#4caf50'; priorite = 5; }
        else if (tags.amenity === 'childcare') { categorie = 'creche'; icone = '🍼'; couleur = '#ff6b9d'; priorite = 3; }
        else if (tags.amenity === 'kindergarten') {
          const n = (tags.name || '').toLowerCase();
          if (/cr.che|halte|accueil|multi.accueil|microcrech/.test(n)) {
            categorie = 'creche'; icone = '🍼'; couleur = '#ff6b9d'; priorite = 3;
          }
        }

        const dLat = (eLat - lat) * 111000;
        const dLon = (eLon - lon) * 111000 * Math.cos(lat * Math.PI / 180);
        const distanceM = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));

        return {
          id: e.id, nom: tags.name || tags.amenity || tags.shop || 'Service',
          categorie, icone, couleur, priorite, lat: eLat, lon: eLon, distanceM,
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
      creche: services.filter(s => s.categorie === 'creche').length,
      parc: services.filter(s => s.categorie === 'parc').length,
      culture: services.filter(s => s.categorie === 'culture').length,
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
      success: true, score, dist,
      scoreLabel: score >= 8 ? 'Excellent' : score >= 6 ? 'Très bien' : score >= 4 ? 'Bien' : 'Limité',
      total: services.length, stats,
      services: services.slice(0, 300),
      source: 'OpenStreetMap via Overpass API',
      dateExtraction: new Date().toISOString()
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: false, error: error.message });
  }
}
