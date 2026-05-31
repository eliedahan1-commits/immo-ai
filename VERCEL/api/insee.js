// ══ VERCEL FUNCTION : INSEE (population + densité) + Melodi (économie) + proxy SeLoger ══

const MELODI_BASE = 'https://api.insee.fr/melodi/data';
const MELODI_TIMEOUT = 9000;
const GEO_VINTAGES = ['2024', '2023', '2022', '2021'];

async function fetchMelodiDataset(datasetId, codeInsee) {
  for (const year of GEO_VINTAGES) {
    const geoCode = `${year}-COM-${codeInsee}`;
    try {
      const r = await fetch(`${MELODI_BASE}/${datasetId}?GEO=${geoCode}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(MELODI_TIMEOUT)
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.observations && d.observations.length > 0) return d;
    } catch (e) { continue; }
  }
  return null;
}

// Fetch données nationales France (GEO codes à tester en fallback)
async function fetchMelodiNational(datasetId) {
  const natCodes = ['FRANCE'];
  for (const geoCode of natCodes) {
    try {
      const r = await fetch(`${MELODI_BASE}/${datasetId}?GEO=${geoCode}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(MELODI_TIMEOUT)
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.observations && d.observations.length > 0) return d;
    } catch (e) { continue; }
  }
  return null;
}

