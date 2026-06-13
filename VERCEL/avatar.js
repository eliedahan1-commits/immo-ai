// ══════════════════════════════════════════════════════
// IMMO·AI — Avatar IA parlant
// ══════════════════════════════════════════════════════

(function(){
'use strict';

// ── Constantes ──
const STORAGE_KEY = 'immoai_avatar_prefs';
const HISTORY_KEY = 'immoai_avatar_history';
const MAX_HISTORY = 20;

// Avatars RPM publics (homme/femme)
// Pas de modèle 3D externe — avatar SVG maison utilisé
const AVATARS = {};

// ── État ──
let prefs = null;
let history = [];
let scene, camera, renderer, mixer, clock, avatarModel;
let _docCache = null;

const CARD_NAMES = {
  score:"Score global du quartier",
  dvf:"Prix des dernières transactions",
  loyers:"Estimation des loyers",
  insee:"Population, économie & société",
  logement:"Logement & habitat",
  mobilite:"Transports & mobilité douce",
  meteo:"Météo et qualité de l'air",
  bruit:"Carte du bruit",
  risques:"Risques naturels & industriels",
  ecoles:"Écoles & niveau scolaire",
  services:"Commerces, services & santé",
  fibre:"Connexion internet & fibre",
  demographie:"Démographie & attractivité",
  altitude:"Altitude & topographie",
  urbanisme:"Zonage, PLU & réglementation",
  aides:"Aides à l'achat (PTZ, APL…)",
  renov:"MaPrimeRénov' & aides travaux",
  profil:"Compatibilité de vie",
  recherche:"Trouver un bien",
  emprunt:"Capacité d'emprunt",
  mensualites:"Achat : Mensualités & coût total du crédit",
  cout:"Investissement locatif",
  location:"Location : budget & comparaison",
  close:""
};
let isSpeaking = false;
let isListening = false;
let recognition = null;
let currentUtterance = null;
let mouthMorphs = [];
let mouthInterval = null;
let panelOpen = false;

// ── Init principale ──
function init(){
  loadPrefs();
  injectHTML();
  injectStyles();
  setupFloatingButton();
  // La modale s'ouvre au premier clic sur l'avatar, pas au chargement
}

// ── Préférences ──
function loadPrefs(){
  try { prefs = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch(e){ prefs={}; }
  prefs = Object.assign({ configured:false, nom:'Ai1', fond:'Image1', vitesse:1, pitch:1 }, prefs);
  try { history = JSON.parse(sessionStorage.getItem(HISTORY_KEY)||'[]'); } catch(e){ history=[]; }
}
function savePrefs(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); }
function saveHistory(){ sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY))); }

// ── Injection HTML ──
function injectHTML(){
  const div = document.createElement('div');
  div.id = 'av-root';
  div.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9989;';
  div.innerHTML = `
  <!-- Bouton flottant -->
  <button id="av-trigger" title="Assistant IA" onclick="window._avatarToggle()">
    <span id="av-trigger-icon">◈</span>
    <span id="av-trigger-lbl">AI</span>
  </button>

  <!-- Panneau latéral -->
  <div id="av-panel">
    <div id="av-header">
      <div id="av-name-badge"></div>
      <div style="display:flex;gap:.5rem">
        <button class="av-icon-btn" id="av-play-btn" onclick="window._avatarPlay&&window._avatarPlay()" title="Relire">▶</button>
        <button class="av-icon-btn" id="av-stop-btn" onclick="window._avatarStop&&window._avatarStop()" title="Arrêter">⏹</button>
        <button class="av-icon-btn" id="av-settings-btn" onclick="window._avatarSettings()" title="Préférences">⚙️</button>
        <button class="av-icon-btn" onclick="window._avatarToggle()" title="Fermer">✕</button>
      </div>
    </div>
    <div id="av-canvas-wrap">
      <canvas id="av-canvas"></canvas>
      <div id="av-status"></div>
    </div>
    <div id="av-chat">
      <div id="av-messages"></div>
      <div id="av-input-row">
        <button id="av-mic-btn" onclick="window._avatarMic()" title="Parler">🎙️</button>
        <input id="av-text-input" type="text" placeholder="Posez votre question…" 
          onkeydown="if(event.key==='Enter')window._avatarSend()" />
        <button id="av-send-btn" onclick="window._avatarSend()">➤</button>
      </div>

    </div>
  </div>

  <!-- Modal préférences -->
  <div id="av-setup-modal">
    <div id="av-setup-box">
      <h3>Personnaliser votre assistant</h3>
      <label>Prénom de l'assistant</label>
      <input id="av-pref-nom" type="text" placeholder="Ai1" />
      <label>Fond immersif</label>
      <input type="hidden" id="av-pref-fond" value="Image1">
      <div id="av-fond-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:.8rem;max-height:200px;overflow-y:auto;"></div>
      <div id="av-avatar-wrap" style="display:none">
        <label>Avatar</label>
        <input type="hidden" id="av-pref-avatar" value="">
        <div id="av-avatar-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:.8rem;max-height:160px;overflow-y:auto;"></div>
      </div>
      <label>Voix <span style="font-size:.72rem;color:#8a7755">(voix françaises disponibles sur cet appareil)</span></label>
      <select id="av-pref-voix" style="width:100%;background:#100e0b;border:1px solid #2a2218;color:#e8d8b0;padding:.4rem .6rem;border-radius:6px;font-size:.78rem;margin-bottom:.5rem">
        <option value="">Auto (par défaut)</option>
      </select>
      <label>Volume</label>
      <input id="av-pref-volume" type="range" min="0" max="1" step="0.05" value="1" />
      <label>Vitesse de parole</label>
      <input id="av-pref-vitesse" type="range" min="0.6" max="1.6" step="0.1" value="1" />
      <label>Hauteur de voix</label>
      <input id="av-pref-pitch" type="range" min="0.5" max="2" step="0.1" value="1" />
      <div class="av-setup-actions">
        <button onclick="window._avatarSaveSetup()">Valider</button>
        <button class="av-btn-secondary" onclick="window._avatarTestVoice&&window._avatarTestVoice()">🔊 Tester</button>
        <button class="av-btn-secondary" onclick="window._avatarCloseSetup()">Annuler</button>
      </div>
    </div>
  </div>
  `;
  document.body.appendChild(div);
}

