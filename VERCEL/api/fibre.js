// ══ VERCEL FUNCTION : FIBRE ARCEP ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { lat, lon, codeInsee } = req.query;

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    let eligible = null, technologie = null, operateurs = [];

    try {
      // Dataset déploiement réseaux fixes par commune (ARCEP)
      const deployUrl = `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/observatoire_du_deploiement_des_reseaux_fixes_par_commune/records?where=codecommune%3D%22${codeInsee}%22&limit=1`;
      const deployRes = await fetch(deployUrl, { signal: AbortSignal.timeout(5000) });
      if (deployRes.ok) {
        const deployData = await deployRes.json();
        if (deployData.results?.[0]) {
          const record = deployData.results[0];
          const tauxFtth = record.taux_ftth ?? record.tx_couv_fibre ?? null;
          eligible = tauxFtth !== null ? tauxFtth > 50 : null;
          technologie = eligible ? 'FTTH' : (eligible === false ? 'ADSL/VDSL' : null);
        }
      }
    } catch { /* silencieux */ }

    if (eligible === null) {
      const dept = codeInsee?.substring(0, 2);
      if (['75', '92', '93', '94'].includes(dept)) { eligible = true; technologie = 'FTTH'; operateurs = ['Orange', 'SFR', 'Free', 'Bouygues']; }
      else if (['01','02','03','06','10','11','13','14','16','17','18','21','22','24','25','26','27','28','29','30','31','33','34','35','37','38','40','41','42','44','45','49','51','53','54','56','57','59','60','62','63','67','68','69','71','72','74','76','77','78','79','80','83','84','85','86','87','91','95'].includes(dept)) { eligible = true; technologie = 'FTTH'; operateurs = ['Orange', 'SFR', 'Free']; }
    }

    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({
      success: true,
      fibre: { eligible, technologie: technologie || 'Non déterminé', operateurs, lienVerification: `https://maconnexioninternet.arcep.fr/?lat=${lat}&lon=${lon}` },
      note: 'Vérification précise sur maconnexioninternet.arcep.fr',
      source: 'ARCEP', dateExtraction: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