// Retourne l'observation la plus récente parmi celles correspondant au filtre
function findLatest(observations, filterFn) {
  const matches = (observations || []).filter(filterFn);
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    const ya = parseInt(a.dimensions?.TIME_PERIOD || '0');
    const yb = parseInt(b.dimensions?.TIME_PERIOD || '0');
    return yb - ya; // décroissant → plus récent en premier
  })[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── Action : données économiques Melodi INSEE ──
  if (req.query.action === 'melodi') {
    const code = (req.query.codeInsee || '').trim();
    if (!code) return res.status(400).json({ error: 'codeInsee requis' });

    try {
      const [dFilosofi, dEmploi, dFilosofiNat, dEmploiNat] = await Promise.all([
        fetchMelodiDataset('DS_FILOSOFI_CC', code),
        fetchMelodiDataset('DS_RP_EMPLOI_LR_PRINC', code),
        fetchMelodiNational('DS_FILOSOFI_CC'),
        fetchMelodiNational('DS_RP_EMPLOI_LR_PRINC'),
      ]);

      // Revenu disponible médian net (MED_SL) — dernière année disponible
      const obs = dFilosofi?.observations || [];
      const medSL  = findLatest(obs, o => o.dimensions?.FILOSOFI_MEASURE === 'MED_SL');
      const pavSL  = findLatest(obs, o => o.dimensions?.FILOSOFI_MEASURE === 'PR_MD60');
      const revenuMedian  = medSL?.measures?.OBS_VALUE_NIVEAU?.value ? Math.round(medSL.measures.OBS_VALUE_NIVEAU.value) : null;
      const tauxPauvrete  = pavSL?.measures?.OBS_VALUE_NIVEAU?.value != null ? Math.round(pavSL.measures.OBS_VALUE_NIVEAU.value * 10) / 10 : null;
      const anneeFilosofi = medSL?.dimensions?.TIME_PERIOD || null;

      // Taux chômage — dernière année disponible
      const eObs       = dEmploi?.observations || [];
      const actifTotal = findLatest(eObs, o => o.dimensions?.EMPSTA_ENQ === '_T' && o.dimensions?.AGE === 'Y_GE15' && o.dimensions?.SEX === '_T');
      const chomeurs   = findLatest(eObs, o => o.dimensions?.EMPSTA_ENQ === '2'  && o.dimensions?.AGE === 'Y_GE15' && o.dimensions?.SEX === '_T');
      const nbActifs   = actifTotal?.measures?.OBS_VALUE_NIVEAU?.value;
      const nbChomeurs = chomeurs?.measures?.OBS_VALUE_NIVEAU?.value;
      const tauxChomage = (nbActifs && nbChomeurs) ? Math.round(nbChomeurs / nbActifs * 1000) / 10 : null;
      const anneeEmploi = actifTotal?.dimensions?.TIME_PERIOD || null;

      // Données nationales
      const obsNat = dFilosofiNat?.observations || [];
      const medSLNat = findLatest(obsNat, o => o.dimensions?.FILOSOFI_MEASURE === 'MED_SL');
      const revenuMedianNat = medSLNat?.measures?.OBS_VALUE_NIVEAU?.value ? Math.round(medSLNat.measures.OBS_VALUE_NIVEAU.value) : null;
      const anneeFilosofiNat = medSLNat?.dimensions?.TIME_PERIOD || null;

      const eObsNat = dEmploiNat?.observations || [];
      const actifTotalNat = findLatest(eObsNat, o => o.dimensions?.EMPSTA_ENQ === '_T' && o.dimensions?.AGE === 'Y_GE15' && o.dimensions?.SEX === '_T');
      const chomeursNat   = findLatest(eObsNat, o => o.dimensions?.EMPSTA_ENQ === '2'  && o.dimensions?.AGE === 'Y_GE15' && o.dimensions?.SEX === '_T');
      const nbActifsNat   = actifTotalNat?.measures?.OBS_VALUE_NIVEAU?.value;
      const nbChomeursNat = chomeursNat?.measures?.OBS_VALUE_NIVEAU?.value;
      const tauxChomageNat = (nbActifsNat && nbChomeursNat) ? Math.round(nbChomeursNat / nbActifsNat * 1000) / 10 : null;
      const anneeEmploiNat = actifTotalNat?.dimensions?.TIME_PERIOD || null;

      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).json({
        success: true,
        economie: { revenuMedian, tauxPauvrete, tauxChomage, anneeFilosofi, anneeEmploi, nbActifs: nbActifs ? Math.round(nbActifs) : null },
        melodiNational: { revenuMedian: revenuMedianNat, tauxChomage: tauxChomageNat, anneeFilosofi: anneeFilosofiNat, anneeEmploi: anneeEmploiNat }
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // ── Action : lookup SeLoger/Logic-Immo location ID ──
  if (req.query.action === 'seloger-location') {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.status(400).json({ error: 'q requis (min 2 chars)' });
    try {
      const r = await fetch('https://www.seloger.com/search-mfe-bff/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ text: q, country: 'FR', limit: 5 }),
        signal: AbortSignal.timeout(5000)
      });
      if (!r.ok) throw new Error('autocomplete HTTP ' + r.status);
      const data = await r.json();
      const city = (Array.isArray(data) ? data : []).find(item => item.type_key === 'AD08') || data[0];
      if (!city || !city.id) return res.status(404).json({ error: 'Ville introuvable' });
      res.setHeader('Cache-Control', 'public, max-age=2592000');
      return res.status(200).json({ id: city.id, label: Array.isArray(city.labels) ? city.labels[0] : city.labels });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Appel principal : population + densité ──
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const codeInsee = req.query.codeInsee || '';
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    const fields = 'nom,population,surface,codesPostaux,codeDepartement';
    const geoUrl = codeInsee
      ? 'https://geo.api.gouv.fr/communes/' + codeInsee + '?fields=' + fields
      : 'https://geo.api.gouv.fr/communes?lat=' + lat + '&lon=' + lon + '&fields=' + fields + '&format=json&limit=1';
    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(6000) });
    if (!geoRes.ok) throw new Error('geo.api ' + geoRes.status);
    const geoData = await geoRes.json();
    const commune = Array.isArray(geoData) ? geoData[0] : geoData;
    if (!commune) throw new Error('Commune introuvable');
    const population    = commune.population || 0;
    const surfaceHa     = commune.surface || 0;
    const superficieKm2 = surfaceHa > 0 ? surfaceHa / 100 : null;
    const densite       = superficieKm2 > 0 ? Math.round(population / superficieKm2) : null;
    const communeCode   = codeInsee || commune.code || '';
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.status(200).json({
      success: true,
      commune: { nom: commune.nom, codeInsee: communeCode, population, superficie: superficieKm2, densite, codesPostaux: commune.codesPostaux, departement: commune.codeDepartement },
      source: 'geo.api.gouv.fr',
      dateExtraction: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