// ── Styles ──
function injectStyles(){
  const s = document.createElement('style');
  s.textContent = `
  #av-trigger {
    position:fixed; bottom:24px; right:24px; z-index:9990;
    pointer-events:auto;
    display:flex; align-items:center; gap:.5rem;
    padding:.6rem 1rem; border-radius:999px;
    background:linear-gradient(135deg,#1a1610,#2d2418);
    border:1.5px solid #b8832a; color:#dcc87a;
    font-size:.8rem; font-weight:700; cursor:pointer;
    box-shadow:0 4px 20px rgba(184,131,42,.35);
    transition:all .25s;
  }
  #av-trigger:hover { transform:translateY(-2px); box-shadow:0 6px 28px rgba(184,131,42,.5); }
  #av-trigger-icon { font-size:1.1rem; }

  #av-panel {
    position:fixed; top:0; right:0; bottom:0; z-index:9995;
    width:min(420px,100vw);
    background:#0f0d0a;
    border-left:1px solid #2a2218;
    display:flex; flex-direction:column;
    transform:translateX(100%);
    transition:transform .35s cubic-bezier(.4,0,.2,1);
    box-shadow:-8px 0 40px rgba(0,0,0,.6);
    pointer-events:none;
  }
  #av-panel.open { transform:translateX(0); pointer-events:auto; }

  #av-header {
    display:flex; justify-content:space-between; align-items:center;
    padding:.75rem 1rem;
    background:linear-gradient(135deg,#1a1610,#0f0d0a);
    border-bottom:1px solid #2a2218;
  }
  #av-name-badge {
    font-size:.85rem; font-weight:700; color:#dcc87a;
    letter-spacing:.08em;
  }
  .av-icon-btn {
    background:transparent; border:none; cursor:pointer;
    font-size:1rem; padding:.3rem .4rem; border-radius:6px;
    color:#8a7755; transition:all .2s;
  }
  .av-icon-btn:hover { background:#1a1610; color:#dcc87a; }

  #av-canvas-wrap {
    position:relative; flex:0 0 55%;
    background:#000;
    overflow:hidden;
  }
  #av-canvas { width:100%; height:100%; display:block; }
  #av-status {
    position:absolute; bottom:8px; left:50%; transform:translateX(-50%);
    font-size:.7rem; color:#8a7755; letter-spacing:.1em;
    background:rgba(0,0,0,.5); padding:.2rem .6rem; border-radius:999px;
    pointer-events:none;
  }

  #av-chat {
    flex:1; display:flex; flex-direction:column;
    overflow:hidden; padding:.75rem;
    gap:.5rem;
  }
  #av-messages {
    flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:.5rem;
    padding-right:.25rem;
  }
  #av-messages::-webkit-scrollbar { width:4px; }
  #av-messages::-webkit-scrollbar-track { background:transparent; }
  #av-messages::-webkit-scrollbar-thumb { background:#2a2218; border-radius:2px; }

  .av-msg {
    padding:.5rem .75rem; border-radius:10px; font-size:.78rem; line-height:1.55;
    max-width:88%;
  }
  .av-msg.user {
    background:#1a1610; border:1px solid #2a2218; color:#c8b88a;
    align-self:flex-end; border-bottom-right-radius:3px;
  }
  .av-msg.assistant {
    background:linear-gradient(135deg,#1e180f,#160f07);
    border:1px solid #b8832a44; color:#e8d8b0;
    align-self:flex-start; border-bottom-left-radius:3px;
  }
  .av-msg.assistant strong { color:#dcc87a; }
  .av-msg.thinking {
    background:#100e0b; border:1px dashed #2a2218; color:#5a5040;
    align-self:flex-start; font-style:italic;
  }

  #av-input-row {
    display:flex; gap:.4rem; align-items:center;
  }
  #av-text-input {
    flex:1; background:#1a1610; border:1px solid #2a2218;
    color:#e8d8b0; padding:.5rem .75rem; border-radius:8px;
    font-size:.78rem; outline:none;
    transition:border-color .2s;
  }
  #av-text-input:focus { border-color:#b8832a; }
  #av-text-input::placeholder { color:#7a6a50; }
  #av-mic-btn, #av-send-btn {
    background:#1a1610; border:1px solid #2a2218;
    color:#c8a85a; padding:.5rem .65rem; border-radius:8px;
    cursor:pointer; font-size:1rem; transition:all .2s;
  }
  #av-mic-btn:hover, #av-send-btn:hover { border-color:#b8832a; color:#dcc87a; }
  #av-mic-btn.active { background:#b8832a22; border-color:#b8832a; color:#dcc87a; animation:av-pulse 1s infinite; }



  #av-setup-modal {
    display:none; position:fixed; inset:0; z-index:10000;
    background:rgba(0,0,0,.75); align-items:center; justify-content:center;
    pointer-events:none;
  }
  #av-setup-modal.open { display:flex; pointer-events:auto; }
  #av-setup-box { pointer-events:auto; }
  #av-setup-box {
    background:#1a1610; border:1px solid #b8832a44;
    border-radius:12px; padding:1.5rem; width:min(780px,92vw);
    max-height:90vh; overflow-y:auto;
    color:#c8b88a;
  }
  #av-setup-box h3 { color:#dcc87a; margin:0 0 1rem; font-size:1rem; }
  #av-setup-box label { font-size:.75rem; color:#8a7755; display:block; margin:.6rem 0 .25rem; }
  #av-setup-box input[type=text], #av-setup-box input[type=range] {
    width:100%; background:#100e0b; border:1px solid #2a2218;
    color:#e8d8b0; padding:.45rem .7rem; border-radius:7px;
    font-size:.82rem; box-sizing:border-box;
  }
  .av-radio-row { display:flex; flex-wrap:wrap; gap:.8rem 1.2rem; margin:.2rem 0; }
  .av-radio-row label { color:#c8b88a; font-size:.82rem; display:flex; align-items:center; gap:.4rem; }
  .av-setup-actions { display:flex; gap:.75rem; margin-top:1.25rem; }
  .av-setup-actions button {
    flex:1; padding:.55rem; border-radius:8px; cursor:pointer; font-weight:600; font-size:.82rem;
    background:linear-gradient(135deg,#b8832a,#8a6020); border:none; color:#fff;
  }
  .av-btn-secondary { background:#1e180f !important; border:1px solid #2a2218 !important; color:#8a7755 !important; }
  .av-thumb { border:2px solid transparent; border-radius:6px; overflow:hidden; cursor:pointer; aspect-ratio:16/9; background:#0a0806; transition:border-color .15s; }
  .av-thumb-portrait { aspect-ratio:9/16; }
  .av-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .av-thumb:hover { border-color:rgba(184,131,42,.5); }
  .av-thumb.selected { border-color:#b8832a; box-shadow:0 0 0 1px #b8832a; }

  @media(min-width:600px){ #av-fond-grid{ grid-template-columns:repeat(5,1fr)!important; } #av-avatar-grid{ grid-template-columns:repeat(5,1fr)!important; } }
  @keyframes av-pulse {
    0%,100%{box-shadow:0 0 0 0 rgba(184,131,42,.4);}
    50%{box-shadow:0 0 0 6px rgba(184,131,42,.0);}
  }

  @media(max-width:1024px){
    #av-trigger { display:none !important; }
  }
  `;
  document.head.appendChild(s);
}

