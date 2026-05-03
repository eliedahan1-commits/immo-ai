// ══ VERCEL FUNCTION : MÉTÉO ══
// Ensoleillement : NASA POWER satellite (CERES, précis) + fallback Météo-France normals
// Température + précipitations + jours de pluie : open-meteo ERA5

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
    // ── 1. NASA POWER : ensoleillement satellite (2001-2020) ──
    let sunshineHours = null, sunshineSource = 'NASA POWER · Satellite CERES';
    try {
      const nr = await fetch(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN&community=SB&longitude=${lon}&latitude=${lat}&format=JSON`,{signal:AbortSignal.timeout(10000)});
      if(nr.ok){
        const nd = await nr.json();
        const allsky = nd.properties?.parameter?.ALLSKY_SFC_SW_DWN;
        const clrsky = nd.properties?.parameter?.CLRSKY_SFC_SW_DWN;
        if(allsky&&clrsky){
          let total=0;
          for(let m=0;m<12;m++){
            const k=String(m+1).padStart(2,'0');
            const frac=clrsky[k]>0?Math.min(allsky[k]/clrsky[k],1):0;
            total+=frac*daylightHours(lat,m)*DAYS[m];
          }
          sunshineHours=Math.round(total);
        }
      }
    } catch {}

    // ── Fallback table Météo-France si NASA échoue ──
    if(!sunshineHours){
      const REF=[[48.85,2.35,1662],[45.75,4.85,2054],[43.30,5.38,2858],[43.71,7.26,2724],[44.84,-0.58,1985],[43.60,1.44,2046],[48.57,7.75,1693],[47.22,-1.55,1921],[48.39,-4.49,1494],[50.63,3.06,1494],[48.11,-1.68,1726],[45.19,5.72,1997],[43.61,3.87,2723],[45.45,-0.32,1936],[47.32,5.04,1820],[49.44,1.10,1635],[43.84,-0.50,2088],[45.78,3.08,1843]];
      let best=REF[0],minD=Infinity;
      REF.forEach(r=>{const d=Math.hypot(r[0]-lat,r[1]-lon);if(d<minD){minD=d;best=r;}});
      sunshineHours=best[2];
      sunshineSource='Normales Météo-France 1991-2020 (ville de référence la plus proche)';
    }

    // ── 2. open-meteo : température + précipitations ──
    const START_DATE = '2019-01-01';
    const END_DATE   = '2023-12-31';
    const periode    = `${START_DATE.slice(0,4)}-${END_DATE.slice(0,4)}`;
    const mr = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${START_DATE}&end_date=${END_DATE}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FParis`,{signal:AbortSignal.timeout(12000)});
    if(!mr.ok) throw new Error('open-meteo '+mr.status);
    const daily = (await mr.json()).daily;

    const tempMax = (daily.temperature_2m_max||[]).filter(t=>t!==null);
    const tempMin = (daily.temperature_2m_min||[]).filter(t=>t!==null);
    const precip  = (daily.precipitation_sum||[]).filter(p=>p!==null);

    const avgMax = tempMax.length?Math.round(tempMax.reduce((a,b)=>a+b,0)/tempMax.length*10)/10:null;
    const avgMin = tempMin.length?Math.round(tempMin.reduce((a,b)=>a+b,0)/tempMin.length*10)/10:null;
    const joursPluis = Math.round(precip.filter(p=>p>=1).length/5);
    const annualPrecip = precip.length?Math.round(precip.reduce((a,b)=>a+b,0)/5):null;

    const label = sunshineHours>2500?'Très ensoleillé':sunshineHours>2000?'Ensoleillé':sunshineHours>1700?'Moyennement ensoleillé':'Peu ensoleillé';

    res.setHeader('Cache-Control','public, max-age=2592000');
    return res.status(200).json({
      success:true,
      ensoleillement:{heuresAnnuelles:sunshineHours,label},
      temperatures:{maxMoyenne:avgMax,minMoyenne:avgMin},
      precipitations:{annuellesMm:annualPrecip,joursParAn:joursPluis},
      periode,
      source:`Ensoleillement : ${sunshineSource} · Températures & pluie : open-meteo ERA5`,
      dateExtraction:new Date().toISOString()
    });
  } catch(error){
    return res.status(500).json({success:false,error:error.message});
  }
}
