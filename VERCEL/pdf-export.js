// ══ TOAST ══
function toast(msg, type='ok', dur=3200){
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), dur);
}

// ══ PDF EXPORT ══
function generatePDF(){
  try {
  if(!window.jspdf){ toast('jsPDF non chargé','err'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W=210, H=297, ML=14, MR=14, MT=15, CW=W-ML-MR;
  let y = MT;

  const safeRect=(x,y,w,h,s)=>{ if(!isFinite(x)||!isFinite(y)||w<=0||h<=0)return; doc.rect(Math.round(x*10)/10,Math.round(y*10)/10,Math.round(w*10)/10,Math.round(h*10)/10,s); };
  const safeRRect=(x,y,w,h,r,s)=>{ if(!isFinite(x)||!isFinite(y)||w<=0||h<=0)return; const rr=Math.min(r,w/2-.1,h/2-.1); if(rr<=0){safeRect(x,y,w,h,s);return;} doc.roundedRect(Math.round(x*10)/10,Math.round(y*10)/10,Math.round(w*10)/10,Math.round(h*10)/10,rr,rr,s); };
  const cleanSpaces=s=>String(s||'').replace(/[     ⁠]/g,' ');
  const fmt=n=>cleanSpaces(Number(n).toLocaleString('fr-FR'));
  const np=(n=20)=>{ if(y+n>H-12){doc.addPage();y=MT;} };
  const strip=s=>{
    if(!s) return '';
    return cleanSpaces(String(s)
      .replace(/<[^>]+>/g,'')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x2019;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ')
      .replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F000}-\u{1F02F}]/gu,'')
      .trim());
  };

  function hexRgb(hex){ hex=hex.replace('#',''); return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)]; }

  const secBar=(title,color)=>{
    np(12);
    doc.setFillColor(...hexRgb(color||'#b8832a'));
    safeRect(ML,y,CW,8,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(255,255,255);
    doc.text(strip(title).toUpperCase(), ML+3, y+5.5);
    y+=11;
  };
  const kv=(label,val,dot)=>{
    np(7);
    const dotColor = dot==='G'?[39,174,96]:dot==='O'?[243,156,18]:dot==='R'?[231,76,60]:null;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(90,85,75);
    doc.text(strip(label), ML+4, y);
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(26,22,16);
    const valLines = doc.splitTextToSize(strip(val), CW-25);
    doc.text(valLines[0]||'', W-MR-3, y, {align:'right'});
    if(dotColor){ doc.setFillColor(...dotColor); doc.circle(W-MR+2, y-1.2, 1.3,'F'); }
    y+=5.5;
  };
  const divider=()=>{ np(5); doc.setDrawColor(220,205,175); doc.setLineWidth(.2); doc.line(ML,y,W-MR,y); y+=4; };

  // ══ EN-TETE ══
  doc.setFillColor(26,22,16); safeRect(0,0,W,52,'F');
  doc.setFillColor(184,131,42); safeRect(0,51,W,1.5,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(24); doc.setTextColor(184,131,42);
  doc.text('Immo',17,34);
  doc.setFillColor(184,131,42); safeRRect(54,22,20,12,2,'F');
  doc.setFontSize(13); doc.setTextColor(26,22,16); doc.text('AI',64,30.5,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(220,205,175);
  doc.text("Rapport d'analyse du quartier", 17, 46);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(160,140,100);
  const dateStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  doc.text(dateStr, W-MR, 46, {align:'right'});

  y=60;
  const addr=strip(window.currentAddress||'Adresse non renseignée');
  const ins=window._inseeData?.commune;
  doc.setFillColor(249,245,238); safeRRect(ML,y-3,CW,18,3,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(26,22,16);
  const addrLines=doc.splitTextToSize(addr, CW-10);
  doc.text(addrLines, ML+5, y+4);
  if(ins?.nom){ doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(100,85,55); doc.text(strip(ins.nom+(ins.departement?' - Dép. '+ins.departement:'')), ML+5, y+14); }
  y+=24;

  // ══ SCORE GLOBAL ══
  const sd=window._scoreData;
  if(sd){
    const note=sd.note||0;
    const ringCol=note>=7?[39,174,96]:note>=5?[243,156,18]:[231,76,60];
    const label=strip(sd.label||'');
    doc.setDrawColor(...ringCol); doc.setLineWidth(2.5);
    doc.circle(ML+12,y+10,10,'S');
    doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...ringCol);
    doc.text(note.toFixed(1), ML+12, y+11.5,{align:'center'});
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(130,110,80);
    doc.text('/10', ML+12, y+14,{align:'center'});
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...ringCol);
    doc.text(label, ML+26, y+11);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,100,70);
    doc.text((sd.items?.length||0)+' critères analysés - données temps réel à l\'adresse', ML+26, y+17);
    y+=26;
  }

  divider();

  // ══ NARRATIF ══
  const narratifParts = window._narratifParts || [];
  if(narratifParts.length){
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(184,131,42);
    doc.text('Portrait du quartier', ML+3, y); y+=6;
    narratifParts.forEach(p=>{
      np(10);
      const txt = '- ' + strip(p);
      const lines = doc.splitTextToSize(txt, CW-6);
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(50,45,35);
      doc.text(lines, ML+3, y);
      y += lines.length * 4.8 + 2;
    });
    y+=3;
    divider();
  }

  // ══ SECTIONS — données identiques aux cartes ══
  const G='G', O='O', R='R';
  const mel=window._melodiData, nat=window._melodiNational, dvf=window._dvfData, dept=window._dvfDeptData;
  const mob=window._mobiliteData, svc=window._servicesData, eco2=window._ecolesData;
  const meteo=window._meteoData, bruit=window._bruitData, fibre=window._fibreData;
  const risques=window._risquesData, demo=window._demographieData, aq=window._qualiteAirData;
  const loyers=window._loyersData;

  // ── Marché immobilier ──
  secBar('Marché immobilier','#b8832a');
  if(dvf?.stats?.medianM2) kv('Prix médian m²', fmt(dvf.stats.medianM2)+' €/m²', null);
  if(dvf?.stats?.medianM2&&dept?.medianM2){
    const dD=Math.round((dvf.stats.medianM2-dept.medianM2)/dept.medianM2*100);
    kv('vs département', (dD>=0?'+':'')+dD+'% ('+(dD>=0?'au-dessus':'en dessous')+')', dD<=-20?G:dD<=10?O:R);
  }
  if(dvf?.count) kv('Transactions analysées', dvf.count+' ventes', null);
  if(loyers?.estLoyer?.T2) kv('Loyer estimé T2', fmt(loyers.estLoyer.T2)+' €/mois', null);
  if(mel?.revenuMedian&&dvf?.stats?.medianM2){
    const ef=Math.round(dvf.stats.medianM2*50/(mel.revenuMedian/12));
    kv("Effort d'achat 50m²", ef+' mois de revenu médian', ef<60?G:ef<180?O:R);
  }
  y+=3;

  // ── Population & économie ──
  secBar('Population & économie','#2980b9');
  if(ins?.population) kv('Habitants', fmt(ins.population), null);
  if(ins?.densite){
    const densLbl=ins.densite>10000?'Très dense':ins.densite>5000?'Dense':ins.densite>2000?'Urbaine':'Péri-urbaine';
    kv('Densité', fmt(ins.densite)+' hab/km² · '+densLbl, null);
  }
  if(mel?.revenuMedian){
    const revM=Math.round(mel.revenuMedian/12);
    const dR=nat?.revenuMedian?Math.round((mel.revenuMedian-nat.revenuMedian)/nat.revenuMedian*100):null;
    kv('Revenu médian net'+(mel.anneeFilosofi?' '+mel.anneeFilosofi:''), fmt(revM)+' €/mois'+(dR!=null?' ('+(dR>=0?'+':'')+dR+'% nat.)':''), dR==null?null:dR>=20?G:dR>=-10?O:R);
  }
  if(mel?.tauxChomage!=null){
    const dC=nat?.tauxChomage!=null?Math.round((mel.tauxChomage-nat.tauxChomage)*10)/10:null;
    kv('Chômage'+(mel.anneeEmploi?' '+mel.anneeEmploi:''), mel.tauxChomage+'% '+(dC!=null?'('+(dC>=0?'+':'')+dC+'pt nat.)':''), dC==null?null:dC<=-1?G:dC<=1?O:R);
  }
  if(mel?.pctBac5!=null){
    kv('Bac+5 et +'+(mel.anneeDiplomes?' '+mel.anneeDiplomes:''), mel.pctBac5+'%'+(nat?.pctBac5Nat!=null?' (nat. '+nat.pctBac5Nat+'%)':''), mel.pctBac5>=30?G:mel.pctBac5>=15?O:R);
  }
  y+=3;

  // ── Cadre de vie ──
  secBar('Cadre de vie','#27ae60');
  if(meteo?.ensoleillement?.heuresAnnuelles){
    const h=meteo.ensoleillement.heuresAnnuelles;
    kv('Ensoleillement', fmt(h)+' h/an · '+strip(meteo.ensoleillement.label||''), h>1800?G:h>1300?O:R);
  }
  if(meteo?.temperatures?.maxMoyenne) kv('Températures', 'Max moy. '+meteo.temperatures.maxMoyenne+'°C / Min '+meteo.temperatures.minMoyenne+'°C', null);
  if(bruit?.niveauCode){
    const sc=Math.min((bruit.score||0)+(ins?.densite>10000?4:ins?.densite>5000?3:ins?.densite>2000?2:ins?.densite>500?1:0),10);
    const bonus=ins?.densite>10000?4:ins?.densite>5000?3:ins?.densite>2000?2:ins?.densite>500?1:0;
    kv('Bruit estimé', (sc>=7?'Élevé':sc>=4?'Modéré':'Faible')+(bonus>0?' (densité +'+bonus+'pts)':''), sc<=3?G:sc<=6?O:R);
  }
  if(aq?.aqi) kv("Qualité de l'air", 'AQI '+aq.aqi+' · '+strip(aq.label||''), aq.aqi<=30?G:aq.aqi<=60?O:R);
  if(risques?.total!=null) kv('Risques naturels', risques.total+' risque(s) · Score '+risques.score, risques.total===0?G:risques.total<=2?O:R);
  // Sécurité criminalité
  const cr=window._criminaliteData;
  if(cr&&cr.success&&cr.indicateurs){
    function nSc(v){return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');}
    const REF=[['vol sans violence',11],['vol avec violence',2.5],['violences physiques',9],['cambriolage',3.5],['vehicule',2.8],['escroquerie',6],['destruction',8],['stupefiants',4],['homicide',0.03]];
    function nRef(i){var l=nSc(i);for(var j=0;j<REF.length;j++)if(l.indexOf(REF[j][0])>=0)return REF[j][1];return null;}
    var rs=0,rc=0;
    Object.entries(cr.indicateurs).forEach(function(e){var r=nRef(e[0]);if(r&&r>0&&e[1].taux!=null){rs+=e[1].taux/r;rc++;}});
    if(rc>0){var avg=rs/rc;var sc2=Math.max(1,Math.min(10,Math.round(10*(2-Math.min(avg,2))/2)));kv('Sécurité (criminalité)','Risque '+(sc2>=7?'faible':sc2>=4?'modéré':'élevé')+' · score '+sc2+'/10',sc2>=7?G:sc2>=4?O:R);}
  }
  y+=3;

  // ── Mobilité & services ──
  secBar('Mobilité & services','#8e44ad');
  if(mob?.score) kv('Score mobilité', mob.score+'/10 · '+strip(mob.scoreLabel||''), mob.score>=7?G:mob.score>=5?O:R);
  if(mob?.stats){
    const st=mob.stats, p=[];
    if(st.metro>0) p.push(st.metro+' métro/RER');
    if(st.trams>0) p.push(st.trams+' tram');
    if(st.arretsBus>0) p.push(st.arretsBus+' bus');
    if(p.length) kv('Transports', p.join(' · '), null);
  }
  if(svc?.total) kv('Services & commerces', (svc.sante||0)+' santé · '+(svc.commerces||0)+' commerces · '+(svc.autres||0)+' services', svc.total>50?G:svc.total>20?O:R);
  if(eco2?.total) kv('Établissements scolaires', eco2.total+' établ. · '+(eco2.types?.ecoles||0)+' éc. · '+(eco2.types?.college||0)+' coll. · '+(eco2.types?.lycee||0)+' lyc.', eco2.total>=5?G:eco2.total>=2?O:R);
  if(fibre?.fibre?.eligible!=null){
    const ops=fibre.fibre.operateurs?.length?' · '+fibre.fibre.operateurs.slice(0,3).join(', '):'';
    kv('Fibre FTTH', (fibre.fibre.eligible?'Éligible':'Non éligible')+ops, fibre.fibre.eligible?G:R);
  }
  y+=3;

  // ── Logement ──
  secBar('Logement','#e67e22');
  if(mel?.pctPropri!=null){
    const dP=nat?.pctPropri!=null?Math.round(mel.pctPropri-nat.pctPropri):null;
    kv('Propriétaires'+(mel.anneeLogement?' '+mel.anneeLogement:''), mel.pctPropri+'%'+(dP!=null?' ('+(dP>=0?'+':'')+dP+'pt nat.)':''), dP==null?null:dP>=5?G:dP>=-5?O:R);
  }
  if(mel?.nbVacants!=null&&mel?.nbResidPrinc){
    const pV=Math.round(mel.nbVacants/(mel.nbResidPrinc+mel.nbVacants)*100);
    const dV=nat?.pctVac!=null?Math.round(pV-nat.pctVac):null;
    kv('Logements vacants'+(mel.anneeLogement?' '+mel.anneeLogement:''), pV+'%'+(dV!=null?' ('+(dV>=0?'+':'')+dV+'pt nat.)':''), pV<=5?R:pV<=10?O:G);
  }
  if(mel?.nbResidPrinc) kv('Résidences principales', fmt(mel.nbResidPrinc), null);
  if(mel?.pctSeuls!=null){
    const dSe=nat?.pctSeuls!=null?Math.round(mel.pctSeuls-nat.pctSeuls):null;
    kv('Ménages seuls'+(mel.anneeLogement?' '+mel.anneeLogement:''), mel.pctSeuls+'%'+(dSe!=null?' ('+(dSe>=0?'+':'')+dSe+'pt nat.)':''), null);
  }
  y+=3;

  // ── Dynamisme ──
  secBar('Dynamisme','#1abc9c');
  if(demo?.rows?.length>=2){
    const r=demo.rows;
    const ev=((r[r.length-1].pop-r[0].pop)/r[0].pop*100).toFixed(1);
    kv('Évolution population', (ev>=0?'+':'')+ev+'% ('+r[0].year+'→'+r[r.length-1].year+')', ev>2?G:ev>=-1?O:R);
  }
  if(mel?.pyramideAges){
    const pyr=mel.pyramideAges;
    const tot=Object.values(pyr).reduce((s,v)=>s+v,0);
    if(tot>0){
      const yj=Math.round(((pyr.Y_LT15||0)+(pyr.Y15T24||0))/tot*100);
      const se=Math.round(((pyr.Y65T79||0)+(pyr.Y_GE80||0))/tot*100);
      const ac=Math.round(((pyr.Y25T39||0)+(pyr.Y40T54||0)+(pyr.Y55T64||0))/tot*100);
      kv('Profil démographique', 'Jeunes '+yj+'% · Actifs '+ac+'% · Seniors '+se+'%', null);
    }
  }
  if(mel?.pctMigArrivals!=null) kv('Renouvellement résidentiel', mel.pctMigArrivals+'% d\'arrivants'+(mel.migAnnee?' '+mel.migAnnee:''), mel.pctMigArrivals>25?G:mel.pctMigArrivals>15?O:R);
  y+=3;

  divider();

  // ══ SCORES PAR CARTE ══
  if(sd?.items?.length){
    np(12);
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(184,131,42);
    doc.text('Détail des scores', ML+3, y); y+=7;
    [...sd.items].sort((a,b)=>b.val-a.val).forEach(item=>{
      np(8);
      const pct=Math.round(item.val/item.max*100);
      const col=pct>=70?[39,174,96]:pct>=45?[243,156,18]:[231,76,60];
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(70,65,55);
      doc.text(strip(item.label), ML+3, y);
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...col);
      doc.text(item.val.toFixed(1)+'/10', W-MR-3, y, {align:'right'});
      doc.setFillColor(230,220,205); safeRect(ML+3,y+1,CW-6,2,'F');
      doc.setFillColor(...col); safeRect(ML+3,y+1,Math.round((CW-6)*pct/100),2,'F');
      if(item.sub){doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(140,120,90);doc.text(strip(item.sub),ML+3,y+5);}
      y+=item.sub?9:7;
    });
  }

  // ══ PIED DE PAGE ══
  const pageCount=doc.getNumberOfPages();
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i);
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(160,140,110);
    doc.text('IMMO-AI - Sources : DVF DGFiP - INSEE Melodi - Géorisques - OSM - ARCEP - Open-Meteo', ML, H-8);
    doc.text(i+'/'+pageCount, W-MR, H-8, {align:'right'});
    doc.setDrawColor(184,131,42); doc.setLineWidth(.4); doc.line(ML,H-10,W-MR,H-10);
  }

  // ══ SAUVEGARDE ══
  const nomFich='ImmoAI_'+(ins?.nom||'rapport').replace(/\s+/g,'_')+'_'+new Date().toLocaleDateString('fr-FR').replace(/\//g,'-')+'.pdf';
  doc.save(nomFich);
  toast('PDF généré : '+nomFich,'ok');
  } catch(e){ toast('Erreur PDF : '+e.message,'err'); console.error(e); }
}