// ── Bouton flottant ──
function setupFloatingButton(){
  window._avatarToggle = togglePanel;
  window._avatarSend = sendMessage;
  window._avatarMic = toggleMic;
  window._avatarStop = stopSpeak;
  window._avatarPlay = replayLast;
  window._avatarTestVoice = testVoice;
  window._avatarSettings = showSetup;
  window._selectThumb = _selectThumb;
  window._avatarSaveSetup = saveSetup;
  window._avatarCloseSetup = closeSetup;
  window._avatarQuick = quickAction;
  window._adminTap = adminTap;
  updateNameBadge();
}

function togglePanel(){
  if(!prefs.configured){
    showSetup();
    return;
  }
  panelOpen = !panelOpen;
  document.getElementById('av-panel').classList.toggle('open', panelOpen);
  if(!panelOpen){ stopSpeak(); return; }
  if(panelOpen && !avatarModel) setTimeout(initThree, 100);
  if(panelOpen) setTimeout(populateVoiceSelect, 200); // pré-charger voix dès l'ouverture
  if(panelOpen && history.length===0) setTimeout(()=>avatarGreet(), 800);
}

function updateNameBadge(){
  const el = document.getElementById('av-name-badge');
  if(el) el.textContent = prefs.nom + ' · Assistant IMMO·AI';
}

// ── Three.js ──
function initThree(){
  const wrap = document.getElementById('av-canvas-wrap');
  if(!wrap) return;
  // Pas de modèle 3D — aller directement à l'avatar image
  showFallbackAvatar(wrap);
}

function loadScript(src, cb){
  const s = document.createElement('script');
  s.src = src; s.onload = cb;
  s.onerror = function(){ console.warn('Script failed:', src); if(cb) cb(); };
  document.head.appendChild(s);
}

function buildScene(canvas, wrap){
  clock = new THREE.Clock();

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;

  // Scène
  scene = new THREE.Scene();
  scene.background = null;

  // Caméra — plein pied, légèrement de face
  camera = new THREE.PerspectiveCamera(40, wrap.clientWidth/wrap.clientHeight, 0.1, 10);
  camera.position.set(0, 0.9, 2.2);
  camera.lookAt(0, 0.9, 0);

  // Lumières
  const amb = new THREE.AmbientLight(0xfff5e0, 0.6);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xfff5d0, 1.2);
  key.position.set(1,2,2); key.castShadow=true;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd0e8ff, 0.4);
  fill.position.set(-1,1,1);
  scene.add(fill);
  const back = new THREE.DirectionalLight(0xb8832a, 0.3);
  back.position.set(0,1,-2);
  scene.add(back);

  // Charger avatar
  const avatarUrl = prefs.avatar || (window._AVATAR_LIST&&window._AVATAR_LIST[0]) || 'images/avatar.png';
  setStatus('Chargement de l\'avatar…');

  if(typeof THREE.GLTFLoader !== 'undefined' || (window.THREE && window.THREE.GLTFLoader)){
    const loader = new THREE.GLTFLoader();
    loader.load(avatarUrl,
      function(gltf){
        avatarModel = gltf.scene;
        // Centrer le modèle
        const box = new THREE.Box3().setFromObject(avatarModel);
        const center = box.getCenter(new THREE.Vector3());
        avatarModel.position.sub(center);
        avatarModel.position.y += (box.max.y - box.min.y)/2 - 0.1;
        scene.add(avatarModel);

        // Morph targets pour la bouche
        avatarModel.traverse(function(node){
          if(node.isMesh && node.morphTargetInfluences){
            const names = node.morphTargetDictionary || {};
            const mouthKeys = ['mouthOpen','viseme_aa','jawOpen','mouthO','V_Open'];
            mouthKeys.forEach(function(k){
              if(k in names) mouthMorphs.push({mesh:node, idx:names[k]});
            });
          }
        });

        // Animations idle
        if(gltf.animations && gltf.animations.length){
          mixer = new THREE.AnimationMixer(avatarModel);
          const idle = gltf.animations.find(function(a){ return /idle|breath/i.test(a.name); }) || gltf.animations[0];
          if(idle) mixer.clipAction(idle).play();
        }

        setStatus('');
        animate();
      },
      undefined,
      function(err){
        console.warn('Avatar 3D non disponible:', err);
        setStatus('Avatar en cours de chargement…');
        showFallbackAvatar(wrap);
        animate();
      }
    );
  } else {
    setStatus('');
    showFallbackAvatar(wrap);
    animate();
  }

  // Resize
  window.addEventListener('resize', function(){
    if(!renderer||!camera) return;
    const w=wrap.clientWidth, h=wrap.clientHeight;
    renderer.setSize(w,h);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
  });
}

function showFallbackAvatar(wrap){
  // Supprimer ancien fallback si présent
  const old = document.getElementById('av-fallback');
  if(old) old.remove();

  const fb = document.createElement('div');
  fb.id = 'av-fallback';
  fb.style.cssText = 'position:absolute;inset:0;display:block;background:#000;overflow:hidden;';

  const imgSrc = prefs.avatar || (window._AVATAR_LIST&&window._AVATAR_LIST[0]) || 'images/avatar.png';

  // Div fond solide derrière l'image (background-color sur <img> n'affecte pas les px transparents)
  const bgDiv = document.createElement('div');
  bgDiv.style.cssText = 'position:absolute;inset:0;background:#000;z-index:0;';
  fb.appendChild(bgDiv);

  const img = document.createElement('img');
  img.id = 'av-img';
  img.alt = prefs.nom || 'Assistant';
  img.style.cssText = 'position:absolute;inset:0;z-index:1;width:100%;height:100%;object-fit:contain;object-position:top center;display:block;';
  img.src = imgSrc;

  fb.appendChild(img);
  wrap.appendChild(fb);

  const cv = document.getElementById('av-canvas');
  if(cv) cv.style.display = 'none';
}


function replayLast(){
  const msgs = document.querySelectorAll('.av-msg.assistant');
  if(!msgs.length){
    // Pas encore de message : lancer le salut
    avatarGreet();
    return;
  }
  const last = msgs[msgs.length-1].textContent;
  if(last) speak(last);
}

