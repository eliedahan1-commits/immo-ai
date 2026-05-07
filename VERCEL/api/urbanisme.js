// ══ VERCEL FUNCTION : PLU / URBANISME ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { lat, lon } = req.query;

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

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

    const zoneCode = zone?.typezone || zone?.libelle || null;
    let zoneLabel = 'À vérifier';
    let constructible = null;
    if (!zoneCode) { zoneLabel = 'À vérifier'; }
    else if (zoneCode.startsWith('AU')) { zoneLabel = 'Zone à urbaniser'; constructible = true; }
    else if (zoneCode.startsWith('U')) { zoneLabel = 'Zone urbaine'; constructible = true; }
    else if (zoneCode.startsWith('A')) { zoneLabel = 'Zone agricole'; constructible = false; }
    else if (zoneCode.startsWith('N')) { zoneLabel = 'Zone naturelle'; constructible = false; }

    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.status(200).json({
      success: true,
      zone: {
        code: zoneCode || 'NC',
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
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
