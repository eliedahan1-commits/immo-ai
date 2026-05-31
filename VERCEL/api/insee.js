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
      const fetchFiltered = async (url) => {
        try {
          const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(MELODI_TIMEOUT) });
          return r.ok ? r.json() : null;
        } catch(e) { return null; }
      };
      const [dFilosofi, dEmploi, dFilosofiNat, dEmploiActifsNat, dEmploiChomNat, dLogement, dMenages, dDiplomes, dLogNat, dMenNat] = await Promise.all([
        fetchMelodiDataset('DS_FILOSOFI_CC', code),
        fetchMelodiDataset('DS_RP_EMPLOI_LR_PRINC', code),
        fetchMelodiNational('DS_FILOSOFI_CC'),
        fetchFiltered(`${MELODI_BASE}/DS_RP_EMPLOI_LR_PRINC?GEO=FRANCE&EMPSTA_ENQ=_T&AGE=Y_GE15&SEX=_T`),
        fetchFiltered(`${MELODI_BASE}/DS_RP_EMPLOI_LR_PRINC?GEO=FRANCE&EMPSTA_ENQ=2&AGE=Y_GE15&SEX=_T`),
        fetchMelodiDataset('DS_RP_LOGEMENT_PRINC', code),
        fetchMelodiDataset('DS_RP_MENAGES_PRINC', code),
        fetchMelodiDataset('DS_RP_DIPLOMES_PRINC', code),
        fetchMelodiNational('DS_RP_LOGEMENT_PRINC'),
        fetchMelodiNational('DS_RP_MENAGES_PRINC'),
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

      const actifTotalNat = findLatest(dEmploiActifsNat?.observations || [], () => true);
      const chomeursNat   = findLatest(dEmploiChomNat?.observations || [], () => true);
      const nbActifsNat   = actifTotalNat?.measures?.OBS_VALUE_NIVEAU?.value;
      const nbChomeursNat = chomeursNat?.measures?.OBS_VALUE_NIVEAU?.value;
      const tauxChomageNat = (nbActifsNat && nbChomeursNat) ? Math.round(nbChomeursNat / nbActifsNat * 1000) / 10 : null;
      const anneeEmploiNat = actifTotalNat?.dimensions?.TIME_PERIOD || null;

      // ── Logement : % propriétaires, vacants, résid. princ. ──
      const logObs = dLogement?.observations || [];
      const logFilter = o => o.dimensions?.NOR==='_T' && o.dimensions?.NRG_SRC==='_T' && o.dimensions?.CARS==='_T'
        && o.dimensions?.BUILD_END==='_T' && o.dimensions?.CARPARK==='_T' && o.dimensions?.L_STAY==='_T'
        && o.dimensions?.TDW==='_T' && o.dimensions?.RP_MEASURE==='DWELLINGS';
      const logTotal  = findLatest(logObs, o => logFilter(o) && o.dimensions?.OCS==='DW_MAIN' && o.dimensions?.TSH==='_T');
      const logPropri = findLatest(logObs, o => logFilter(o) && o.dimensions?.OCS==='DW_MAIN' && o.dimensions?.TSH==='100');
      const logVac    = findLatest(logObs, o => logFilter(o) && o.dimensions?.OCS==='DW_VAC'  && o.dimensions?.TSH==='_T');
      const nbResidPrinc  = logTotal?.measures?.OBS_VALUE_NIVEAU?.value ? Math.round(logTotal.measures.OBS_VALUE_NIVEAU.value) : null;
      const nbPropri      = logPropri?.measures?.OBS_VALUE_NIVEAU?.value ? Math.round(logPropri.measures.OBS_VALUE_NIVEAU.value) : null;
      const nbVacants     = logVac?.measures?.OBS_VALUE_NIVEAU?.value ? Math.round(logVac.measures.OBS_VALUE_NIVEAU.value) : null;
      const pctPropri     = (nbResidPrinc && nbPropri) ? Math.round(nbPropri / nbResidPrinc * 100) : null;
      const pctLocataires = (nbResidPrinc && nbPropri) ? Math.round((nbResidPrinc - nbPropri) / nbResidPrinc * 100) : null;
      const anneeLogement = logTotal?.dimensions?.TIME_PERIOD || null;

      // ── Ménages : % personnes seules (somme de toutes les tranches d'âge) ──
      const menObs = dMenages?.observations || [];
      const years_men = [...new Set((menObs).map(o => o.dimensions?.TIME_PERIOD))].filter(Boolean).sort().reverse();
      const lastYearMen = years_men[0];
      const AGE_GRANULAR = ['Y15T24','Y25T39','Y40T54','Y55T64','Y65T79','Y_GE80'];
      const primaryComGeo = logTotal?.dimensions?.GEO || null;
      const seulsObs = menObs.filter(o => o.dimensions?.NOC==='P1' && o.dimensions?.RP_MEASURE==='ONEPERS'
        && o.dimensions?.OCS==='DW_MAIN' && o.dimensions?.CIVIL_STATUS==='_T' && o.dimensions?.COUPLE==='_T'
        && o.dimensions?.TIME_PERIOD===lastYearMen && AGE_GRANULAR.includes(o.dimensions?.AGE));
      const nbSeulsVal = seulsObs.length ? Math.round(seulsObs.reduce((s,o) => s + (o.measures?.OBS_VALUE_NIVEAU?.value||0), 0)) : null;
      const pctSeuls   = (nbResidPrinc && nbSeulsVal) ? Math.round(nbSeulsVal / nbResidPrinc * 100) : null;

      // ── Diplômes : % bac+5, % sans diplôme ──
      const dipObs  = dDiplomes?.observations || [];
      const dipFilter = o => o.dimensions?.SEX==='_T' && o.dimensions?.AGE==='Y_GE15' && o.dimensions?.RP_MEASURE==='POP';
      const dipTotal  = findLatest(dipObs, o => dipFilter(o) && o.dimensions?.EDUC==='_T');
      const dipBac5     = findLatest(dipObs, o => dipFilter(o) && o.dimensions?.EDUC==='700_RP');
      const dipLicence  = findLatest(dipObs, o => dipFilter(o) && o.dimensions?.EDUC==='600_RP');
      const dipBts      = findLatest(dipObs, o => dipFilter(o) && o.dimensions?.EDUC==='500_RP');
      const dipBac      = findLatest(dipObs, o => dipFilter(o) && o.dimensions?.EDUC==='350T351_RP');
      const dipCapBep   = findLatest(dipObs, o => dipFilter(o) && o.dimensions?.EDUC==='200_RP');
      const dipBrevet   = findLatest(dipObs, o => dipFilter(o) && o.dimensions?.EDUC==='300_RP');
      const dipSans     = findLatest(dipObs, o => dipFilter(o) && o.dimensions?.EDUC==='001T100_RP');
      const nbDipTotal = dipTotal?.measures?.OBS_VALUE_NIVEAU?.value || null;
      const pct = (obs) => (nbDipTotal && obs?.measures?.OBS_VALUE_NIVEAU?.value) ? Math.round(obs.measures.OBS_VALUE_NIVEAU.value / nbDipTotal * 100) : null;
      const pctBac5    = pct(dipBac5);
      const pctLicence = pct(dipLicence);
      const pctBts     = pct(dipBts);
      const pctBac     = pct(dipBac);
      const pctCapBep  = pct(dipCapBep);
      const pctBrevet  = pct(dipBrevet);
      const pctSansDip = pct(dipSans);
      const anneeDiplomes = dipTotal?.dimensions?.TIME_PERIOD || null;

      // ── Données nationales logement ──
      const logNatObs = dLogNat?.observations || [];
      const logNatYears = [...new Set(logNatObs.map(o => o.dimensions?.TIME_PERIOD))].filter(Boolean).sort().reverse();
      const lastLogNat = logNatYears[0];
      const logNatF = o => o.dimensions?.TIME_PERIOD===lastLogNat && o.dimensions?.NOR==='_T' && o.dimensions?.NRG_SRC==='_T'
        && o.dimensions?.CARS==='_T' && o.dimensions?.BUILD_END==='_T' && o.dimensions?.CARPARK==='_T'
        && o.dimensions?.L_STAY==='_T' && o.dimensions?.TDW==='_T' && o.dimensions?.RP_MEASURE==='DWELLINGS';
      const logNatTotalArr = logNatObs.filter(o => logNatF(o) && o.dimensions?.OCS==='DW_MAIN' && o.dimensions?.TSH==='_T').sort((a,b)=>(b.measures?.OBS_VALUE_NIVEAU?.value||0)-(a.measures?.OBS_VALUE_NIVEAU?.value||0));
      const logNatPropriArr = logNatObs.filter(o => logNatF(o) && o.dimensions?.OCS==='DW_MAIN' && o.dimensions?.TSH==='100').sort((a,b)=>(b.measures?.OBS_VALUE_NIVEAU?.value||0)-(a.measures?.OBS_VALUE_NIVEAU?.value||0));
      const logNatVacArr = logNatObs.filter(o => logNatF(o) && o.dimensions?.OCS==='DW_VAC' && o.dimensions?.TSH==='_T').sort((a,b)=>(b.measures?.OBS_VALUE_NIVEAU?.value||0)-(a.measures?.OBS_VALUE_NIVEAU?.value||0));
      const logNatTotal = logNatTotalArr[0]?.measures?.OBS_VALUE_NIVEAU?.value || null;
      const logNatPropri = logNatPropriArr[0]?.measures?.OBS_VALUE_NIVEAU?.value || null;
      const logNatVac = logNatVacArr[0]?.measures?.OBS_VALUE_NIVEAU?.value || null;
      const pctPropriNat = (logNatTotal && logNatPropri) ? Math.round(logNatPropri/logNatTotal*100) : null;
      const pctVacNat = (logNatTotal && logNatVac) ? Math.round(logNatVac/(logNatTotal+logNatVac)*100) : null;

      // ── Données nationales ménages ──
      const AGE_GRAN = ['Y15T24','Y25T39','Y40T54','Y55T64','Y65T79','Y_GE80'];
      const menNatObs = dMenNat?.observations || [];
      const menNatYears = [...new Set(menNatObs.map(o=>o.dimensions?.TIME_PERIOD))].filter(Boolean).sort().reverse();
      const lastMenNat = menNatYears[0];
      // Utiliser le même code GEO que logNatTotal pour cohérence (évite double-comptage FRANCE-F + FRANCE-FM)
      const primaryNatGeo = logNatTotalArr[0]?.dimensions?.GEO || null;
      const seulsNatObs = menNatObs.filter(o => o.dimensions?.TIME_PERIOD===lastMenNat && o.dimensions?.NOC==='P1'
        && o.dimensions?.RP_MEASURE==='ONEPERS' && o.dimensions?.OCS==='DW_MAIN'
        && o.dimensions?.CIVIL_STATUS==='_T' && o.dimensions?.COUPLE==='_T'
        && (!primaryNatGeo || o.dimensions?.GEO===primaryNatGeo)
        && AGE_GRAN.includes(o.dimensions?.AGE));
      const nbSeulsNat = seulsNatObs.reduce((s,o)=>s+(o.measures?.OBS_VALUE_NIVEAU?.value||0),0);
      const pctSeulsNat = (logNatTotal && nbSeulsNat) ? Math.round(nbSeulsNat/logNatTotal*100) : null;

      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).json({
        success: true,
        economie: {
          revenuMedian, tauxPauvrete, tauxChomage, anneeFilosofi, anneeEmploi,
          nbActifs: nbActifs ? Math.round(nbActifs) : null,
          pctPropri, pctLocataires, nbResidPrinc, nbVacants, anneeLogement,
          pctSeuls,
          pctBac5, pctLicence, pctBts, pctBac, pctCapBep, pctBrevet, pctSansDip, anneeDiplomes
        },
        melodiNational: { revenuMedian: revenuMedianNat, tauxChomage: tauxChomageNat, anneeFilosofi: anneeFilosofiNat, anneeEmploi: anneeEmploiNat, pctPropri: pctPropriNat, pctVac: pctVacNat, pctSeuls: pctSeulsNat }
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