function testVoice(){
  const v = parseFloat(document.getElementById('av-pref-vitesse')?.value||'1');
  const p = parseFloat(document.getElementById('av-pref-pitch')?.value||'1');
  const nom = document.getElementById('av-pref-nom')?.value || prefs.nom || 'Ai1';
  window.speechSynthesis.cancel();
  function doSpeak(){
    const utt = new SpeechSynthesisUtterance('Bonjour, je suis ' + nom + '. Je suis votre assistant IMMO AI, specialiste de l immobilier.');
    utt.lang = 'fr-FR'; utt.rate = v; utt.pitch = p;
    const voices = window.speechSynthesis.getVoices();
    const frVoices = voices.filter(v=>v.lang.startsWith('fr'));
    if(frVoices.length){
      const selVoix = document.getElementById('av-pref-voix')?.value || prefs.voix || '';
      if(selVoix){
        const chosen = voices.find(v=>v.name===selVoix);
        if(chosen){ utt.voice=chosen; }
      } else {
        utt.voice = frVoices[0];
      }
    }
    utt.onend = function(){ setTimeout(populateVoiceSelect, 300); };
    window.speechSynthesis.speak(utt);
  }
  doSpeak();
}

// ── TTS ──
function speak(text){
  if(!text) return;
  if(window.speechSynthesis.speaking||window.speechSynthesis.pending||isSpeaking) window.speechSynthesis.cancel();
  let clean = text
    .replace(/<[^>]+>/g,'')
    .replace(/\*\*/g,'').replace(/\*/g,'')
    .replace(/\/10/g,' sur 10')
    .replace(/\/mois/g,' par mois')
    .replace(/\/an/g,' par an')
    .replace(/\/m2/g,' au mètre carré')
    .replace(/\/km2/g,' au km carré')
    .replace(/\//g,' ');
  // Fix accents perdus par le LLM — regex case-insensitive
  (function(){
    var fixes = [
      [/\bM[eé]t[eé]o\b/g,'Météo'],[/\bqualit[eé]\b/gi,'qualité'],
      [/\bD[eé]mographie\b/gi,'Démographie'],[/\battractivit[eé]\b/gi,'attractivité'],
      [/\bMobilit[eé]\b/gi,'Mobilité'],[/\bCompatibilit[eé]\b/gi,'Compatibilité'],
      [/\bMensualit[eé]s\b/gi,'Mensualités'],[/\bco[uû]t\b/gi,'coût'],
      [/\bcr[eé]dit\b/gi,'crédit'],[/\b[EÉ]coles\b/g,'Écoles'],
      [/\[eé]conomie\b/gi,'économie'],[/\bfiscalit[eé]\b/gi,'fiscalité'],
      [/\br[eé]glementation\b/gi,'réglementation'],[/\br[eé]novation\b/gi,'rénovation'],
      [/\balt[iî]tude\b/gi,'altitude'],[/\burbanisme\b/gi,'urbanisme'],
      [/\bLogement\b/g,'Logement'],[/\brisques\b/gi,'risques'],
      [/\bservices\b/gi,'services'],[/\bfibre\b/gi,'fibre'],
    ];
    fixes.forEach(function(f){ clean = clean.replace(f[0], f[1]); });
  })();
  // Fix °C / C seul après un nombre → "degrés" pour la TTS
  clean = clean.replace(/(\d+[,.]?\d*)\s*°?C\b/g,'$1 degrés');
  currentUtterance = new SpeechSynthesisUtterance(clean);
  currentUtterance.lang = 'fr-FR';
  currentUtterance.rate = parseFloat(prefs.vitesse) || 1;
  currentUtterance.pitch = parseFloat(prefs.pitch) || 1;
  currentUtterance.volume = parseFloat(prefs.volume) || 1;

  // Choisir une voix française adaptée au genre ou à la sélection manuelle
  function applyVoice(utt){
    const voices = window.speechSynthesis.getVoices();
    if(!voices.length) return;
    // 1. Voix choisie manuellement par l'utilisateur
    if(prefs.voix){
      const chosen = voices.find(v=>v.name===prefs.voix);
      if(chosen){ utt.voice=chosen; return; }
    }
    // 2. Auto selon genre
    const frVoices = voices.filter(v=>v.lang.startsWith('fr'));
    if(!frVoices.length) return;
    utt.voice = frVoices[0];
  }
  // Appliquer la voix — addEventListener évite le conflit avec populateVoiceSelect
  const _vNow = window.speechSynthesis.getVoices();
  if(_vNow.length){ applyVoice(currentUtterance); }
  else {
    window.speechSynthesis.addEventListener('voiceschanged', function _hv(){
      window.speechSynthesis.removeEventListener('voiceschanged', _hv);
      applyVoice(currentUtterance);
    });
  }

  currentUtterance.onstart = function(){ isSpeaking=true; setStatus('Parle…'); };
  currentUtterance.onend = function(){ isSpeaking=false; currentUtterance=null; setStatus(''); };
  currentUtterance.onerror = function(){ isSpeaking=false; currentUtterance=null; setStatus(''); };
  window.speechSynthesis.speak(currentUtterance);
}

function stopSpeak(){
  window.speechSynthesis.cancel();
  isSpeaking=false; setStatus('');
}

// ── STT ──
function toggleMic(){
  if(isListening){ stopListening(); return; }
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRec){ addMsg('assistant','La reconnaissance vocale n\'est pas disponible sur ce navigateur.'); return; }
  recognition = new SpeechRec();
  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.onstart = function(){
    isListening=true;
    document.getElementById('av-mic-btn').classList.add('active');
    setStatus('Écoute…');
  };
  recognition.onresult = function(e){
    const txt = e.results[0][0].transcript;
    document.getElementById('av-text-input').value = txt;
    stopListening();
    sendMessage();
  };
  recognition.onerror = function(){ stopListening(); };
  recognition.onend = function(){ stopListening(); };
  recognition.start();
}
function stopListening(){
  isListening=false;
  document.getElementById('av-mic-btn').classList.remove('active');
  setStatus('');
  if(recognition) try{ recognition.stop(); }catch(e){}
}

