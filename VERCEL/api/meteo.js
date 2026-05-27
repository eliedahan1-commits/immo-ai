// ══ VERCEL FUNCTION : MÉTÉO ══
// Source unique : NASA POWER satellite (CERES)
// Ensoleillement + Températures + Précipitations — normales climatologiques 1994-2023

function daylightHours(lat, month) {
  const midDay = [15,46,75,105,135,162,198,228,259,289,319,344];
  const decl = 23.45 * Math.sin((360/365)*(284+midDay[month])*Math.PI/180);
  const cosH = -Math.tan(lat*Math.PI/180)*Math.tan(decl*Math.PI/180);
  if(cosH>=1) return 0; if(cosH<=-1) return 24;
  return (24/Math.PI)*Math.acos(cosH);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if(!lat||!lon) return res.status(400).json({error:'lat et lon requis'});

  const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

  try {
    // ── NASA POWER : ensoleillement + températures + précipitations (climatologie) ──
    const nasaUrl = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN,T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
    const nasaResp = await fetch(nasaUrl, {signal: AbortSignal.timeout(12000)});
    if(!nasaResp.ok) throw new Error('NASA POWER ' + nasaResp.status);
    const nd = await nasaResp.json();
    const param = nd.properties?.parameter;
    if(!param) throw new Error('NASA POWER: no data');

    // ── Ensoleillement ──
    let sunshineHours = null, sunshineSource = 'NASA POWER · Satellite CERES';
    const allsky = param.ALLSKY_SFC_SW_DWN;
    const clrsky = param.CLRSKY_SFC_SW_DWN;
    if(allsky && clrsky) {
      let total = 0;
      for(let m=0; m<12; m++) {
        const k = String(m+1).padStart(2,'0');
        const frac = clrsky[k]>0 ? Math.min(allsky[k]/clrsky[k], 1) : 0;
        total += frac * daylightHours(lat, m) * DAYS[m];
      }
      sunshineHours = Math.round(total);
    }

    // ── Fallback ensoleillement si NASA échoue ──
    if(!sunshineHours) {
      const REF=[[48.85,2.35,1662],[45.75,4.85,2054],[43.30,5.38,2858],[43.71,7.26,2724],[44.84,-0.58,1985],[43.60,1.44,2046],[48.57,7.75,1693],[47.22,-1.55,1921],[48.39,-4.49,1494],[50.63,3.06,1494],[48.11,-1.68,1726],[45.19,5.72,1997],[43.61,3.87,2723],[45.45,-0.32,1936],[47.32,5.04,1820],[49.44,1.10,1635],[43.84,-0.50,2088],[45.78,3.08,1843]];
      let best=REF[0], minD=Infinity;
      REF.forEach(r=>{const d=Math.hypot(r[0]-lat,r[1]-lon);if(d<minD){minD=d;best=r;}});
      sunshineHours = best[2];
      sunshineSource = 'Normales Météo-France 1991-2020 (ville de référence la plus proche)';
    }

    // ── Températures (moyennes mensuelles climatologiques) ──
    let avgMax = null, avgMin = null;
    const tMax = param.T2M_MAX;
    const tMin = param.T2M_MIN;
    if(tMax && tMin) {
      const mKeys = ['01','02','03','04','05','06','07','08','09','10','11','12'];
      const maxVals = mKeys.map(k => tMax[k]).filter(v => v != null && v > -900);
      const minVals = mKeys.map(k => tMin[k]).filter(v => v != null && v > -900);
      if(maxVals.length) avgMax = Math.round(maxVals.reduce((a,b)=>a+b,0)/maxVals.length * 10) / 10;
      if(minVals.length) avgMin = Math.round(minVals.reduce((a,b)=>a+b,0)/minVals.length * 10) / 10;
    }

    // ── Précipitations ──
    let annualPrecip = null, joursPluis = null;
    const precip = param.PRECTOTCORR;
    if(precip) {
      let totalMm = 0;
      let totalDays = 0;
      for(let m=0; m<12; m++) {
        const k = String(m+1).padStart(2,'0');
        const mmPerDay = precip[k];
        if(mmPerDay != null && mmPerDay > -900) {
          totalMm  += mmPerDay * DAYS[m];
          // Jours de pluie : estimation (seuil ~1mm/jour)
          totalDays += mmPerDay >= 1 ? DAYS[m] : Math.round(DAYS[m] * mmPerDay);
        }
      }
      annualPrecip = totalMm > 0 ? Math.round(totalMm) : null;
      joursPluis   = totalDays > 0 ? Math.round(totalDays) : null;
    }

    // ── Fallback Open-Meteo Archive si NASA ne retourne pas les températures/précip ──
    if(avgMax == null || avgMin == null || annualPrecip == null || joursPluis == null) {
      try {
        const endY = new Date().getFullYear()-1, startY = endY-2;
        const omUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startY}-01-01&end_date=${endY}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FParis`;
        const omR = await fetch(omUrl, { signal: AbortSignal.timeout(8000) });
        if(omR.ok) {
          const omd = await omR.json();
          const times = omd.daily?.time || [];
          const omTMax = omd.daily?.temperature_2m_max || [];
          const omTMin = omd.daily?.temperature_2m_min || [];
          const omPrec = omd.daily?.precipitation_sum || [];
          if(times.length) {
            const mSumMax = Array(12).fill(0), mSumMin = Array(12).fill(0), mCnt = Array(12).fill(0);
            const mPrec = Array(12).fill(0), mDays = Array(12).fill(0);
            times.forEach((t, i) => {
              const m = parseInt(t.slice(5,7)) - 1;
              if(omTMax[i] != null) { mSumMax[m] += omTMax[i]; mCnt[m]++; }
              if(omTMin[i] != null) mSumMin[m] += omTMin[i];
              if(omPrec[i] != null) { mPrec[m] += omPrec[i]; if(omPrec[i] >= 1) mDays[m]++; }
            });
            if(avgMax == null && mCnt.some(c => c > 0)) {
              const mx = mSumMax.map((s,i) => mCnt[i] ? s/mCnt[i] : null).filter(v => v != null);
              avgMax = Math.round(mx.reduce((a,b)=>a+b,0)/mx.length * 10) / 10;
            }
            if(avgMin == null && mCnt.some(c => c > 0)) {
              const mn = mSumMin.map((s,i) => mCnt[i] ? s/mCnt[i] : null).filter(v => v != null);
              avgMin = Math.round(mn.reduce((a,b)=>a+b,0)/mn.length * 10) / 10;
            }
            if(annualPrecip == null || joursPluis == null) {
              const nYears = endY - startY + 1;
              annualPrecip = Math.round(mPrec.reduce((a,b)=>a+b,0) / nYears);
              joursPluis   = Math.round(mDays.reduce((a,b)=>a+b,0) / nYears);
            }
          }
        }
      } catch(e2) { /* fallback silencieux */ }
    }

    const label = sunshineHours>2500?'Très ensoleillé':sunshineHours>2000?'Ensoleillé':sunshineHours>1700?'Moyennement ensoleillé':'Peu ensoleillé';
    const periode = 'Normales climatologiques 1994-2023';

    res.setHeader('Cache-Control','public, max-age=2592000');
    return res.status(200).json({
      success: true,
      ensoleillement: {heuresAnnuelles: sunshineHours, label},
      temperatures:   {maxMoyenne: avgMax, minMoyenne: avgMin},
      precipitations: {annuellesMm: annualPrecip, joursParAn: joursPluis},
      periode,
      source: `Ensoleillement, températures & précipitations : ${sunshineSource}`,
      dateExtraction: new Date().toISOString()
    });
  } catch(error) {
    return res.status(500).json({success: false, error: error.message});
  }
}
