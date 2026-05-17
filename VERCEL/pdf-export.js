// ══ TOAST ══
function toast(msg, type='ok', dur=3200){
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), dur);
}

// ══ PDF EXPORT ══
const IMMOAI_LOGO_B64='data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSczMjAnIGhlaWdodD0nODAnIHZpZXdCb3g9JzAgMCAzMjAgODAnPgogIDxkZWZzPgogICAgPGxpbmVhckdyYWRpZW50IGlkPSdnJyB4MT0nMCUnIHkxPScwJScgeDI9JzEwMCUnIHkyPScxMDAlJz4KICAgICAgPHN0b3Agb2Zmc2V0PScwJScgc3R5bGU9J3N0b3AtY29sb3I6I2Q0YTg0MycvPgogICAgICA8c3RvcCBvZmZzZXQ9JzEwMCUnIHN0eWxlPSdzdG9wLWNvbG9yOiNiODgzMmEnLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxwb2x5Z29uIHBvaW50cz0nMjgsNDQgMjgsNjQgNTIsNjQgNTIsNDQnIGZpbGw9J3VybCgjZyknLz4KICA8cmVjdCB4PSczNScgeT0nNTAnIHdpZHRoPScxMCcgaGVpZ2h0PScxNCcgZmlsbD0nIzFhMTYxMCcvPgogIDxwb2x5Z29uIHBvaW50cz0nMTgsNDYgNDAsMjIgNjIsNDYnIGZpbGw9J3VybCgjZyknLz4KICA8cmVjdCB4PSc0NCcgeT0nMzAnIHdpZHRoPScxMCcgaGVpZ2h0PScxMCcgZmlsbD0nIzFhMTYxMCcgcng9JzEnLz4KICA8dGV4dCB4PSc3NicgeT0nNTQnIGZvbnQtZmFtaWx5PSdHZW9yZ2lhLHNlcmlmJyBmb250LXNpemU9JzMyJyBmb250LXdlaWdodD0nNzAwJyBmaWxsPScjMmMyNDE2JyBsZXR0ZXItc3BhY2luZz0nLTAuNSc+SW1tbzwvdGV4dD4KICA8cmVjdCB4PScyMDAnIHk9JzI4JyB3aWR0aD0nNDQnIGhlaWdodD0nMjgnIHJ4PSc1JyBmaWxsPSd1cmwoI2cpJy8+CiAgPHRleHQgeD0nMjIyJyB5PSc0OScgZm9udC1mYW1pbHk9J0dlb3JnaWEsc2VyaWYnIGZvbnQtc2l6ZT0nMjAnIGZvbnQtd2VpZ2h0PSc3MDAnIGZpbGw9JyMxYTE2MTAnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGxldHRlci1zcGFjaW5nPScwLjUnPkFJPC90ZXh0Pgo8L3N2Zz4=';