// ── Chat ──
function addMsg(role, text){
  // Parser [CARD:id] dans les réponses assistant
  let displayText = text;
  if(role === 'assistant'){
    const cardMatches = [...(text.matchAll(/\[CARD:([^\]]+)\]/gi)||[])];
    cardMatches.forEach(m=>{
      const cardId = m[1].toLowerCase();
      if(cardId === 'close'){
        setTimeout(()=>{
          // Si on est sur une page go() (financement, etc.), retour à l'analyse
          const goPages = ['emprunt','mensualites','cout','location','aides','renov','urbanisme','recherche','profil'];
          const activePage = document.querySelector('.page.on');
          const activeId = activePage?.id?.replace('p-','');
          if(activeId && goPages.includes(activeId)){
            if(typeof go==='function') go('analyse');
          } else {
            if(typeof closePanel==='function') closePanel();
          }
        }, 400);
      } else {
        const goCards = ['emprunt','mensualites','cout','location','aides','renov','urbanisme','recherche','profil'];
        setTimeout(()=>{
          if(goCards.includes(cardId)){
            if(typeof go==='function') go(cardId);
          } else {
            // En mode immersif, p-analyse est toujours visible — on saute go('analyse')
            // pour éviter les effets de bord (scroll, nav) qui cassent le 2e appel en Edge
            const isImm = document.body && document.body.classList.contains('imm-on');
            if(!isImm && typeof go==='function') go('analyse');
            const delay = isImm ? 50 : 350;
            setTimeout(()=>{
              if(typeof showDetail==='function') showDetail(cardId);
            }, delay);
          }
        }, 600);
      }
    });
    displayText = text.replace(/\[CARD:[^\]]+\]/gi, '').replace(/\s{2,}/g,' ').trim();
  }
  const el = document.createElement('div');
  el.className = 'av-msg ' + role;
  el.innerHTML = role==='assistant' ? mdLight(displayText) : escHtml(text);
  const msgs = document.getElementById('av-messages');
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  if(role!=='thinking') history.push({role:role==='user'?'user':'assistant', content:displayText});
  saveHistory();
  return el;
}

function removeThinking(){
  const t = document.querySelector('.av-msg.thinking');
  if(t) t.remove();
}

function mdLight(t){
  return t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');
}
function escHtml(t){ return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function fetchDoc(){
  if(_docCache) return _docCache;
  try {
    const r = await fetch('/documentation/doc.txt');
    if(r.ok){ _docCache = await r.text(); return _docCache; }
  } catch(e){}
  return null;
}

function needsDoc(txt){
  const kw = ["comment","utiliser","fonctionne","comment faire","aide-moi","guide","documentation","expliquer","tutoriel","etapes","comment ca","comment acceder","comment ouvrir","comment calculer","comment saisir","comment renseigner","c'est quoi","qu'est-ce","a quoi sert","comment trouver","comment simuler","comment obtenir"];
  const t = txt.toLowerCase();
  return kw.some(k => t.includes(k));
}


// Normalise les tags non-standard → [CARD:id]
// Gère [Meteo], [CARD:Meteo], [Altitude & topographie], [Démographie & attractivité]...
function normalizeCardTags(text){
  // Enlever accents pour comparaison floue
  const _norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  // Construire un index valeur→clé sur CARD_NAMES
  const _valIdx = {};
  for(const [k,v] of Object.entries(CARD_NAMES)){
    if(k==='close') continue;
    _valIdx[_norm(v)] = k;
  }
  // Normaliser [CARD:Id] → [CARD:id] (lowercase)
  text = text.replace(/\[CARD:([^\]]+)\]/gi, (_,id)=>'[CARD:'+id.trim().toLowerCase()+']');
  // Convertir [Anything] en fin de message si ça correspond à une clé ou un label
  text = text.replace(/\[([^\]]+)\]\s*$/, function(match, name){
    const n = _norm(name);
    if(n in CARD_NAMES)  return '[CARD:'+n+']';          // clé exacte ex: [meteo]
    if(n in _valIdx)     return '[CARD:'+_valIdx[n]+']'; // label exact ex: [Altitude & topographie]
    // Correspondance partielle : label contient la clé
    for(const [k,v] of Object.entries(CARD_NAMES)){
      if(k==='close') continue;
      if(n.includes(k) || _norm(v).includes(n)) return '[CARD:'+k+']';
    }
    return match;
  });
  return text;
}

async function sendMessage(){
  const inp = document.getElementById('av-text-input');
  const txt = (inp.value||'').trim();
  if(!txt) return;
  inp.value = '';
  if(isSpeaking) stopSpeak();
  addMsg('user', txt);
  const thinking = addMsg('thinking', prefs.nom + ' réfléchit…');
  let docCtx = '';
  if(needsDoc(txt)){
    const doc = await fetchDoc();
    if(doc) docCtx = '\n\nDOCUMENTATION IMMO·AI (utiliser pour répondre aux questions d\'utilisation) :\n' + doc;
  }
  try {
    const response = await callAvatarAI(txt, docCtx);
    removeThinking();
    const normResponse = normalizeCardTags(response);
    addMsg('assistant', normResponse);
    speak(normResponse.replace(/\[CARD:[^\]]+\]/gi, "").trim());
  } catch(e){
    removeThinking();
    const err = e.message==='no_key'
      ? 'Clé Groq non configurée. Veuillez l\'ajouter dans les paramètres.'
      : 'Désolée, une erreur est survenue : ' + e.message;
    addMsg('assistant', err);
  }
}

async function callAvatarAI(userMsg, docCtx=''){
  if(typeof callAI !== 'function') throw new Error('callAI non disponible');
  const system = buildSystemPrompt();
  const msgs = buildMessages(userMsg, docCtx);
  // Appel direct à l'API Groq avec historique
  const _gk = window.groqKey || localStorage.getItem('immoai_groq') || ''; if(!_gk) throw new Error('no_key');
  // Modèles en cascade : si 429 sur l'un, on passe au suivant
  const AVATAR_MODELS = [
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-3.1-8b-instant',
    'groq/compound-mini'
  ];
  let _exhausted = JSON.parse(sessionStorage.getItem('avatar_ex')||'[]');
  function _markEx(m){ if(!_exhausted.includes(m)){ _exhausted.push(m); sessionStorage.setItem('avatar_ex', JSON.stringify(_exhausted)); } }
  let candidates = AVATAR_MODELS.filter(m=>!_exhausted.includes(m));
  if(!candidates.length){ _exhausted=[]; sessionStorage.setItem('avatar_ex','[]'); candidates=[...AVATAR_MODELS]; }
  for(const model of candidates){
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_gk},
      body:JSON.stringify({model, messages:msgs, max_tokens:400, temperature:0.7})
    });
    if(r.status===429){ _markEx(model); continue; }
    if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.error?.message||'Erreur Groq'); }
    return (await r.json()).choices[0].message.content;
  }
  throw new Error('rate_limit');
}

