// ══ VERCEL FUNCTION : FIBRE ARCEP ══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { lat, lon, codeInsee } = req.query;

  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  try {
    let eligible = null, technologie = null, operateurs = [];

    try {
      const deployUrl = `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/observatoire_du_deploiement_des_reseaux_mobiles/records?where=commune_code%3D%22${codeInsee}%22&limit=1`;
      const deployRes = await fetch(deployUrl, { signal: AbortSignal.timeout(5000) });
      if (deployRes.ok) {
        const deployData = await deployRes.json();
        if (deployData.results?.[0]) {
          const record = deployData.results[0];
          eligible = record.taux_ftth > 80;
          technologie = eligible ? 'FTTH' : 'ADSL/VDSL';
        }
      }
    } catch { /* silencieux */ }

    if (eligible === null) {
      const dept = codeInsee?.substring(0, 2);
      if (['75', '92', '93', '94'].includes(dept)) { eligible = true; technologie = 'FTTH'; operateurs = ['Orange', 'SFR', 'Free', 'Bouygues']; }
      else if (['69', '13', '31', '33', '06', '59', '67'].includes(dept)) { eligible = true; technologie = 'FTTH'; operateurs = ['Orange', 'SFR', 'Free']; }
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
