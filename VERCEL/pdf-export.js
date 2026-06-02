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
  // Nettoie les espaces non-standards (fine insecable u202F, etc.) que jsPDF remplace par /
  const cleanSpaces=s=>String(s||'').replace(/[     ⁠]/g,' ');
  const fmt=n=>cleanSpaces(Number(n).toLocaleString('fr-FR'));
  const np=(n=20)=>{ if(y+n>H-12){doc.addPage();y=MT;} };
  // Strip HTML, entites, emojis + espaces non-standards
  const strip=s=>{
    if(!s) return '';
    return cleanSpaces(String(s)
      .replace(/<[^>]+>/g,'')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x2019;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ')
      .replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F000}-\u{1F02F}]/gu,'')
      .trim());
  };

  function hexRgb(hex){ hex=hex.replace('#',''); return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)]; }

  // ── Helpers mise en page ──
  const secBar=(title,color)=>{
    np(12);
    doc.setFillColor(...hexRgb(color||'#b8832a'));
    safeRect(ML,y,CW,8,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(255,255,255);
    doc.text(title.toUpperCase(), ML+3, y+5.5);
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
  // Adresse
  const addr=strip(window.currentAddress||'Adresse non renseignee');
  const ins=window._inseeData?.commune;
  doc.setFillColor(249,245,238); safeRRect(ML,y-3,CW,18,3,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(26,22,16);
  const addrLines=doc.splitTextToSize(addr, CW-10);
  doc.text(addrLines, ML+5, y+4);
  if(ins?.nom){ doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(100,85,55); doc.text(strip(ins.nom+(ins.departement?' - Dep. '+ins.departement:'')), ML+5, y+14); }
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
    doc.text((sd.items?.length||0)+' criteres analyses - donnees temps reel a l\'adresse', ML+26, y+17);
    y+=26;
  }

  divider();

  // ══ NARRATIF (meme texte que la carte Score) ══
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

  // ══ SECTIONS (1 colonne) ══
  const mel=window._melodiData, nat=window._melodiNational, dvf=window._dvfData, dept=window._dvfDeptData;
  const mob=window._mobiliteData, svc=window._servicesData, eco2=window._ecolesData;
  const meteo=window._meteoData, bruit=window._bruitData, fibre=window._fibreData;
  const risques=window._risquesData, demo=window._demographieData, aq=window._qualiteAirData;

  const sections=[
    { title:'Marche immobilier', color:'#b8832a', rows:[] },
    { title:'Population et economie', color:'#2980b9', rows:[] },
    { title:'Cadre de vie', color:'#27ae60', rows:[] },
    { title:'Mobilite et services', color:'#8e44ad', rows:[] },
    { title:'Logement', color:'#e67e22', rows:[] },
    { title:'Dynamisme', color:'#1abc9c', rows:[] },
  ];

  const s0=sections[0].rows;
  if(dvf?.stats?.medianM2) s0.push(['Prix median /m2',fmt(dvf.stats.medianM2)+' EUR/m2',null]);
  if(dvf?.stats?.medianM2&&dept?.medianM2){const d=Math.round((dvf.stats.medianM2-dept.medianM2)/dept.medianM2*100);s0.push(['vs departement',(d>=0?'+':'')+d+'%',d<=-20?'G':d<=10?'O':'R']);}
  if(dvf?.count) s0.push(['Transactions',dvf.count+' ventes',null]);
  if(mel?.revenuMedian&&dvf?.stats?.medianM2){const e=Math.round(dvf.stats.medianM2*50/(mel.revenuMedian/12));s0.push(['Effort achat 50m2',e+' mois',e<60?'G':e<180?'O':'R']);}

  const s1=sections[1].rows;
  if(ins?.population) s1.push(['Habitants',fmt(ins.population),null]);
  if(ins?.densite) s1.push(['Densite',fmt(ins.densite)+' hab/km2',null]);
  if(mel?.revenuMedian){const d=nat?.revenuMedian?Math.round((mel.revenuMedian-nat.revenuMedian)/nat.revenuMedian*100):null;s1.push(['Revenu median net',fmt(Math.round(mel.revenuMedian/12))+' EUR/mois'+(d!=null?' ('+(d>=0?'+':'')+d+'%)':''),d==null?null:d>=20?'G':d>=-10?'O':'R']);}
  if(mel?.tauxChomage!=null){const d=nat?.tauxChomage!=null?Math.round((mel.tauxChomage-nat.tauxChomage)*10)/10:null;s1.push(['Chomage',mel.tauxChomage+'%'+(d!=null?' ('+(d>=0?'+':'')+d+'pt)':''),d==null?null:d<=-1?'G':d<=1?'O':'R']);}
  if(mel?.pctBac5!=null) s1.push(['Bac+5 et +',mel.pctBac5+'%',mel.pctBac5>=30?'G':mel.pctBac5>=15?'O':'R']);

  const s2=sections[2].rows;
  if(meteo?.ensoleillement?.heuresAnnuelles){const h=meteo.ensoleillement.heuresAnnuelles;s2.push(['Ensoleillement',fmt(h)+' h/an - '+strip(meteo.ensoleillement.label||''),h>1800?'G':h>1300?'O':'R']);}
  if(meteo?.temperatures?.maxMoyenne) s2.push(['Temperatures','Max '+meteo.temperatures.maxMoyenne+'C / Min '+meteo.temperatures.minMoyenne+'C',null]);
  if(bruit?.niveauCode){const sc=Math.min((bruit.score||0)+(ins?.densite>10000?4:ins?.densite>5000?3:ins?.densite>2000?2:1),10);s2.push(['Bruit estime',sc>=7?'Eleve':sc>=4?'Modere':'Faible',sc<=3?'G':sc<=6?'O':'R']);}
  if(aq?.aqi) s2.push(['Qualite de l\'air','AQI '+aq.aqi+' - '+strip(aq.label||''),aq.aqi<=30?'G':aq.aqi<=60?'O':'R']);
  if(risques?.total!=null) s2.push(['Risques naturels',risques.total+' risque(s)',risques.total===0?'G':risques.total<=2?'O':'R']);

  const s3=sections[3].rows;
  if(mob?.score) s3.push(['Score mobilite',mob.score+'/10',mob.score>=7?'G':mob.score>=5?'O':'R']);
  if(mob?.stats){const st=mob.stats,p=[];if(st.metro>0)p.push(st.metro+' metro/RER');if(st.arretsBus>0)p.push(st.arretsBus+' bus');if(p.length)s3.push(['Transports',p.join(' - '),null]);}
  if(svc?.total) s3.push(['Services',(svc.stats?.sante||svc.sante||'?')+' sante - '+(svc.stats?.commerce||svc.commerces||'?')+' commerces',svc.total>50?'G':svc.total>20?'O':'R']);
  if(eco2?.total) s3.push(['Etablissements scol.',eco2.total+' etablissements',eco2.total>=5?'G':eco2.total>=2?'O':'R']);
  if(fibre?.fibre?.eligible!=null) s3.push(['Fibre FTTH',fibre.fibre.eligible?'Eligible':'Non eligible',fibre.fibre.eligible?'G':'R']);

  const s4=sections[4].rows;
  if(mel?.pctPropri!=null){const d=nat?.pctPropri!=null?Math.round(mel.pctPropri-nat.pctPropri):null;s4.push(['Proprietaires',mel.pctPropri+'%'+(d!=null?' ('+(d>=0?'+':'')+d+'pt nat.)':''),null]);}
  if(mel?.nbVacants!=null&&mel.nbResidPrinc){const pV=Math.round(mel.nbVacants/(mel.nbResidPrinc+mel.nbVacants)*100);s4.push(['Logements vacants',pV+'%',pV<=5?'R':pV<=10?'O':'G']);}
  if(mel?.nbResidPrinc) s4.push(['Res. principales',fmt(mel.nbResidPrinc),null]);
  if(mel?.pctSeuls!=null) s4.push(['Menages seuls',mel.pctSeuls+'%',null]);

  const s5=sections[5].rows;
  if(demo?.rows?.length>=2){const r=demo.rows;const ev=((r[r.length-1].pop-r[0].pop)/r[0].pop*100).toFixed(1);s5.push(['Evolution pop.',(ev>=0?'+':'')+ev+'% ('+r[0].year+'-'+r[r.length-1].year+')',ev>2?'G':ev>=-1?'O':'R']);}
  if(mel?.pyramideAges){const pyr=mel.pyramideAges;const tot=Object.values(pyr).reduce((a,v)=>a+v,0);if(tot>0){const yj=Math.round(((pyr.Y_LT15||0)+(pyr.Y15T24||0))/tot*100);const se=Math.round(((pyr.Y65T79||0)+(pyr.Y_GE80||0))/tot*100);const ac=100-yj-se;s5.push(['Profil demographique','Jeunes '+yj+'% - Actifs '+ac+'% - Seniors '+se+'%',null]);}}

  sections.forEach(s=>{
    if(!s.rows.length) return;
    secBar(s.title, s.color);
    s.rows.forEach(([label,val,dot])=>kv(label,val,dot));
    y+=3;
  });

  divider();

  // ══ SCORES PAR CARTE ══
  if(sd?.items?.length){
    np(12);
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(184,131,42);
    doc.text('Detail des scores', ML+3, y); y+=7;
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
    doc.text('IMMO-AI - Sources : DVF DGFiP - INSEE Melodi - Georisques - OSM - ARCEP - Open-Meteo', ML, H-8);
    doc.text(i+'/'+pageCount, W-MR, H-8, {align:'right'});
    doc.setDrawColor(184,131,42); doc.setLineWidth(.4); doc.line(ML,H-10,W-MR,H-10);
  }

  // ══ SAUVEGARDE ══
  const nomFich='ImmoAI_'+(ins?.nom||'rapport').replace(/\s+/g,'_')+'_'+new Date().toLocaleDateString('fr-FR').replace(/\//g,'-')+'.pdf';
  doc.save(nomFich);
  toast('PDF genere : '+nomFich,'ok');
  } catch(e){ toast('Erreur PDF : '+e.message,'err'); console.error(e); }
}