function buildAllData(){
  const ins=window._inseeData?.commune, sd=window._scoreData, dvf=window._dvfData;
  const dept=window._dvfDeptData, mel=window._melodiData, nat=window._melodiNational;
  const mob=window._mobiliteData, svc=window._servicesData, eco=window._ecolesData;
  const meteo=window._meteoData, bruit=window._bruitData, fibre=window._fibreData;
  const risques=window._risquesData, demo=window._demographieData, aq=window._qualiteAirData;
  const loyers=window._loyersData, altData=window._altitudeData, cr=window._criminaliteData;
  const ER=window._empruntResult, MR=window._mensualitesResult, CR=window._coutResult;
  const IR=window._investResult, RR=window._renovResult;
  const LB=window._locationBudgetResult, LV=window._locationVsAchatResult;
  const addr=window.currentAddress||'';
  const L=[];
  const fmt=n=>n!=null?Math.round(n).toLocaleString('fr-FR'):null;
  const p=(label,val)=>{if(val!=null&&val!=='')L.push(label+': '+val);};

  if(addr) p('Adresse',addr);
  if(ins) p('Commune',ins.nom+(ins.departement?', dep.'+ins.departement:'')+(ins.region?', '+ins.region:'')+(ins.population?' pop='+fmt(ins.population):'')+(ins.codePostal?' CP='+ins.codePostal:'')+(ins.altitude?' alt='+ins.altitude+'m':altData?.altitude!=null?' alt='+altData.altitude+'m':''));

  if(sd) p('Score global',sd.note?.toFixed(1)+'/10 '+( sd.items?.map(i=>i.label+':'+i.val?.toFixed(1)).join('|')||''));

  if(dvf?.stats){
    const vs=dept?.medianM2?(' vs_dept='+(Math.round((dvf.stats.medianM2-dept.medianM2)/dept.medianM2*100)>0?'+':'')+Math.round((dvf.stats.medianM2-dept.medianM2)/dept.medianM2*100)+'%'):'';
    p('DVF','median='+fmt(dvf.stats.medianM2)+'€/m2 min='+fmt(dvf.stats.minM2)+' max='+fmt(dvf.stats.maxM2)+' nb='+dvf.count+vs);
    if(dvf.recentes?.length) p('Transactions recentes',dvf.recentes.slice(0,4).map(t=>(t.date||'?')+' '+(t.type||'?')+' '+(t.surf||'?')+'m2 '+(t.prixM2||'?')+'€/m2 '+(t.prix||'?')+'€').join(' | '));
  }
  if(loyers?.estLoyer){const ly=Object.entries(loyers.estLoyer).filter(([k,v])=>v).map(([k,v])=>k+':'+fmt(v)+'€').join(' '); p('Loyers estimés',ly+(loyers.rendement?' rdt='+Math.round(loyers.rendement*100)+'%':''));}
  if(mel){
    const vsR=nat?.revenuMedian&&mel.revenuMedian?(Math.round((mel.revenuMedian-nat.revenuMedian)/nat.revenuMedian*100)>0?'+':'')+Math.round((mel.revenuMedian-nat.revenuMedian)/nat.revenuMedian*100)+'%':'';
    p('INSEE/Melodi','rev_median='+fmt(mel.revenuMedian/12)+'€/mois'+( vsR?' vs_nat='+vsR:'')+(mel.tauxChomage!=null?' chomage='+mel.tauxChomage+'%':'')+(mel.pctPropri!=null?' proprio='+mel.pctPropri+'%':'')+(mel.pctBac5!=null?' bac5='+mel.pctBac5+'%':''));
  }
  if(mob) p('Mobilite','score='+mob.score+'/10'+(mob.stats?.metro?' metro='+mob.stats.metro:'')+(mob.stats?.arretsBus?' bus='+mob.stats.arretsBus:'')+(mob.stats?.velos?' velos='+mob.stats.velos:''));
  if(svc) p('Services','total='+svc.total+(svc.sante?' sante='+svc.sante:'')+(svc.commerces?' commerces='+svc.commerces:''));
  if(eco) p('Ecoles','total='+eco.total+(eco.ips!=null?' IPS='+eco.ips:''));
  if(meteo?.ensoleillement) p('Meteo',meteo.ensoleillement.heuresAnnuelles+'h/an '+(meteo.temperatures?.maxMoyenne!=null?'max='+meteo.temperatures.maxMoyenne+'°C min='+meteo.temperatures.minMoyenne+'°C ':'')+(meteo.precipitations?meteo.precipitations.annuellesMm+'mm/an '+(meteo.precipitations.joursParAn||'')+'j-pluie/an':''));
  if(aq) p('Qualite air','AQI='+aq.aqi+' '+( aq.label||'')+(aq.pm25?' PM2.5='+aq.pm25:'')+(aq.pm10?' PM10='+aq.pm10:''));
  if(bruit?.niveauCode) p('Bruit',bruit.niveauCode+(bruit.score?' score='+bruit.score:''));
  if(risques) p('Risques',risques.total+' identifie(s)'+(risques.score?' score='+risques.score:''));
  if(fibre?.fibre) p('Fibre',fibre.fibre.eligible?'Eligible':'Non eligible');
  if(cr?.success&&cr.indicateurs) p('Criminalite',Object.entries(cr.indicateurs).slice(0,4).map(([k,v])=>k+'='+v.taux).join(' '));
  if(demo?.rows?.length>=2){const r=demo.rows;p('Evolution pop',((r[r.length-1].pop-r[0].pop)/r[0].pop*100).toFixed(1)+'% ('+r[0].year+'-'+r[r.length-1].year+')');}
  if(altData?.altitude) p('Altitude',altData.altitude+'m');

  if(ER) p('Simulation emprunt','rev='+ER.revenus+'€ apport='+ER.apport+'€ duree='+ER.duree+'ans taux='+ER.taux.toFixed(2)+'% capacite='+fmt(ER.capaciteEmprunt)+'€ budget_net='+fmt(ER.budgetNetNotaire)+'€ mens_max='+fmt(ER.mensualiteMax)+'€/mois');
  if(MR) p('Simulation mensualites','montant='+fmt(MR.montantEmprunte)+'€ mens='+fmt(MR.mensualiteTotal)+'€/mois cout_total='+fmt(MR.coutTotal)+'€');
  if(CR) p('Simulation cout achat','prix='+fmt(CR.prix)+'€ cout_total='+fmt(CR.coutTotal)+'€ mens='+fmt(CR.mensualite)+'€/mois');
  if(IR) p('Simulation invest locatif','rdt_brut='+IR.rendementBrut?.toFixed(2)+'% rdt_net='+IR.rendementNet?.toFixed(2)+'% CF_net='+(IR.cashflowNet>=0?'+':'')+IR.cashflowNet+'€/mois');
  if(LB) p('Simulation budget loyer','rev='+LB.revenus+'€ loyer_max='+LB.loyerMax33+'€ loyer_pur='+LB.loyerReel+'€ budget='+LB.budgetTotal+'€');
  if(LV) p('Simulation louer vs acheter',(LV.gain>=0?'Achat':'Location')+' avantageux de '+fmt(Math.abs(LV.gain))+'€ sur '+LV.duree+'ans'+(LV.crossoverAn?' bascule=an'+LV.crossoverAn:''));
  if(RR) p('Simulation MaPrimeRenov','aide='+fmt(RR.aide)+'€ tranche='+RR.tranche+' DPE:'+RR.dpeAvant+'->'+RR.dpeApres);

  return L.join('\n');
}


