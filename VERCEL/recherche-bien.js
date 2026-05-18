// ══ IMMOAI — RECHERCHE DE BIEN IMMOBILIER ══
// Génération d'URLs pré-filtrées pour 5 sites immobiliers
// Aucun scraping — liens externes uniquement
(function () {
  'use strict';

  // ── Variables de configuration ──
  const SITES = [
    { id: 'seloger',   nom: 'SeLoger',    couleur: '#e63946', desc: 'N°1 des portails immo' },
    { id: 'leboncoin', nom: 'LeBonCoin',  couleur: '#f4a261', desc: 'Annonces particuliers & agences' },
    { id: 'pap',       nom: 'PAP',        couleur: '#2a9d8f', desc: 'Particulier à particulier' },
    { id: 'bienici',   nom: "Bien'ici",   couleur: '#457b9d', desc: 'Multi-diffusion agences' },
    { id: 'logicimmo', nom: 'Logic-Immo', couleur: '#9b59b6', desc: 'Réseau agences nationales' },
  ];

  const BUDGETS_ACHAT = [
    { v: '', l: 'Indifférent' }, { v: 100000, l: '100 000 €' }, { v: 150000, l: '150 000 €' },
    { v: 200000, l: '200 000 €' }, { v: 250000, l: '250 000 €' }, { v: 300000, l: '300 000 €' },
    { v: 400000, l: '400 000 €' }, { v: 500000, l: '500 000 €' }, { v: 750000, l: '750 000 €' },
    { v: 1000000, l: '1 000 000 €' }, { v: 1500000, l: '1 500 000 €' },
  ];
  const BUDGETS_LOC = [
    { v: '', l: 'Indifférent' }, { v: 400, l: '400 €/mois' }, { v: 600, l: '600 €/mois' },
    { v: 800, l: '800 €/mois' }, { v: 1000, l: '1 000 €/mois' }, { v: 1200, l: '1 200 €/mois' },
    { v: 1500, l: '1 500 €/mois' }, { v: 2000, l: '2 000 €/mois' }, { v: 3000, l: '3 000 €/mois' },
  ];
  const SURFACES = [
    { v: '', l: 'Indifférent' }, { v: 20, l: '20 m²' }, { v: 30, l: '30 m²' },
    { v: 40, l: '40 m²' }, { v: 50, l: '50 m²' }, { v: 60, l: '60 m²' },
    { v: 70, l: '70 m²' }, { v: 90, l: '90 m²' }, { v: 100, l: '100 m²' },
    { v: 120, l: '120 m²' }, { v: 150, l: '150 m²' }, { v: 200, l: '200 m²' },
  ];
  const PIECES = [
    { v: '', l: 'Indifférent' }, { v: 1, l: '1 pièce' }, { v: 2, l: '2 pièces' },
    { v: 3, l: '3 pièces' }, { v: 4, l: '4 pièces' }, { v: 5, l: '5 pièces +' },
  ];
  const JARDINS = [
    { v: '', l: 'Indifférent' }, { v: 50, l: '50 m²' }, { v: 100, l: '100 m²' },
    { v: 200, l: '200 m²' }, { v: 500, l: '500 m²' }, { v: 1000, l: '1 000 m²' },
    { v: 2000, l: '2 000 m²' },
  ];
  const RAYONS = [
    { v: 1000, l: '1 km' }, { v: 500, l: '500 m' }, { v: 2000, l: '2 km' },
    { v: 5000, l: '5 km' }, { v: 10000, l: '10 km' },
  ];

  // ── Helpers ──
  function slugify(str) {
    return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function extractCP(address) {
    const m = (address || '').match(/\b(\d{5})\b/);
    return m ? m[1] : '';
  }

  function sel(id) { return document.getElementById(id); }
  function val(id) { const e = sel(id); return e ? e.value : ''; }

  function selectHtml(id, opts, defaultVal) {
    return `<select id="${id}" onchange="window._rbUpdateSites()" style="width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:var(--r);font-size:.78rem;background:var(--white);color:var(--ink)">
      ${opts.map(o => `<option value="${o.v}" ${o.v == defaultVal ? 'selected' : ''}>${o.l}</option>`).join('')}
    </select>`;
  }

  // ── Builders URL ──
  function buildSeLoger(p) {
    const types = p.type === 'appart' ? '1' : p.type === 'maison' ? '2' : '1,2';
    const project = p.mode === 'achat' ? '2' : '1';
    let url = `https://www.seloger.com/list.htm?types=${types}&projects=${project}&enterprise=0&natures=1`;
    if (p.insee) url += `&places=[{"inse":"${p.insee}"}]`;
    if (p.surface) url += `&surface=${p.surface}`;
    if (p.pieces)  url += `&rooms=${p.pieces}`;
    if (p.budget)  url += `&price=${p.budget}`;
    return url;
  }

  function buildLeBonCoin(p) {
    const cat = p.mode === 'achat' ? '9' : '10';
    const ret = p.type === 'appart' ? '1' : p.type === 'maison' ? '2' : '1,2';
    let url = `https://www.leboncoin.fr/recherche?category=${cat}`;
    if (ret)      url += `&real_estate_type=${ret}`;
    if (p.budget) url += `&price=min-${p.budget}`;
    if (p.surface)url += `&square=${p.surface}-max`;
    if (p.pieces) url += `&rooms=${p.pieces}-max`;
    if (p.cp && p.cityName) url += `&locations=${encodeURIComponent(p.cityName.replace(/\s+/g,'_')+'_'+p.cp)}`;
    return url;
  }

  function buildPAP(p) {
    const trans = p.mode === 'achat' ? 'vente' : 'location';
    const typeStr = p.type === 'appart' ? 'appartement' : p.type === 'maison' ? 'maison' : 'appartement-maison';
    let url = `https://www.pap.fr/annonce/${trans}-${typeStr}`;
    if (p.citySlug) url += `-${p.citySlug}`;
    const params = [];
    if (p.budget)  params.push(`${p.mode === 'achat' ? 'prix_max' : 'loyer_max'}=${p.budget}`);
    if (p.surface) params.push(`surface_min=${p.surface}`);
    if (p.pieces)  params.push(`nb_pieces_min=${p.pieces}`);
    if (p.jardin)  params.push(`surface_terrain_min=${p.jardin}`);
    return params.length ? `${url}?${params.join('&')}` : url;
  }

  function buildBienIci(p) {
    const trans = p.mode === 'achat' ? 'achat' : 'location';
    const typeStr = p.type === 'appart' ? 'appartement' : p.type === 'maison' ? 'maison' : 'appartement,maison';
    let url = `https://www.bienici.com/recherche/${trans}`;
    if (p.citySlug) url += `/${p.citySlug}`;
    url += `/${typeStr}`;
    const params = [];
    if (p.budget)  params.push(`${p.mode === 'achat' ? 'prix-max' : 'loyer-max'}=${p.budget}`);
    if (p.surface) params.push(`surface-min=${p.surface}`);
    if (p.pieces)  params.push(`nb-pieces-min=${p.pieces}`);
    if (p.jardin)  params.push(`surface-terrain-min=${p.jardin}`);
    return params.length ? `${url}?${params.join('&')}` : url;
  }

  function buildLogicImmo(p) {
    const trans = p.mode === 'achat' ? 'vente' : 'location';
    let url = `https://www.logic-immo.com/${trans}-immobilier`;
    if (p.cp) url += `-${p.cp}`;
    url += '/';
    const params = [];
    if (p.budget)  params.push(`prix-max=${p.budget}`);
    if (p.surface) params.push(`surface-min=${p.surface}`);
    if (p.pieces)  params.push(`nb-pieces=${p.pieces}`);
    return params.length ? `${url}?${params.join('&')}` : url;
  }

  function buildAllUrls(p) {
    return {
      seloger:   buildSeLoger(p),
      leboncoin: buildLeBonCoin(p),
      pap:       buildPAP(p),
      bienici:   buildBienIci(p),
      logicimmo: buildLogicImmo(p),
    };
  }

  // ── HTML du panneau ──
  function renderPanel(cityName, cp, photoUrl) {
    const photoStyle = photoUrl
      ? `background:url('${photoUrl}') center/cover no-repeat`
      : `background:linear-gradient(135deg,#b8832a,#7a6040)`;

    return `
<div style="${photoStyle};height:130px;border-radius:var(--r);position:relative;margin-bottom:16px;overflow:hidden">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,.32)"></div>
  <div style="position:absolute;bottom:12px;left:14px;color:#fff">
    <div style="font-size:1.1rem;font-weight:600">${cityName || 'Commune'}</div>
    <div style="font-size:.7rem;opacity:.8">${photoUrl ? 'Photo Wikimedia Commons' : 'Recherche immobilière'} · ${cp || ''}</div>
  </div>
</div>

<div style="display:flex;gap:6px;margin-bottom:12px">
  <button id="rb-btn-achat" onclick="window._rbSetMode('achat')" style="flex:1;padding:7px 4px;border:1px solid var(--gold);border-radius:var(--r);font-size:.78rem;font-weight:600;cursor:pointer;background:var(--gold);color:#fff">🏠 Achat</button>
  <button id="rb-btn-loc"   onclick="window._rbSetMode('location')" style="flex:1;padding:7px 4px;border:1px solid var(--border);border-radius:var(--r);font-size:.78rem;cursor:pointer;background:var(--white);color:var(--muted)">🔑 Location</button>
</div>

<div style="display:flex;gap:6px;margin-bottom:12px">
  <button id="rb-btn-both"   onclick="window._rbSetType('both')"   style="flex:1;padding:6px 4px;border:1px solid var(--gold);border-radius:var(--r);font-size:.75rem;font-weight:600;cursor:pointer;background:var(--gold);color:#fff">Appart &amp; maison</button>
  <button id="rb-btn-appart" onclick="window._rbSetType('appart')" style="flex:1;padding:6px 4px;border:1px solid var(--border);border-radius:var(--r);font-size:.75rem;cursor:pointer;background:var(--white);color:var(--muted)">🏢 Appartement</button>
  <button id="rb-btn-maison" onclick="window._rbSetType('maison')" style="flex:1;padding:6px 4px;border:1px solid var(--border);border-radius:var(--r);font-size:.75rem;cursor:pointer;background:var(--white);color:var(--muted)">🏡 Maison</button>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
  <div><label style="font-size:.7rem;color:var(--muted);display:block;margin-bottom:3px" id="rb-lbl-budget">Budget max</label>${selectHtml('rb-budget', BUDGETS_ACHAT, 300000)}</div>
  <div><label style="font-size:.7rem;color:var(--muted);display:block;margin-bottom:3px">Surface min</label>${selectHtml('rb-surface', SURFACES, 50)}</div>
  <div><label style="font-size:.7rem;color:var(--muted);display:block;margin-bottom:3px">Nb pièces min</label>${selectHtml('rb-pieces', PIECES, 2)}</div>
  <div><label style="font-size:.7rem;color:var(--muted);display:block;margin-bottom:3px">Rayon</label>${selectHtml('rb-rayon', RAYONS, 1000)}</div>
</div>

<div id="rb-bloc-appart" style="display:none;border-left:2px solid var(--goldborder);padding-left:10px;margin-bottom:10px">
  <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Critères appartement</div>
  <div style="display:flex;flex-wrap:wrap;gap:5px">
    ${['Balcon','Terrasse','Ascenseur','Pas rez-de-chaussée','Cave','Parking'].map(o =>
      `<span class="rb-chip" onclick="this.classList.toggle('rb-on')" style="padding:3px 9px;border:1px solid var(--border);border-radius:99px;font-size:.72rem;cursor:pointer;background:var(--warm)">${o}</span>`
    ).join('')}
  </div>
</div>

<div id="rb-bloc-maison" style="display:none;border-left:2px solid var(--goldborder);padding-left:10px;margin-bottom:10px">
  <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Critères maison</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
    <div><label style="font-size:.7rem;color:var(--muted);display:block;margin-bottom:3px">Jardin min</label>${selectHtml('rb-jardin', JARDINS, '')}</div>
    <div><label style="font-size:.7rem;color:var(--muted);display:block;margin-bottom:3px">Garage</label>
      <select id="rb-garage" style="width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:var(--r);font-size:.78rem;background:var(--white);color:var(--ink)">
        <option value="">Indifférent</option><option value="1">Oui</option>
      </select>
    </div>
    <div><label style="font-size:.7rem;color:var(--muted);display:block;margin-bottom:3px">Plain-pied</label>
      <select id="rb-plainpied" style="width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:var(--r);font-size:.78rem;background:var(--white);color:var(--ink)">
        <option value="">Indifférent</option><option value="1">Oui</option>
      </select>
    </div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:5px">
    ${['Piscine possible','Dépendances'].map(o =>
      `<span class="rb-chip" onclick="this.classList.toggle('rb-on')" style="padding:3px 9px;border:1px solid var(--border);border-radius:99px;font-size:.72rem;cursor:pointer;background:var(--warm)">${o}</span>`
    ).join('')}
  </div>
</div>

<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
  ${['Neuf seulement','DPE A→C','Avec photos'].map(o =>
    `<span class="rb-chip" onclick="this.classList.toggle('rb-on')" style="padding:3px 9px;border:1px solid var(--border);border-radius:99px;font-size:.72rem;cursor:pointer;background:var(--warm)">${o}</span>`
  ).join('')}
</div>

<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
  <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Ouvrir sur chaque site (filtres pré-remplis)</div>
  <div id="rb-sites" style="display:grid;grid-template-columns:1fr 1fr;gap:7px"></div>
</div>`;
  }

  function renderSiteCards(urls) {
    return SITES.map((s, i) => {
      const url = urls[s.id] || '#';
      const wide = i === 4 ? 'grid-column:1/-1;' : '';
      return `<a href="${url}" target="_blank" onclick="this.querySelector('.rb-link-txt').textContent='⏳ Ouverture...'" rel="noopener"
        style="${wide}display:block;border:1px solid var(--border);border-radius:var(--r);overflow:hidden;text-decoration:none;color:inherit">
        <div style="padding:8px 12px;display:flex;align-items:center;gap:7px;border-bottom:1px solid var(--borderl)">
          <span style="width:9px;height:9px;border-radius:50%;background:${s.couleur};flex-shrink:0;display:inline-block"></span>
          <span style="font-size:.8rem;font-weight:600">${s.nom}</span>
        </div>
        <div style="padding:7px 12px 9px;background:var(--warm)">
          <div style="font-size:.7rem;color:var(--muted);margin-bottom:5px">${s.desc}</div>
          <div class="rb-link-txt" style="font-size:.75rem;color:var(--gold);font-weight:600">Voir les annonces →</div>
        </div>
      </a>`;
    }).join('');
  }

  // ── État du formulaire ──
  let _mode = 'achat', _type = 'both';
  let _ctx = {};

  function getParams() {
    return {
      mode:     _mode,
      type:     _type,
      budget:   val('rb-budget')  || '',
      surface:  val('rb-surface') || '',
      pieces:   val('rb-pieces')  || '',
      jardin:   val('rb-jardin')  || '',
      insee:    _ctx.insee   || '',
      cp:       _ctx.cp      || '',
      cityName: _ctx.cityName || '',
      citySlug: _ctx.citySlug || '',
    };
  }

  window._rbUpdateSites = function () {
    const sites = sel('rb-sites');
    if (!sites) return;
    sites.innerHTML = renderSiteCards(buildAllUrls(getParams()));
  };

  window._rbSetMode = function (mode) {
    _mode = mode;
    ['achat','loc'].forEach(m => {
      const btn = sel(`rb-btn-${m}`);
      if (!btn) return;
      const active = (m === mode) || (m === 'loc' && mode === 'location');
      btn.style.background = active ? 'var(--gold)' : 'var(--white)';
      btn.style.color      = active ? '#fff' : 'var(--muted)';
      btn.style.borderColor= active ? 'var(--gold)' : 'var(--border)';
      btn.style.fontWeight = active ? '600' : '400';
    });
    const lbl = sel('rb-lbl-budget');
    if (lbl) lbl.textContent = mode === 'location' ? 'Loyer max /mois' : 'Budget max';
    // Mettre à jour les options budget
    const bSel = sel('rb-budget');
    if (bSel) {
      const opts = mode === 'location' ? BUDGETS_LOC : BUDGETS_ACHAT;
      const curV = bSel.value;
      bSel.innerHTML = opts.map(o => `<option value="${o.v}" ${o.v == curV ? 'selected' : ''}>${o.l}</option>`).join('');
    }
    window._rbUpdateSites();
  };

  window._rbSetType = function (type) {
    _type = type;
    ['both','appart','maison'].forEach(t => {
      const btn = sel(`rb-btn-${t}`);
      if (!btn) return;
      const active = t === type;
      btn.style.background = active ? 'var(--gold)' : 'var(--white)';
      btn.style.color      = active ? '#fff' : 'var(--muted)';
      btn.style.borderColor= active ? 'var(--gold)' : 'var(--border)';
      btn.style.fontWeight = active ? '600' : '400';
    });
    sel('rb-bloc-appart').style.display = type === 'appart' ? '' : 'none';
    sel('rb-bloc-maison').style.display = type === 'maison' ? '' : 'none';
    window._rbUpdateSites();
  };

  // ── Point d'entrée principal ──
  window.showRecherchePanel = async function () {
    if (!currentCoords) {
      alert('Analysez d\'abord une adresse.');
      return;
    }
    if (typeof _goPage === 'function') _goPage('analyse');

    const commune  = _inseeData?.commune;
    _ctx.cityName  = commune?.nom || '';
    _ctx.insee     = commune?.codeInsee || '';
    _ctx.cp        = extractCP(currentAddress || '');
    _ctx.citySlug  = slugify(_ctx.cityName);
    _mode = 'achat';
    _type = 'both';

    // Photo Wikimedia (best-effort)
    let photoUrl = '';
    try {
      const r = await fetch(
        `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(_ctx.cityName)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) { const d = await r.json(); photoUrl = d.thumbnail?.source || ''; }
    } catch {}

    const html = renderPanel(_ctx.cityName, _ctx.cp, photoUrl);
    if (typeof showPanel === 'function') {
      showPanel('🏠 Trouver un bien · ' + (_ctx.cityName || ''), html);
    }
    // Init sites cards
    window._rbUpdateSites();
  };

})();
