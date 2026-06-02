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
  const fmt=n=>Number(n).toLocaleString('fr-FR').replace(/[   ]/g,' ');
  const np=(n=20)=>{ if(y+n>H-12){doc.addPage();y=MT;} };
  const strip=s=>s ? String(s).replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x2019;/g,"'").replace(/&quot;/g,'"') : '';

  // ── Helpers contenu ──
  const secBar=(icon,title,color)=>{
    np(12);
    doc.setFillColor(...hexRgb(color||'#b8832a'));
    safeRect(ML,y,CW,8,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(255,255,255);
    doc.text((icon?icon+' ':'')+title.toUpperCase(), ML+3, y+5.5);
    y+=11;
  };
  const kv=(label,val,dot)=>{
    np(7);
    const dotColor = dot==='G'?[39,174,96]:dot==='O'?[243,156,18]:dot==='R'?[231,76,60]:null;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(90,85,75);
    doc.text(strip(label), ML+4, y);
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(26,22,16);
    doc.text(strip(val), W-MR-3, y, {align:'right'});
    if(dotColor){ doc.setFillColor(...dotColor); doc.circle(W-MR+2, y-1.2, 1.3,'F'); }
    y+=5.5;
  };
  const divider=()=>{ np(5); doc.setDrawColor(220,205,175); doc.setLineWidth(.2); doc.line(ML,y,W-MR,y); y+=4; };
  const textBlock=(lines,fs=8,color=[60,55,50])=>{
    np(lines.length*5);
    doc.setFont('helvetica','normal'); doc.setFontSize(fs); doc.setTextColor(...color);
    doc.text(lines, ML+3, y); y+=lines.length*(fs*.35+1.5)+2;
  };

  // hexRgb helper
  function hexRgb(hex){ hex=hex.replace('#',''); return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)]; }

  // ══ PAGE 1 : EN-TÊTE ══
  doc.setFillColor(26,22,16); safeRect(0,0,W,52,'F');
  doc.setFillColor(184,131,42); safeRect(0,51,W,1.5,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(24); doc.setTextColor(184,131,42);
  doc.text('Immo',17,34);
  doc.setFillColor(184,131,42); safeRRect(54,22,20,12,2,'F');
  doc.setFontSize(13); doc.setTextColor(26,22,16); doc.text('AI',64,30.5,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(220,205,175);
  doc.text("Rapport d'analyse du quartier", 17, 46);
  // Date
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(160,140,100);
  const dateStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  doc.text(dateStr, W-MR, 46, {align:'right'});

  y=60;
  // Adresse
  const addr=strip(window.currentAddress||'Adresse non renseignée');
  const ins=window._inseeData?.commune;
  doc.setFillColor(249,245,238); safeRRect(ML,y-3,CW,18,3,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(26,22,16);
  const addrLines=doc.splitTextToSize(addr, CW-10);
  doc.text(addrLines, ML+5, y+4);
  if(ins?.nom){ doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(100,85,55); doc.text(ins.nom+(ins.departement?' · Dép. '+ins.departement:''), ML+5, y+14); }
  y+=24;

  // ══ SCORE GLOBAL ══
  const sd=window._scoreData;
  if(sd){
    const note=sd.note||0;
    const ringCol=note>=7?[39,174,96]:note>=5?[243,156,18]:[231,76,60];
    const label=sd.label||'';
    // Cercle score
    doc.setDrawColor(...ringCol); doc.setLineWidth(2.5);
    doc.circle(ML+12,y+10,10,'S');
    doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...ringCol);
    doc.text(note.toFixed(1), ML+12, y+10+1.5,{align:'center'});
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(130,110,80);
    doc.text('/10', ML+12, y+14,{align:'center'});
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...ringCol);
    doc.text(label, ML+26, y+11);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,100,70);
    doc.text(sd.items?.length+' critères analysés · données temps réel à l\'adresse', ML+26, y+17);
    y+=26;
  }

  divider();

  // ══ NARRATIF ══
  const mel=window._melodiData, nat=window._melodiNational, dvf=window._dvfData, dept=window._dvfDeptData;
  const mob=window._mobiliteData, svc=window._servicesData, eco2=window._ecolesData;
  const meteo=window._meteoData, bruit=window._bruitData, fibre=window._fibreData;
  const risques=window._risquesData, demo=window._demographieData, aq=window._qualiteAirData;

  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(184,131,42);
  doc.text('Portrait du quartier', ML+3, y); y+=6;

  const narratifParts=[];
  if(ins?.population&&ins?.densite){
    const dl=ins.densite>10000?'très dense':ins.densite>5000?'dense':ins.densite>2000?'urbaine':'peu dense';
    narratifParts.push((ins.nom||'Cette commune')+' est une commune '+dl+' de '+fmt(ins.population)+' habitants'+(ins.superficie?' sur '+Math.round(ins.superficie)+' km²':'')+'.');
  }
  if(dvf?.stats?.medianM2){
    const dD=dept?.medianM2?Math.round((dvf.stats.medianM2-dept.medianM2)/dept.medianM2*100):null;
    const dN=Math.round((dvf.stats.medianM2-2800)/2800*100);
    const mktLbl=dvf.stats.medianM2>8000?'premium':dvf.stats.medianM2>5000?'tendu':'accessible';
    let s='Marché immobilier '+mktLbl+' : prix médian '+fmt(dvf.stats.medianM2)+' €/m²';
    if(dD!=null) s+=' ('+(dD>=0?'+':'')+dD+'% vs département, '+(dN>=0?'+':'')+dN+'% vs France)';
    if(dvf.count) s+=', '+dvf.count+' transactions';
    if(mel?.revenuMedian){ const eff=Math.round(dvf.stats.medianM2*50/(mel.revenuMedian/12)); s+='. Effort d\'achat : '+eff+' mois pour 50 m²'; }
    narratifParts.push(s+'.');
  }
  if(mel?.revenuMedian&&nat?.revenuMedian){
    const diff=Math.round((mel.revenuMedian-nat.revenuMedian)/nat.revenuMedian*100);
    let s='Économie : revenu médian '+fmt(Math.round(mel.revenuMedian/12))+' €/mois ('+(diff>=0?'+':'')+diff+'% vs nationale)';
    if(mel.tauxChomage!=null) s+=', chômage '+mel.tauxChomage+'%'+(nat.tauxChomage!=null?' (nat. '+nat.tauxChomage+'%)':'');
    if(mel.pctBac5!=null) s+='. Population '+(mel.pctBac5>=35?'très qualifiée':mel.pctBac5>=20?'qualifiée':'diversifiée')+' ('+mel.pctBac5+'% Bac+5)';
    narratifParts.push(s+'.');
  }
  if(mel?.pctPropri!=null){
    const pV=mel.nbVacants&&mel.nbResidPrinc?Math.round(mel.nbVacants/(mel.nbResidPrinc+mel.nbVacants)*100):null;
    let s='Logement : '+(mel.pctPropri>=60?'profil propriétaire':mel.pctPropri<40?'profil locataire':'profil mixte')+' ('+mel.pctPropri+'% propriétaires'+(nat?.pctPropri?', nat. '+nat.pctPropri+'%':'')+')';
    if(pV!=null) s+=', vacance '+pV+'% ('+(pV<=5?'très tendu':pV<=9?'tendu':'offre disponible')+')';
    narratifParts.push(s+'.');
  }
  const vParts=[];
  if(mob?.score) vParts.push('mobilité '+(mob.score>=8?'excellente':mob.score>=6?'bonne':'correcte')+' ('+mob.score+'/10)');
  if(meteo?.ensoleillement?.heuresAnnuelles) vParts.push('ensoleillement '+(meteo.ensoleillement.heuresAnnuelles>1800?'bon':meteo.ensoleillement.heuresAnnuelles>1300?'modéré':'faible')+' ('+fmt(meteo.ensoleillement.heuresAnnuelles)+' h/an)');
  if(aq?.aqi) vParts.push('qualité air '+(aq.aqi<=30?'bonne':aq.aqi<=60?'correcte':'préoccupante')+' (AQI '+aq.aqi+')');
  if(vParts.length) narratifParts.push('Cadre de vie : '+vParts.join(', ')+'.');
  if(risques?.total!=null){ let s='Risques : '+risques.total+' identifié(s)'; const cr=window._criminaliteData; if(cr?.success&&cr.indicateurs){function nS2(v){return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');}const RF2=[['vol sans violence',11],['vol avec violence',2.5],['violences physiques',9],['cambriolage',3.5],['vehicule',2.8],['escroquerie',6],['destruction',8],['stupefiants',4]];function nR2(i){var l=nS2(i);for(var j=0;j<RF2.length;j++)if(l.indexOf(RF2[j][0])>=0)return RF2[j][1];return null;}var rs4=0,rc4=0;Object.entries(cr.indicateurs).forEach(function(e){var r=nR2(e[0]);if(r&&r>0&&e[1].taux!=null){rs4+=e[1].taux/r;rc4++;}});if(rc4>0){var sc5=Math.max(1,Math.min(10,Math.round(10*(2-Math.min(rs4/rc4,2))/2)));s+=', sécurité risque '+(sc5>=7?'faible':sc5>=4?'modéré':'élevé')+' ('+sc5+'/10)';}} narratifParts.push(s+'.'); }

  narratifParts.forEach(p=>{
    np(10);
    const lines=doc.splitTextToSize('· '+p, CW-8);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(50,45,35);
    doc.text(lines, ML+3, y); y+=lines.length*5+1.5;
  });
  y+=3;

  // ══ 6 SECTIONS EN 2 COLONNES ══
  const colW=(CW-4)/2;
  const sections2=[
    { title:'Marché immobilier', icon:'💰', color:'#b8832a', rows:[] },
    { title:'Population & économie', icon:'👥', color:'#2980b9', rows:[] },
    { title:'Cadre de vie', icon:'🌤️', color:'#27ae60', rows:[] },
    { title:'Mobilité & services', icon:'🚇', color:'#8e44ad', rows:[] },
    { title:'Logement', icon:'🏠', color:'#e67e22', rows:[] },
    { title:'Dynamisme', icon:'📈', color:'#1abc9c', rows:[] },
  ];
  // Remplir les sections
  const s0=sections2[0].rows;
  if(dvf?.stats?.medianM2) s0.push(['Prix médian m²',fmt(dvf.stats.medianM2)+' €/m²',null]);
  if(dvf?.stats?.medianM2&&dept?.medianM2){const d=Math.round((dvf.stats.medianM2-dept.medianM2)/dept.medianM2*100);s0.push(['vs département',(d>=0?'+':'')+d+'%',d<=-20?'G':d<=10?'O':'R']);}
  if(dvf?.count) s0.push(['Transactions',dvf.count+' ventes',null]);
  if(mel?.revenuMedian&&dvf?.stats?.medianM2){const e=Math.round(dvf.stats.medianM2*50/(mel.revenuMedian/12));s0.push(['Effort achat 50m²',e+' mois',e<60?'G':e<180?'O':'R']);}

  const s1=sections2[1].rows;
  if(ins?.population) s1.push(['Habitants',fmt(ins.population),null]);
  if(ins?.densite) s1.push(['Densité',fmt(ins.densite)+' hab/km²',null]);
  if(mel?.revenuMedian){const d=nat?.revenuMedian?Math.round((mel.revenuMedian-nat.revenuMedian)/nat.revenuMedian*100):null;s1.push(['Revenu médian net',fmt(Math.round(mel.revenuMedian/12))+' €/mois'+(d!=null?' ('+(d>=0?'+':'')+d+'%)':''),d==null?null:d>=20?'G':d>=-10?'O':'R']);}
  if(mel?.tauxChomage!=null){const d=nat?.tauxChomage!=null?Math.round((mel.tauxChomage-nat.tauxChomage)*10)/10:null;s1.push(['Chômage',mel.tauxChomage+'%'+(d!=null?' ('+(d>=0?'+':'')+d+'pt)':''),d==null?null:d<=-1?'G':d<=1?'O':'R']);}
  if(mel?.pctBac5!=null) s1.push(['Bac+5 et +',mel.pctBac5+'%',mel.pctBac5>=30?'G':mel.pctBac5>=15?'O':'R']);

  const s2=sections2[2].rows;
  if(meteo?.ensoleillement?.heuresAnnuelles){const h=meteo.ensoleillement.heuresAnnuelles;s2.push(['Ensoleillement',fmt(h)+' h/an · '+meteo.ensoleillement.label,h>1800?'G':h>1300?'O':'R']);}
  if(meteo?.temperatures?.maxMoyenne) s2.push(['Températures','Max '+meteo.temperatures.maxMoyenne+'°C / Min '+meteo.temperatures.minMoyenne+'°C',null]);
  if(bruit?.niveauCode){const sc=Math.min((bruit.score||0)+(ins?.densite>10000?4:ins?.densite>5000?3:ins?.densite>2000?2:1),10);s2.push(['Bruit estimé',sc>=7?'Élevé':sc>=4?'Modéré':'Faible',sc<=3?'G':sc<=6?'O':'R']);}
  if(aq?.aqi) s2.push(['Qualité de l\'air','AQI '+aq.aqi+' · '+(aq.label||''),aq.aqi<=30?'G':aq.aqi<=60?'O':'R']);
  if(risques?.total!=null) s2.push(['Risques naturels',risques.total+' risque(s)',risques.total===0?'G':risques.total<=2?'O':'R']);

  const s3=sections2[3].rows;
  if(mob?.score) s3.push(['Score mobilité',mob.score+'/10',mob.score>=7?'G':mob.score>=5?'O':'R']);
  if(mob?.stats){const st=mob.stats,p=[];if(st.metro>0)p.push(st.metro+' métro/RER');if(st.arretsBus>0)p.push(st.arretsBus+' bus');if(p.length)s3.push(['Transports',p.join(' · '),null]);}
  if(svc?.total) s3.push(['Services',svc.sante+' santé · '+svc.commerces+' comm.',svc.total>50?'G':svc.total>20?'O':'R']);
  if(eco2?.total) s3.push(['Établissements scol.',eco2.total+' établissements',eco2.total>=5?'G':eco2.total>=2?'O':'R']);
  if(fibre?.fibre?.eligible!=null) s3.push(['Fibre FTTH',fibre.fibre.eligible?'Éligible':'Non éligible',fibre.fibre.eligible?'G':'R']);

  const s4=sections2[4].rows;
  if(mel?.pctPropri!=null){const d=nat?.pctPropri!=null?Math.round(mel.pctPropri-nat.pctPropri):null;s4.push(['Propriétaires',mel.pctPropri+'%'+(d!=null?' ('+(d>=0?'+':'')+d+'pt nat.)':''),null]);}
  if(mel?.nbVacants!=null&&mel.nbResidPrinc){const pV=Math.round(mel.nbVacants/(mel.nbResidPrinc+mel.nbVacants)*100);s4.push(['Logements vacants',pV+'%',pV<=5?'R':pV<=10?'O':'G']);}
  if(mel?.nbResidPrinc) s4.push(['Rés. principales',fmt(mel.nbResidPrinc),null]);
  if(mel?.pctSeuls!=null) s4.push(['Ménages seuls',mel.pctSeuls+'%',null]);

  const s5=sections2[5].rows;
  if(demo?.rows?.length>=2){const r=demo.rows;const ev=((r[r.length-1].pop-r[0].pop)/r[0].pop*100).toFixed(1);s5.push(['Évolution pop.',(ev>=0?'+':'')+ev+'% ('+r[0].year+'→'+r[r.length-1].year+')',ev>2?'G':ev>=-1?'O':'R']);}
  if(mel?.pyramideAges){const pyr=mel.pyramideAges;const tot=Object.values(pyr).reduce((a,v)=>a+v,0);if(tot>0){const y2=Math.round(((pyr.Y_LT15||0)+(pyr.Y15T24||0))/tot*100);const se=Math.round(((pyr.Y65T79||0)+(pyr.Y_GE80||0))/tot*100);const ac=100-y2-se;s5.push(['Profil démographique','Jeunes '+y2+'% · Actifs '+ac+'% · Seniors '+se+'%',null]);}}

  // Rendu 2 colonnes
  np(30);
  const yStart=y;
  let leftCol=[], rightCol=[];
  sections2.forEach((s,i)=>{ if(i%2===0) leftCol.push(s); else rightCol.push(s); });

  function renderCol(col, xStart, cW2){
    let cy=yStart;
    col.forEach(section=>{
      if(!section.rows.length) return;
      // Titre section
      if(cy+10>H-12){doc.addPage();cy=MT;}
      doc.setFillColor(...hexRgb(section.color));
      safeRect(xStart,cy,cW2,7,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(255,255,255);
      doc.text(section.title.toUpperCase(), xStart+3, cy+5);
      cy+=9;
      // Rows
      section.rows.forEach(([label,val,dot])=>{
        if(cy+6>H-12){doc.addPage();cy=MT;}
        doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,70,55);
        doc.text(strip(label), xStart+3, cy);
        doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(26,22,16);
        const vs=strip(val||'');
        const maxVW=cW2-10;
        const lines=doc.splitTextToSize(vs, maxVW-3);
        doc.text(lines[0]||'', xStart+cW2-3, cy, {align:'right'});
        if(dot){const dc=dot==='G'?[39,174,96]:dot==='O'?[243,156,18]:[231,76,60];doc.setFillColor(...dc);doc.circle(xStart+cW2+1.5,cy-1.2,1.2,'F');}
        cy+=5.5;
      });
      cy+=3;
    });
    return cy;
  }

  const yL=renderCol(leftCol, ML, colW);
  const yR=renderCol(rightCol, ML+colW+4, colW);
  y=Math.max(yL,yR)+5;

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
      doc.text(strip(item.icon+' '+item.label), ML+3, y);
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...col);
      doc.text(item.val.toFixed(1)+'/10', W-MR-3, y, {align:'right'});
      // Barre
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
    doc.text('IMMO·AI — Intelligence immobilière · Sources : DVF DGFiP · INSEE Melodi · Géorisques · OSM · ARCEP · Open-Meteo', ML, H-8);
    doc.text(i+'/'+pageCount, W-MR, H-8, {align:'right'});
    doc.setDrawColor(184,131,42); doc.setLineWidth(.4); doc.line(ML,H-10,W-MR,H-10);
  }

  // ══ SAUVEGARDE ══
  const nomFich='ImmoAI_'+(ins?.nom||'rapport').replace(/\s+/g,'_')+'_'+new Date().toLocaleDateString('fr-FR').replace(/\//g,'-')+'.pdf';
  doc.save(nomFich);
  toast('PDF généré : '+nomFich,'ok');
  } catch(e){ toast('Erreur PDF : '+e.message,'err'); console.error(e); }
}