function buildSystemPrompt(){
  const dataCtx = buildAllData();
  const nom = prefs.nom || 'Ai1';

  return "Tu es " + nom + ", l'assistante IA experte en immobilier de IMMO·AI. Tu parles en francais, de facon naturelle, concise et professionnelle (3-5 phrases max sauf si detail demande).\n" +
"\n" +
"Tu connais parfaitement l'application IMMO·AI et ses sections. Pour ouvrir une section, utilise [CARD:id] UNIQUEMENT en fin de reponse, jamais dans le texte visible.\n" +
"Sections disponibles (nom → id) :\n" +
"  Score global du quartier → score | Prix des dernieres transactions → dvf | Estimation des loyers → loyers\n" +
"  Population, economie & societe → insee | Logement & habitat → logement | Transports & mobilite douce → mobilite\n" +
"  Meteo et qualite de l'air → meteo | Carte du bruit → bruit | Risques naturels & industriels → risques\n" +
"  Ecoles & niveau scolaire → ecoles | Commerces, services & sante → services | Connexion internet & fibre → fibre\n" +
"  Demographie & attractivite → demographie | Altitude & topographie → altitude | Zonage, PLU & reglementation → urbanisme\n" +
"  Aides a l'achat (PTZ, APL) → aides | MaPrimeRenov & aides travaux → renov\n" +
"  Compatibilite de vie → profil | Trouver un bien → recherche\n" +
"Simulateurs Mon Financement (a ouvrir avec [CARD:id]) :\n" +
"  Capacite emprunt → emprunt | Mensualites credit → mensualites | Investissement locatif → cout\n" +
"  Budget loyer / louer vs acheter → location\n" +
"\n" +
"DONNEES DE L'ANALYSE EN COURS :\n" +
dataCtx + "\n" +
"\n" +
"INSTRUCTIONS IMPORTANTES :\n" +
"1. Tu connais TOUTES les donnees ci-dessus par coeur. Utilise-les pour repondre avec precision.\n" +
"2. Si une donnee n'est PAS dans les donnees ci-dessus (ex: prix d'un bien specifique), dis-le clairement sans inventer.\n" +
"3. Ecris toujours le NOM COMPLET de la section dans ton texte (ex: Prix des dernieres transactions, Score global du quartier, Transports & mobilite douce). PUIS ajoute [CARD:id] EN TOUTE FIN de reponse UNIQUEMENT (apres le dernier mot), jamais au milieu du texte. Max 2 cartes par reponse.\n" +
"4. Pour fermer une carte : [CARD:close]\n" +
"5. Tu peux mentionner plusieurs cartes dans une meme reponse.\n" +
"6. JAMAIS d'information exterieure ou inventee. Si absent des donnees = 'Cette information n'est pas dans l'analyse IMMO-AI.'\n" +
"7. Si une donnee demandee n'est pas encore chargee ou renseignee (simulateur vide, carte non ouverte), ouvre la carte correspondante avec [CARD:id] et invite l'utilisateur a la consulter ou renseigner ses informations.\n" +
"REGLE ABSOLUE : Des que tu mentionnes une section ou un simulateur, tu DOIS terminer ta reponse par [CARD:id] correspondant. TOUJOURS. Sans exception.";
}


function buildMessages(userMsg, docCtx=''){
  const system = buildSystemPrompt();
  const msgs = [{role:'system', content:system + docCtx}];
  // Inclure les 6 derniers échanges pour le contexte
  const recent = history.filter(function(h){ return h.role==='user'||h.role==='assistant'; }).slice(-4);
  recent.forEach(function(h){ msgs.push({role:h.role, content:h.content}); });
  msgs.push({role:'user', content:userMsg});
  return msgs;
}

// ── Actions rapides ──
function quickAction(type){
  const questions = {
    analyse: 'Peux-tu me faire un résumé complet de cette analyse et me donner ton avis ?',
    guide: 'Comment fonctionne IMMO·AI ? Explique-moi les différentes sections.',
    score: 'Explique-moi le score global et ce qu\'il signifie pour cet adresse.',
    prix: 'Que penses-tu du marché immobilier pour cette adresse ? Est-ce un bon prix ?'
  };
  const q = questions[type];
  if(q){
    document.getElementById('av-text-input').value = q;
    sendMessage();
  }
}

// ── Message d'accueil ──
function avatarGreet(){
  const ins = window._inseeData?.commune;
  const addr = window.currentAddress;
  let msg;
  if(addr && ins){
    msg = `Bonjour ! Je suis **${prefs.nom}**, votre assistante IMMO·AI. J'ai analysé **${addr}** à **${ins.nom}**. Que souhaitez-vous savoir sur ce quartier ?`;
  } else if(addr){
    msg = `Bonjour ! Je suis **${prefs.nom}**, votre assistante IMMO·AI. J'ai l'analyse de **${addr}** sous les yeux. Posez-moi vos questions !`;
  } else {
    msg = `Bonjour ! Je suis **${prefs.nom}**, votre assistante IMMO·AI. Commencez par rechercher une adresse pour que je puisse vous accompagner dans votre analyse.`;
  }
  addMsg('assistant', msg);
  speak(msg.replace(/\*\*/g,''));
}

// ── Setup modal ──
function populateVoiceSelect(){
  const sel = document.getElementById('av-pref-voix');
  if(!sel) return;
  function fill(voices){
    if(!voices.length) return false;
    const frVoices = voices.filter(v=>v.lang.startsWith('fr'));
    const displayVoices = frVoices.length ? frVoices : voices;
    sel.innerHTML = '<option value="">Auto (par défaut)</option>';
    displayVoices.forEach(v=>{
      const opt = document.createElement('option');
      opt.value = v.name;
      const tag = frVoices.length ? '' : ' ['+v.lang+']';
      opt.textContent = v.name + tag + (v.localService?' 💾':' 🌐');
      if(prefs.voix===v.name) opt.selected=true;
      sel.appendChild(opt);
    });
    return true;
  }
  // Essai immédiat
  if(fill(window.speechSynthesis.getVoices())) return;
  // Chrome nécessite un appel speak() pour charger les voix
  const silent = new SpeechSynthesisUtterance(' ');
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
  // Retry toutes les 200ms pendant 4s
  let tries = 0;
  const retry = setInterval(function(){
    if(fill(window.speechSynthesis.getVoices()) || ++tries > 50) clearInterval(retry);
  }, 200);
  // Fallback voiceschanged
  window.speechSynthesis.addEventListener('voiceschanged', function _hp(){
    window.speechSynthesis.removeEventListener('voiceschanged', _hp);
    fill(window.speechSynthesis.getVoices());
    clearInterval(retry);
  });
}

