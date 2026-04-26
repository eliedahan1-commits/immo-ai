// ══ NETLIFY FUNCTION : PLU / URBANISME ══
// Source : apicarto.ign.fr (IGN officiel) — API Carto GPU
// Appel : /api/urbanisme?lat=48.85&lon=2.35

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
    const geom = JSON.stringify({ type: 'Point', coordinates: [parseFloat(lon), parseFloat(lat)] });

    // 1. Zone PLU
    const zoneUrl = `https://apicarto.ign.fr/api/gpu/zone-urba?geom=${encodeURIComponent(geom)}`;
    const zoneRes = await fetch(zoneUrl, { signal: AbortSignal.timeout(8000) });
    const zoneData = zoneRes.ok ? await zoneRes.json() : { features: [] };
    const zone = zoneData.features?.[0]?.properties;

    // 2. Type de document (PLU, POS, RNU...)
    const docUrl = `https://apicarto.ign.fr/api/gpu/document?geom=${encodeURIComponent(geom)}`;
    const docRes = await fetch(docUrl, { signal: AbortSignal.timeout(8000) });
    const docData = docRes.ok ? await docRes.json() : { features: [] };
    const doc = docData.features?.[0]?.properties;

    // 3. Prescriptions (contraintes spéciales)
    const prescUrl = `https://apicarto.ign.fr/api/gpu/prescription-surf?geom=${encodeURIComponent(geom)}`;
    const prescRes = await fetch(prescUrl, { signal: AbortSignal.timeout(8000) });
    const prescData = prescRes.ok ? await prescRes.json() : { features: [] };
    const prescriptions = prescData.features?.map(f => f.properties?.libelle).filter(Boolean) || [];

    // Interprétation de la zone
    const zoneCode = zone?.typezone || zone?.libelle || 'NC';
    let zoneLabel = 'Non défini';
    let constructible = null;
    if (zoneCode.startsWith('U')) { zoneLabel = 'Zone urbaine'; constructible = true; }
    else if (zoneCode.startsWith('AU')) { zoneLabel = 'Zone à urbaniser'; constructible = true; }
    else if (zoneCode.startsWith('A')) { zoneLabel = 'Zone agricole'; constructible = false; }
    else if (zoneCode.startsWith('N')) { zoneLabel = 'Zone naturelle'; constructible = false; }

    return new Response(JSON.stringify({
      success: true,
      zone: {
        code: zoneCode,
        libelle: zone?.libelle || zoneLabel,
        typeZone: zoneLabel,
        constructible,
        regleUrba: zone?.destdomin || null
      },
      document: {
        type: doc?.du_type || 'PLU',
        nomCommune: doc?.grid_title || null,
        dateApprobation: (() => {
          const m = (doc?.name || '').match(/(\d{8})$/);
          if (!m) return null;
          const d = m[1];
          return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
        })()
      },
      prescriptions: prescriptions.slice(0, 5),
      source: 'Géoportail de l\'Urbanisme · IGN / apicarto.ign.fr',
      dateExtraction: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=604800'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

export const config = { path: '/api/urbanisme' };