function generatePDF(){
  try {
  if(!window.jspdf){ toast('jsPDF non chargé','err'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W=210, H=297, ML=15, MR=15, MT=18;
  let y = MT;
  // Wrapper défensif — ignore les valeurs NaN/négatives/nulles
  const safeRect = (x,y,w,h,style) => {
    if(!isFinite(x)||!isFinite(y)||!isFinite(w)||!isFinite(h)||w<=0||h<=0) return;
    doc.rect(Math.round(x*100)/100, Math.round(y*100)/100, Math.round(w*100)/100, Math.round(h*100)/100, style);
  };
  const safeRRect = (x,y,w,h,rx,ry,style) => {
    if(!isFinite(x)||!isFinite(y)||!isFinite(w)||!isFinite(h)||w<=0||h<=0) return;
    const r = Math.min(rx, w/2-0.1, h/2-0.1);
    if(r<=0){ doc.rect(x,y,w,h,style); return; }
    doc.roundedRect(x,y,w,h,r,r,style);
  };

  // ── Helpers ──
  const fmt = n => { const s=Number(n).toLocaleString('fr-FR'); return s.replace(/[  ]/g,' '); };
  const np = (needed=20) => { if(y+needed > H-15){ doc.addPage(); y=MT; } };
  const secTitle = (icon, title) => {
    np(14);
    doc.setFillColor(245,240,232);
    safeRect(ML, y, W-ML-MR, 9, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(26,22,16);
    doc.text(title, ML+3, y+6.2);
    y += 12;
  };
  const kv = (label, value, sub='') => {
    np(8);
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(90,85,75);
    doc.text(String(label), ML+3, y);
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(26,22,16);
    const valStr = String(value);
    doc.text(valStr, ML+72, y);
    if(sub){ doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(140,130,110); doc.text(' - '+String(sub), ML+72+doc.getTextWidth(valStr), y); }
    y += 6;
  };
  const note = (txt) => {
    np(7); doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(160,140,90);
    const lines = doc.splitTextToSize(txt, W-ML-MR-6);
    doc.text(lines, ML+3, y); y += lines.length*4.5+1;
  };
  const sep = () => { np(6); doc.setDrawColor(210,195,165); doc.line(ML, y, W-MR, y); y+=5; };

  // ══ COUVERTURE ══
  doc.setFillColor(26,22,16); safeRect(0,0,W,60,'F');
  doc.setFillColor(184,131,42); safeRect(0,58,W,1.5,'F');
  // Logo vectoriel
  doc.setFont('helvetica','bold'); doc.setFontSize(26); doc.setTextColor(184,131,42);
  doc.text('Immo', 18, 37);
  doc.setFillColor(184,131,42); safeRRect(56,23,21,13,2,2,'F');
  doc.setFontSize(14); doc.setTextColor(26,22,16); doc.text('AI',66.5,32.5,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(230,220,200);
  doc.text("Rapport d'analyse immobilière", 18, 50);

  // Bloc adresse
  y = 70;
  doc.setFillColor(250,247,241); safeRect(ML,y-5,W-ML-MR,20,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(26,22,16);
  const aLines = doc.splitTextToSize(currentAddress||'Adresse non renseignée', W-ML-MR-10);
  doc.text(aLines, ML+5, y+2); y += 22;
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(140,120,70);
  const dateStr = new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  doc.text('Généré le '+dateStr, ML, y+3);
  if(currentCoords) doc.text(currentCoords.lat.toFixed(5)+'° N, '+currentCoords.lng.toFixed(5)+'° E', W-MR, y+3,{align:'right'});
  y += 10;

  // Scores synthétiques (texte uniquement — pas de barres graphiques)
  const scoreLines = [];
  if(window._risquesData?.success){
    const nb = window._risquesData.total;
    scoreLines.push({l:'Risques naturels', v: nb!=null ? nb+' risque(s) identifié(s)' : 'Voir détail'});
  }
  if(window._servicesData?.success){
    const sc = window._servicesData.score;
    if(sc!=null) scoreLines.push({l:'Services', v: sc+'/10'});
  }
  if(window._mobiliteData?.success && window._mobiliteData.score!=null){
    scoreLines.push({l:'Mobilité', v: window._mobiliteData.score+'/10'});
  }
  if(window._bruitData?.success){
    const dens=window._inseeData?.commune?.densite||0;
    const bonus=dens>10000?4:dens>5000?3:dens>2000?2:dens>500?1:0;
    const sc=Math.min((window._bruitData.score||0)+bonus,10);
    scoreLines.push({l:'Bruit estimé', v: sc>=7?'Élevé':sc>=4?'Modéré':sc>=2?'Faible':'Très faible'});
  }
  if(scoreLines.length){ secTitle('📊','Scores synthétiques');
    scoreLines.forEach(s=>kv(s.l, s.v));
    sep();
  }

  // ══ DVF ══
  const dvf = window._dvfData;
  if(dvf && !dvf.failed && dvf.stats){
    secTitle('💰','Prix des transactions · DVF');
    if(dvf.stats.medianM2) kv('Prix médian /m²', fmt(dvf.stats.medianM2)+' €', dvf.count+' ventes');
    if(dvf.stats.minM2) kv('Prix min /m²', fmt(dvf.stats.minM2)+' €');
    if(dvf.stats.maxM2) kv('Prix max /m²', fmt(dvf.stats.maxM2)+' €');
    if(dvf.stats.medianTotal) kv('Valeur médiane totale', fmt(dvf.stats.medianTotal)+' €');
    note('Source : DVF · Etalab · rayon '+(dvf.rayon/1000).toFixed(0)+'km'); sep();
  }

  // ══ LOYERS ══
  const loy = window._loyersData;
  if(loy?.estimates){
    secTitle('🏠','Loyers estimés');
    Object.entries(loy.estimates).forEach(([t,v])=>{ if(v?.mensuel) kv(t, fmt(v.mensuel)+' €/mois', v.m2?.toFixed(0)+' €/m²'); });
    if(loy.rendement) kv('Rendement locatif brut', loy.rendement.toFixed(1)+'%');
    note('Estimation basée sur DVF, INSEE et observatoires locaux.'); sep();
  }

  // ══ INSEE ══
  const ins = window._inseeData;
  if(ins?.commune){
    secTitle('📊','Profil de la commune · INSEE');
    const c=ins.commune;
    if(c.population) kv('Population',fmt(c.population)+' hab.');
    if(c.densite) kv('Densité',fmt(c.densite)+' hab/km²');
    if(c.superficie) kv('Superficie',fmt(c.superficie)+' km²');
    if(ins.logement?.txProprietaires) kv('Propriétaires',ins.logement.txProprietaires.toFixed(1)+'%');
    if(ins.logement?.txLocataires) kv('Locataires',ins.logement.txLocataires.toFixed(1)+'%');
    note('Source : INSEE · Recensement de la population'); sep();
  }

  // ══ SÉCURITÉ ══
  if(ins?.criminalite?.success){
    secTitle('🚨','Sécurité & criminalité · SSMSI');
    const cr=ins.criminalite;
    const sorted=Object.entries(cr.indicateurs||{}).filter(([,v])=>v.nb!=null&&v.nb>0).sort((a,b)=>(b[1].nb||0)-(a[1].nb||0)).slice(0,6);
    if(sorted.length){
      doc.autoTable({startY:y,margin:{left:ML,right:MR},
        head:[['Indicateur','Faits','Tx']],
        body:sorted.map(([ind,v])=>[ind.length>45?ind.slice(0,42)+'…':ind,fmt(v.nb||0),v.taux!=null?v.taux.toFixed(1):'—']),
        styles:{fontSize:8,cellPadding:2},
        headStyles:{fillColor:[184,131,42],textColor:[26,22,16],fontStyle:'bold'},
        alternateRowStyles:{fillColor:[250,247,240]},
        columnStyles:{0:{cellWidth:110},1:{cellWidth:25,halign:'right'},2:{cellWidth:25,halign:'right'}},
        theme:'plain'});
      y=(doc.lastAutoTable&&doc.lastAutoTable.finalY)||y+4;
    }
    note('Source : SSMSI · Ministère de l\'Intérieur · année '+cr.annee); sep();
  }

  // ══ BRUIT ══
  const bruit = window._bruitData;
  if(bruit?.success){
    secTitle('🔇','Bruit & nuisances');
    const dens=window._inseeData?.commune?.densite||0;
    const bonus=dens>10000?4:dens>5000?3:dens>2000?2:dens>500?1:0;
    const sc=Math.min((bruit.score||0)+bonus,10);
    kv('Niveau estimé', sc>=7?'Élevé':sc>=4?'Modéré':sc>=2?'Faible':'Très faible','score '+sc+'/10');
    if(bonus>0) kv('Bonus densité','+'+bonus+' pts',fmt(dens)+' hab/km²');
    bruit.sources?.forEach(s=>kv(s.label, s.niveau||'', s.detail||''));
    note('Estimation OSM non certifiée · bruit.fr pour mesures officielles'); sep();
  }

  // ══ RISQUES ══
  const risq=window._risquesData;
  if(risq?.success){
    secTitle('⚠️','Risques naturels & technologiques · Géorisques');
    kv('Risques identifiés', risq.total||0);
    risq.detail?.slice(0,8).forEach(r=>{ np(6); doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(90,85,75); const rStr=typeof r==='string'?r:(r?.libelle||r?.type||r?.nom||r?.description||JSON.stringify(r)); doc.text('• '+rStr, ML+5, y); y+=5.5; });
    note('Source : Géorisques · BRGM'); sep();
  }

  // ══ ÉCOLES ══
  const eco=window._ecolesData;
  if(eco?.success){
    secTitle('🏫','Établissements scolaires · OSM');
    kv('Total',eco.total||0);
    if(eco.types) Object.entries(eco.types).forEach(([t,n])=>kv(t,n));
    note('Source : OpenStreetMap'); sep();
  }

  // ══ MOBILITÉ ══
  const mob=window._mobiliteData;
  if(mob?.success){
    secTitle('🚇','Mobilité & transports');
    if(mob.score!=null) kv('Score mobilité',mob.score+'/10');
    mob.transports?.slice(0,5).forEach(t=>kv(t.type||t.nom||'Transport',t.nom||t.lignes||'',t.distance?t.distance+'m':''));
    note('Source : OpenStreetMap'); sep();
  }

  // ══ FIBRE ══
  const fib=window._fibreData;
  if(fib){
    secTitle('📡','Couverture fibre · ARCEP');
    kv('Éligible fibre',fib.eligible===true?'Oui':fib.eligible===false?'Non':'Non déterminé');
    if(fib.operateurs?.length) kv('Opérateurs',fib.operateurs.join(', '));
    note('Source : ARCEP · THD France'); sep();
  }

  // ══ URBANISME ══
  const urb=window._urbanismeData;
  if(urb?.zone){
    secTitle('📋','Urbanisme & PLU');
    kv('Zone PLU',urb.zone.code||'—',urb.zone.libelle||'');
    if(urb.zone.typeZone) kv('Type',urb.zone.typeZone);
    if(urb.document?.nom) kv('Document',urb.document.nom);
    if(urb.prescriptions?.length) kv('Prescriptions',urb.prescriptions.length+' identifiée(s)');
    note('Source : Géoportail Urbanisme (GPU)'); sep();
  }

  // ══ MÉTÉO ══
  const met=window._meteoData;
  if(met?.success){
    secTitle('☀️','Données climatiques · Open-Meteo');
    if(met.ensoleillement?.heuresAnnuelles) kv('Ensoleillement',fmt(met.ensoleillement.heuresAnnuelles)+' h/an',met.ensoleillement.label||'');
    if(met.temperatures?.maxMoyenne) kv('T° max. moyenne',met.temperatures.maxMoyenne+'°C');
    if(met.temperatures?.minMoyenne) kv('T° min. moyenne',met.temperatures.minMoyenne+'°C');
    if(met.precipitations?.totalAnnuel) kv('Précipitations',fmt(met.precipitations.totalAnnuel)+' mm/an');
    note('Source : Open-Meteo Archive · moyennes 5 ans'); sep();
  }

  // ══ SERVICES ══
  const srv=window._servicesData;
  if(srv?.success){
    secTitle('🛍️','Services & commodités');
    kv('Score',srv.score+'/10');
    if(srv.stats){ kv('Santé',srv.stats.sante); kv('Commerces',srv.stats.commerce); kv('Total',srv.total); }
    note('Source : OpenStreetMap · rayon '+(window._servicesCurrentDist||500)+'m'); sep();
  }

  // ══ ALTITUDE ══
  const alt=window._altitudeData;
  if(alt?.success){
    secTitle('🏔️','Altitude · IGN');
    kv('Altitude NGF',alt.altitude+'m',alt.label||'');
    note('Source : IGN RGE Alti · data.geopf.fr'); sep();
  }

  // ══ SOURCES ══
  np(60); secTitle('📄','Sources & mentions légales');
  [['DVF / Etalab','app.dvf.etalab.gouv.fr — transactions immobilières publiques'],
   ['INSEE','insee.fr — recensement, population, logement'],
   ['SSMSI','data.gouv.fr — statistiques de délinquance (Min. Intérieur)'],
   ['Géorisques','georisques.gouv.fr — risques naturels & technologiques (BRGM)'],
   ['ARCEP','arcep.fr / THD France — couverture fibre'],
   ['GPU','geoportail-urbanisme.gouv.fr — PLU'],
   ['Open-Meteo','open-meteo.com — climatologie (CC BY 4.0)'],
   ['OpenStreetMap','openstreetmap.org — bruit, mobilité, services (© contributeurs OSM)'],
   ['IGN','data.geopf.fr — altitude NGF (RGE Alti)'],
  ].forEach(([src,desc])=>{
    np(10);
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(184,131,42);doc.text(src,ML+3,y);
    doc.setFont('helvetica','normal');doc.setTextColor(90,85,75);
    const ls=doc.splitTextToSize(desc,W-ML-MR-52);doc.text(ls,ML+52,y);
    y+=Math.max(ls.length*4.5,5)+1.5;
  });
  y+=4;
  note('Rapport généré automatiquement à titre informatif. Ne constitue pas un conseil juridique, fiscal ou financier. ImmoAI · '+new Date().getFullYear());

  // Pied de page sur chaque page
  const total=doc.getNumberOfPages();
  for(let i=1;i<=total;i++){
    doc.setPage(i);
    doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(180,160,120);
    doc.setDrawColor(210,195,165);doc.line(ML,H-10,W-MR,H-10);
    doc.text('ImmoAI · '+(currentAddress||''),ML,H-6);
    doc.text(i+' / '+total,W-MR,H-6,{align:'right'});
  }

  const fn='ImmoAI_'+(currentAddress||'rapport').replace(/[^a-zA-Z0-9]/g,'_').slice(0,40)+'_'+new Date().toISOString().slice(0,10)+'.pdf';
  doc.save(fn);
  toast('✓ PDF téléchargé','ok');
  } catch(e) {
    console.error('[ImmoAI PDF]', e);
    toast('Erreur PDF : ' + e.message.slice(0,80), 'err');
    console.error('[ImmoAI PDF stack]', e.stack);
  }
}