function _selectThumb(gridId, hiddenId, val){
  document.querySelectorAll('#'+gridId+' .av-thumb').forEach(el=>el.classList.remove('selected'));
  const found = document.querySelector('#'+gridId+' .av-thumb[data-val="'+val+'"]');
  if(found) found.classList.add('selected');
  const inp = document.getElementById(hiddenId);
  if(inp) inp.value = val;
}
function populateFondDropdown(){
  const grid = document.getElementById('av-fond-grid');
  if(!grid) return;
  const map = window._BG_MAP || {};
  const keys = Object.keys(map);
  if(!keys.length) return;
  const cur = document.getElementById('av-pref-fond')?.value || 'Image1';
  grid.innerHTML = keys.map(k=>`<div class="av-thumb${k===cur?' selected':''}" data-val="${k}" onclick="_selectThumb('av-fond-grid','av-pref-fond','${k}')" title="${k}"><img src="${map[k]}" alt="${k}" loading="lazy"></div>`).join('');
}
function populateAvatarDropdown(){
  const list = window._AVATAR_LIST || [];
  const wrap = document.getElementById('av-avatar-wrap');
  const grid = document.getElementById('av-avatar-grid');
  if(!wrap || !grid) return;
  if(list.length <= 1){ wrap.style.display='none'; return; }
  wrap.style.display='block';
  const cur = document.getElementById('av-pref-avatar')?.value || list[0] || '';
  grid.innerHTML = list.map((u,i)=>{
    const lbl = i===0?'Avatar 1':'Avatar '+(i+1);
    return `<div class="av-thumb av-thumb-portrait${u===cur?' selected':''}" data-val="${u}" onclick="_selectThumb('av-avatar-grid','av-pref-avatar','${u}')" title="${lbl}"><img src="${u}" alt="${lbl}" loading="lazy"></div>`;
  }).join('');
}
window._avatarOnAssetsReady = function(){
  populateFondDropdown();
  populateAvatarDropdown();
};
function showSetup(){
  const modal = document.getElementById('av-setup-modal');
  if(!modal) return;
  populateFondDropdown();
  populateAvatarDropdown();
  document.getElementById('av-pref-nom').value = prefs.nom || '';
  if(prefs.fond) _selectThumb('av-fond-grid','av-pref-fond', prefs.fond);
  if(prefs.avatar) _selectThumb('av-avatar-grid','av-pref-avatar', prefs.avatar);
  document.getElementById('av-pref-vitesse').value = prefs.vitesse || 1;
  if(document.getElementById('av-pref-volume')) document.getElementById('av-pref-volume').value = prefs.volume || 1;
  document.getElementById('av-pref-pitch').value = prefs.pitch || 1;
  modal.classList.add('open');
  populateVoiceSelect();
}
function closeSetup(){
  document.getElementById('av-setup-modal').classList.remove('open');
}
function saveSetup(){
  const nom = document.getElementById('av-pref-nom').value.trim() || 'Ai1';
  const vitesse = parseFloat(document.getElementById('av-pref-vitesse').value);
  const pitch = parseFloat(document.getElementById('av-pref-pitch').value);
  const volume = parseFloat(document.getElementById('av-pref-volume')?.value) || 1;
  const voix = document.getElementById('av-pref-voix')?.value || '';
  const fond = document.getElementById('av-pref-fond')?.value || prefs.fond || 'Image1';
  const avatar = document.getElementById('av-pref-avatar')?.value || prefs.avatar || (window._AVATAR_LIST&&window._AVATAR_LIST[0]) || 'images/avatar.png';
  const fondChange = fond !== prefs.fond;
  prefs = { configured:true, nom, fond, avatar, vitesse, pitch, volume, voix };
  savePrefs();
  closeSetup();
  updateNameBadge();
  // Ouvrir le panneau après configuration
  if(!panelOpen) togglePanel();
  if(fondChange){
    if(typeof window._immUpdateBg === 'function') window._immUpdateBg();
  }
}

// ── Utilitaires ──
function setStatus(txt){
  const el = document.getElementById('av-status');
  if(el) el.textContent = txt;
}


// ── Console Admin (5 clics sur version badge) ──
let _adminTaps = 0, _adminTimer = null;
function adminTap(){
  _adminTaps++;
  clearTimeout(_adminTimer);
  if(_adminTaps >= 5){
    _adminTaps = 0;
    showAdminConsole();
  } else {
    _adminTimer = setTimeout(()=>{ _adminTaps=0; }, 2000);
  }
}
function showAdminConsole(){
  const existing = document.getElementById('admin-console');
  if(existing){ existing.remove(); return; }
  const el = document.createElement('div');
  el.id = 'admin-console';
  el.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99999;background:#1a1610;border:1px solid #b8832a;border-radius:12px;padding:1rem;width:280px;box-shadow:0 8px 32px rgba(0,0,0,.6);font-size:.78rem;color:#e8d8b0';
  const currentKey = window.groqKey || localStorage.getItem('immoai_groq') || '';
  el.innerHTML = `
    <div style="font-weight:700;color:#dcc87a;margin-bottom:.75rem;font-size:.82rem">⚙️ Console Admin</div>
    <label style="font-size:.7rem;color:#8a7755;display:block;margin-bottom:.3rem">Clé Groq API</label>
    <input id="admin-groq-key" type="password" value="${currentKey}"
      style="width:100%;background:#100e0b;border:1px solid #2a2218;color:#e8d8b0;padding:.4rem .6rem;border-radius:6px;font-size:.75rem;box-sizing:border-box;margin-bottom:.6rem"/>
    <div style="display:flex;gap:.5rem">
      <button onclick="
        const k=document.getElementById('admin-groq-key').value.trim();
        if(k){localStorage.setItem('immoai_groq',k);window.groqKey=k;}
        document.getElementById('admin-console').remove();
        const dot=document.getElementById('aiDot');
        const lbl=document.getElementById('aiLbl');
        if(dot)dot.className='ai-dot on';
        if(lbl)lbl.textContent='Groq · IA automatique';
      " style="flex:1;padding:.4rem;background:linear-gradient(135deg,#b8832a,#8a6020);border:none;border-radius:6px;color:#fff;font-weight:600;cursor:pointer;font-size:.75rem">Sauvegarder</button>
      <button onclick="document.getElementById('admin-console').remove()"
        style="padding:.4rem .7rem;background:#1e180f;border:1px solid #2a2218;border-radius:6px;color:#8a7755;cursor:pointer;font-size:.75rem">✕</button>
    </div>
  `;
  document.body.appendChild(el);
  setTimeout(()=>{ const inp=document.getElementById('admin-groq-key'); if(inp)inp.focus(); }, 50);
}

// ── Démarrage ──
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
