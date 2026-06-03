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
const AVATARS = {
  femme: 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb',
  homme: 'https://models.readyplayer.me/64c3f4a6d72bffc6fa17943c.glb'
};

// ── État ──
let prefs = null;
let history = [];
let scene, camera, renderer, mixer, clock, avatarModel;
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
  prefs = Object.assign({ configured:false, nom:'Sofia', genre:'femme', vitesse:1, pitch:1 }, prefs);
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
    <span id="av-trigger-lbl">Sofia IA</span>
  </button>

  <!-- Panneau latéral -->
  <div id="av-panel">
    <div id="av-header">
      <div id="av-name-badge"></div>
      <div style="display:flex;gap:.5rem">
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
      <input id="av-pref-nom" type="text" placeholder="Sofia" />
      <label>Genre</label>
      <div class="av-radio-row">
        <label><input type="radio" name="av-genre" value="femme" checked /> Femme</label>
        <label><input type="radio" name="av-genre" value="homme" /> Homme</label>
      </div>
      <label>Vitesse de parole</label>
      <input id="av-pref-vitesse" type="range" min="0.6" max="1.6" step="0.1" value="1" />
      <label>Hauteur de voix</label>
      <input id="av-pref-pitch" type="range" min="0.5" max="2" step="0.1" value="1" />
      <div class="av-setup-actions">
        <button onclick="window._avatarSaveSetup()">Valider</button>
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
    background:linear-gradient(180deg,#1a1610 0%,#0a0806 100%);
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
  #av-text-input::placeholder { color:#4a4030; }
  #av-mic-btn, #av-send-btn {
    background:#1a1610; border:1px solid #2a2218;
    color:#8a7755; padding:.5rem .65rem; border-radius:8px;
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
    border-radius:12px; padding:1.5rem; width:min(380px,90vw);
    color:#c8b88a;
  }
  #av-setup-box h3 { color:#dcc87a; margin:0 0 1rem; font-size:1rem; }
  #av-setup-box label { font-size:.75rem; color:#8a7755; display:block; margin:.6rem 0 .25rem; }
  #av-setup-box input[type=text], #av-setup-box input[type=range] {
    width:100%; background:#100e0b; border:1px solid #2a2218;
    color:#e8d8b0; padding:.45rem .7rem; border-radius:7px;
    font-size:.82rem; box-sizing:border-box;
  }
  .av-radio-row { display:flex; gap:1.5rem; margin:.2rem 0; }
  .av-radio-row label { color:#c8b88a; font-size:.82rem; display:flex; align-items:center; gap:.4rem; }
  .av-setup-actions { display:flex; gap:.75rem; margin-top:1.25rem; }
  .av-setup-actions button {
    flex:1; padding:.55rem; border-radius:8px; cursor:pointer; font-weight:600; font-size:.82rem;
    background:linear-gradient(135deg,#b8832a,#8a6020); border:none; color:#fff;
  }
  .av-btn-secondary { background:#1e180f !important; border:1px solid #2a2218 !important; color:#8a7755 !important; }

  @keyframes av-pulse {
    0%,100%{box-shadow:0 0 0 0 rgba(184,131,42,.4);}
    50%{box-shadow:0 0 0 6px rgba(184,131,42,.0);}
  }

  @media(max-width:600px){
    #av-panel { width:100vw; }
    #av-trigger-lbl { display:none; }
  }
  `;
  document.head.appendChild(s);
}

// ── Bouton flottant ──
function setupFloatingButton(){
  window._avatarToggle = togglePanel;
  window._avatarSend = sendMessage;
  window._avatarMic = toggleMic;
  window._avatarSettings = showSetup;
  window._avatarSaveSetup = saveSetup;
  window._avatarCloseSetup = closeSetup;
  window._avatarQuick = quickAction;
  updateNameBadge();
}

function togglePanel(){
  if(!prefs.configured){
    showSetup();
    return;
  }
  panelOpen = !panelOpen;
  document.getElementById('av-panel').classList.toggle('open', panelOpen);
  if(panelOpen && !avatarModel) setTimeout(initThree, 100);
  if(panelOpen && history.length===0) setTimeout(()=>avatarGreet(), 800);
}

function updateNameBadge(){
  const el = document.getElementById('av-name-badge');
  if(el) el.textContent = prefs.nom + ' · Assistant IMMO·AI';
}

// ── Three.js ──
function initThree(){
  const canvas = document.getElementById('av-canvas');
  const wrap = document.getElementById('av-canvas-wrap');
  if(!canvas||!wrap) return;

  // Check Three.js disponible
  if(typeof THREE === 'undefined'){
    setStatus('Chargement 3D…');
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', function(){
      loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', function(){
        loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', function(){
          buildScene(canvas, wrap);
        });
      });
    });
  } else {
    buildScene(canvas, wrap);
  }
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
  const avatarUrl = AVATARS[prefs.genre] || AVATARS.femme;
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
  const fb = document.createElement('div');
  fb.id = 'av-fallback';
  // SVG avatar professionnel plein pied
  const isFemme = prefs.genre !== 'homme';
  fb.innerHTML = isFemme ? `
  <svg id="av-svg" viewBox="0 0 200 420" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;max-height:100%">
    <defs>
      <radialGradient id="skinG" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#f5d5b0"/><stop offset="100%" stop-color="#e8b888"/></radialGradient>
      <linearGradient id="suitG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e1a14"/><stop offset="100%" stop-color="#140f08"/></linearGradient>
      <linearGradient id="hairG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3d2206"/><stop offset="100%" stop-color="#1a0e03"/></linearGradient>
      <linearGradient id="bgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a1610"/><stop offset="100%" stop-color="#0a0806"/></linearGradient>
      <filter id="softShadow"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/></filter>
    </defs>
    <!-- Fond -->
    <rect width="200" height="420" fill="url(#bgG)"/>
    <!-- Reflet sol -->
    <ellipse cx="100" cy="415" rx="55" ry="6" fill="rgba(184,131,42,0.12)"/>
    <!-- Corps / costume -->
    <path d="M45 230 Q40 320 38 420 L162 420 Q160 320 155 230 Q145 215 130 210 L100 218 L70 210 Q55 215 45 230Z" fill="url(#suitG)" filter="url(#softShadow)"/>
    <!-- Revers costume doré -->
    <path d="M100 218 L85 240 L75 280 L100 265 L125 280 L115 240Z" fill="#b8832a" opacity="0.9"/>
    <path d="M100 218 L85 240 L75 280" fill="none" stroke="#8a5f1a" stroke-width="1"/>
    <path d="M100 218 L115 240 L125 280" fill="none" stroke="#8a5f1a" stroke-width="1"/>
    <!-- Chemise blanche -->
    <path d="M100 218 L92 235 L100 250 L108 235Z" fill="#f0ece4"/>
    <!-- Boutons costume -->
    <circle cx="100" cy="270" r="2" fill="#b8832a" opacity="0.7"/>
    <circle cx="100" cy="282" r="2" fill="#b8832a" opacity="0.7"/>
    <!-- Cou -->
    <rect x="88" y="185" width="24" height="30" rx="8" fill="url(#skinG)"/>
    <!-- Tête -->
    <ellipse cx="100" cy="160" rx="42" ry="50" fill="url(#skinG)" filter="url(#softShadow)"/>
    <!-- Cheveux - chignon élégant -->
    <path d="M58 145 Q58 95 100 95 Q142 95 142 145 Q142 120 100 112 Q58 120 58 145Z" fill="url(#hairG)"/>
    <ellipse cx="100" cy="100" rx="28" ry="14" fill="url(#hairG)"/>
    <path d="M75 130 Q72 115 80 108" fill="none" stroke="#2a1504" stroke-width="3" stroke-linecap="round"/>
    <path d="M125 130 Q128 115 120 108" fill="none" stroke="#2a1504" stroke-width="3" stroke-linecap="round"/>
    <!-- Sourcils -->
    <path d="M78 138 Q88 133 95 136" fill="none" stroke="#5a3010" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M122 138 Q112 133 105 136" fill="none" stroke="#5a3010" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Yeux -->
    <ellipse cx="87" cy="150" rx="9" ry="7" fill="white"/>
    <ellipse cx="113" cy="150" rx="9" ry="7" fill="white"/>
    <ellipse cx="87" cy="151" rx="6" ry="5.5" fill="#3d2206"/>
    <ellipse cx="113" cy="151" rx="6" ry="5.5" fill="#3d2206"/>
    <ellipse cx="87" cy="151" rx="3.5" ry="3.5" fill="#1a0a00"/>
    <ellipse cx="113" cy="151" rx="3.5" ry="3.5" fill="#1a0a00"/>
    <ellipse cx="88.5" cy="149" rx="1.2" ry="1.2" fill="white" opacity="0.8"/>
    <ellipse cx="114.5" cy="149" rx="1.2" ry="1.2" fill="white" opacity="0.8"/>
    <!-- Paupières -->
    <path d="M78 144 Q87 140 96 144" fill="none" stroke="#3d2206" stroke-width="1.5"/>
    <path d="M104 144 Q113 140 122 144" fill="none" stroke="#3d2206" stroke-width="1.5"/>
    <!-- Nez -->
    <path d="M97 158 Q95 168 98 172 Q100 174 102 172 Q105 168 103 158" fill="none" stroke="#c8905a" stroke-width="1.2" stroke-linecap="round"/>
    <!-- Bouche -->
    <path id="av-mouth-top" d="M88 180 Q100 176 112 180" fill="none" stroke="#c07050" stroke-width="2" stroke-linecap="round"/>
    <path id="av-mouth-bot" d="M88 180 Q100 183 112 180" fill="#d4806a" stroke="#c07050" stroke-width="1"/>
    <!-- Lèvres -->
    <path d="M88 180 Q94 178 100 177 Q106 178 112 180" fill="#e08870"/>
    <!-- Joues -->
    <ellipse cx="75" cy="165" rx="10" ry="6" fill="rgba(220,100,80,0.12)"/>
    <ellipse cx="125" cy="165" rx="10" ry="6" fill="rgba(220,100,80,0.12)"/>
    <!-- Boucles d'oreilles or -->
    <circle cx="58" cy="163" r="4" fill="#b8832a"/>
    <circle cx="142" cy="163" r="4" fill="#b8832a"/>
    <!-- Bras -->
    <path d="M55 230 Q42 270 44 310 Q48 318 56 310 Q58 275 68 242Z" fill="url(#suitG)"/>
    <path d="M145 230 Q158 270 156 310 Q152 318 144 310 Q142 275 132 242Z" fill="url(#suitG)"/>
    <!-- Mains -->
    <ellipse cx="50" cy="318" rx="12" ry="9" fill="url(#skinG)"/>
    <ellipse cx="150" cy="318" rx="12" ry="9" fill="url(#skinG)"/>
    <!-- Jambes -->
    <path d="M68 370 Q65 395 64 420 L80 420 L82 370Z" fill="#1a1208"/>
    <path d="M132 370 Q135 395 136 420 L120 420 L118 370Z" fill="#1a1208"/>
    <!-- Chaussures -->
    <path d="M62 418 Q64 412 72 412 Q80 412 80 418Z" fill="#0a0806"/>
    <path d="M138 418 Q136 412 128 412 Q120 412 120 418Z" fill="#0a0806"/>
    <!-- Animation clignement -->
    <style>
      #av-svg .blink-l { animation: av-blink-l 5s infinite; transform-origin: 87px 151px; }
      #av-svg .blink-r { animation: av-blink-l 5s infinite; transform-origin: 113px 151px; }
      @keyframes av-blink-l { 0%,90%,100%{transform:scaleY(1)} 93%{transform:scaleY(0.05)} }
    </style>
    <!-- Paupières animées -->
    <ellipse class="blink-l" cx="87" cy="150" rx="9" ry="7" fill="#e8b888" opacity="0"/>
    <ellipse class="blink-r" cx="113" cy="150" rx="9" ry="7" fill="#e8b888" opacity="0"/>
  </svg>` : `
  <svg id="av-svg" viewBox="0 0 200 420" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;max-height:100%">
    <defs>
      <radialGradient id="skinG" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#f0c898"/><stop offset="100%" stop-color="#d8a070"/></radialGradient>
      <linearGradient id="suitG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e1a14"/><stop offset="100%" stop-color="#100c07"/></linearGradient>
      <linearGradient id="hairG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a1a06"/><stop offset="100%" stop-color="#0e0802"/></linearGradient>
      <linearGradient id="bgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a1610"/><stop offset="100%" stop-color="#0a0806"/></linearGradient>
      <filter id="softShadow"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/></filter>
    </defs>
    <rect width="200" height="420" fill="url(#bgG)"/>
    <ellipse cx="100" cy="415" rx="55" ry="6" fill="rgba(184,131,42,0.12)"/>
    <path d="M42 228 Q38 320 36 420 L164 420 Q162 320 158 228 Q148 212 130 207 L100 215 L70 207 Q52 212 42 228Z" fill="url(#suitG)" filter="url(#softShadow)"/>
    <path d="M100 215 L87 238 L78 278 L100 262 L122 278 L113 238Z" fill="#b8832a" opacity="0.85"/>
    <path d="M100 215 L92 232 L100 248 L108 232Z" fill="#f0ece4"/>
    <circle cx="100" cy="268" r="2" fill="#b8832a" opacity="0.6"/>
    <circle cx="100" cy="280" r="2" fill="#b8832a" opacity="0.6"/>
    <rect x="86" y="182" width="28" height="32" rx="10" fill="url(#skinG)"/>
    <ellipse cx="100" cy="155" rx="45" ry="52" fill="url(#skinG)" filter="url(#softShadow)"/>
    <path d="M55 142 Q55 95 100 93 Q145 95 145 142 Q145 115 100 108 Q55 115 55 142Z" fill="url(#hairG)"/>
    <path d="M78 136 Q75 118 82 108" fill="none" stroke="#1a0e02" stroke-width="3" stroke-linecap="round"/>
    <path d="M122 136 Q125 118 118 108" fill="none" stroke="#1a0e02" stroke-width="3" stroke-linecap="round"/>
    <path d="M76 136 Q88 130 96 133" fill="none" stroke="#4a2c0a" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M124 136 Q112 130 104 133" fill="none" stroke="#4a2c0a" stroke-width="2.5" stroke-linecap="round"/>
    <ellipse cx="86" cy="148" rx="10" ry="7.5" fill="white"/>
    <ellipse cx="114" cy="148" rx="10" ry="7.5" fill="white"/>
    <ellipse cx="86" cy="149" rx="6.5" ry="6" fill="#3a2008"/>
    <ellipse cx="114" cy="149" rx="6.5" ry="6" fill="#3a2008"/>
    <ellipse cx="86" cy="149" rx="4" ry="4" fill="#100800"/>
    <ellipse cx="114" cy="149" rx="4" ry="4" fill="#100800"/>
    <ellipse cx="87.5" cy="147" rx="1.5" ry="1.5" fill="white" opacity="0.8"/>
    <ellipse cx="115.5" cy="147" rx="1.5" ry="1.5" fill="white" opacity="0.8"/>
    <path d="M76 142 Q86 138 96 142" fill="none" stroke="#3a2008" stroke-width="1.5"/>
    <path d="M104 142 Q114 138 124 142" fill="none" stroke="#3a2008" stroke-width="1.5"/>
    <path d="M96 158 Q94 168 97 173 Q100 175 103 173 Q106 168 104 158" fill="none" stroke="#b87840" stroke-width="1.2" stroke-linecap="round"/>
    <path id="av-mouth-top" d="M87 180 Q100 175 113 180" fill="none" stroke="#a06040" stroke-width="2.5" stroke-linecap="round"/>
    <path id="av-mouth-bot" d="M87 180 Q100 184 113 180" fill="#b07058" stroke="#a06040" stroke-width="1"/>
    <path d="M52 228 Q40 272 42 315 Q46 323 55 314 Q57 278 68 240Z" fill="url(#suitG)"/>
    <path d="M148 228 Q160 272 158 315 Q154 323 145 314 Q143 278 132 240Z" fill="url(#suitG)"/>
    <ellipse cx="48" cy="320" rx="13" ry="9" fill="url(#skinG)"/>
    <ellipse cx="152" cy="320" rx="13" ry="9" fill="url(#skinG)"/>
    <path d="M68 368 Q65 393 64 420 L82 420 L83 368Z" fill="#161008"/>
    <path d="M132 368 Q135 393 136 420 L118 420 L117 368Z" fill="#161008"/>
    <path d="M61 418 Q63 410 74 410 Q83 412 82 418Z" fill="#0a0806"/>
    <path d="M139 418 Q137 410 126 410 Q117 412 118 418Z" fill="#0a0806"/>
    <style>
      @keyframes av-blink-l { 0%,90%,100%{transform:scaleY(1)} 93%{transform:scaleY(0.05)} }
    </style>
  </svg>`;
  const style = document.createElement('style');
  style.textContent = `
    #av-fallback { position:absolute;inset:0;display:flex;align-items:center;justify-content:center; background:linear-gradient(180deg,#1a1610 0%,#0a0806 100%); overflow:hidden; }
    #av-fallback svg { height:100%; width:auto; max-width:100%; }
  `;
  document.head.appendChild(style);
  wrap.appendChild(fb);
  const cv = document.getElementById('av-canvas');
  if(cv) cv.style.display='none';
}

function animate(){
  requestAnimationFrame(animate);
  if(mixer) mixer.update(clock.getDelta());
  if(renderer && scene && camera) renderer.render(scene, camera);
}

// ── Animation bouche ──
function startMouthAnim(){
  if(mouthInterval) return;
  let t=0;
  mouthInterval = setInterval(function(){
    t += 0.25;
    const v = Math.abs(Math.sin(t)) * 0.8;
    // 3D morph targets
    mouthMorphs.forEach(function(m){ m.mesh.morphTargetInfluences[m.idx] = v; });
    // SVG fallback - animer la lèvre inférieure
    const mBot = document.getElementById('av-mouth-bot');
    if(mBot){
      const open = Math.round(v * 8);
      mBot.setAttribute('d', 'M88 180 Q100 '+(183+open)+' 112 180');
    }
  }, 60);
}

function stopMouthAnim(){
  if(mouthInterval){ clearInterval(mouthInterval); mouthInterval=null; }
  mouthMorphs.forEach(function(m){ m.mesh.morphTargetInfluences[m.idx] = 0; });
  const mBot = document.getElementById('av-mouth-bot');
  if(mBot) mBot.setAttribute('d', 'M88 180 Q100 183 112 180');
}

// ── TTS ──
function speak(text){
  if(!text) return;
  if(currentUtterance) window.speechSynthesis.cancel();
  const clean = text.replace(/<[^>]+>/g,'').replace(/\*\*/g,'').replace(/\*/g,'');
  currentUtterance = new SpeechSynthesisUtterance(clean);
  currentUtterance.lang = 'fr-FR';
  currentUtterance.rate = parseFloat(prefs.vitesse) || 1;
  currentUtterance.pitch = parseFloat(prefs.pitch) || 1;

  // Choisir une voix française si disponible
  const voices = window.speechSynthesis.getVoices();
  const frVoice = voices.find(function(v){
    return v.lang.startsWith('fr') && (prefs.genre==='femme' ? !v.name.toLowerCase().includes('thomas') : true);
  });
  if(frVoice) currentUtterance.voice = frVoice;

  currentUtterance.onstart = function(){ isSpeaking=true; startMouthAnim(); setStatus('Parle…'); };
  currentUtterance.onend = function(){ isSpeaking=false; stopMouthAnim(); setStatus(''); };
  currentUtterance.onerror = function(){ isSpeaking=false; stopMouthAnim(); setStatus(''); };
  window.speechSynthesis.speak(currentUtterance);
}

function stopSpeak(){
  window.speechSynthesis.cancel();
  isSpeaking=false; stopMouthAnim(); setStatus('');
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
  const el = document.createElement('div');
  el.className = 'av-msg ' + role;
  el.innerHTML = role==='assistant' ? mdLight(text) : escHtml(text);
  const msgs = document.getElementById('av-messages');
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  if(role!=='thinking') history.push({role:role==='user'?'user':'assistant', content:text});
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

async function sendMessage(){
  const inp = document.getElementById('av-text-input');
  const txt = (inp.value||'').trim();
  if(!txt) return;
  inp.value = '';
  if(isSpeaking) stopSpeak();
  addMsg('user', txt);
  const thinking = addMsg('thinking', prefs.nom + ' réfléchit…');
  try {
    const response = await callAvatarAI(txt);
    removeThinking();
    addMsg('assistant', response);
    speak(response);
  } catch(e){
    removeThinking();
    const err = e.message==='no_key'
      ? 'Clé Groq non configurée. Veuillez l\'ajouter dans les paramètres.'
      : 'Désolée, une erreur est survenue : ' + e.message;
    addMsg('assistant', err);
  }
}

async function callAvatarAI(userMsg){
  if(typeof callAI !== 'function') throw new Error('callAI non disponible');
  const system = buildSystemPrompt();
  const msgs = buildMessages(userMsg);
  // Appel direct à l'API Groq avec historique
  const _gk = window.groqKey || localStorage.getItem('immoai_groq') || ''; if(!_gk) throw new Error('no_key');
  const model = 'llama-3.3-70b-versatile';
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+_gk},
    body:JSON.stringify({model, messages:msgs, max_tokens:500, temperature:0.75})
  });
  if(r.status===429) throw new Error('Limite API atteinte, réessayez dans un instant.');
  if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.error?.message||'Erreur Groq'); }
  return (await r.json()).choices[0].message.content;
}

function buildSystemPrompt(){
  const ins = window._inseeData?.commune;
  const sd = window._scoreData;
  const dvf = window._dvfData;
  const mel = window._melodiData;
  const addr = window.currentAddress || '';

  let ctx = '';
  if(addr) ctx += `\nAdresse analysée : ${addr}`;
  if(ins) ctx += `\nCommune : ${ins.nom}, ${ins.population?.toLocaleString('fr-FR')} hab., densité ${ins.densite?.toLocaleString('fr-FR')} hab/km²`;
  if(sd) ctx += `\nScore global : ${sd.note?.toFixed(1)}/10 (${sd.label})`;
  if(dvf?.stats?.medianM2) ctx += `\nPrix médian : ${dvf.stats.medianM2.toLocaleString('fr-FR')} €/m²`;
  if(mel?.revenuMedian) ctx += `\nRevenu médian net : ${Math.round(mel.revenuMedian/12).toLocaleString('fr-FR')} €/mois`;
  if(sd?.items?.length){
    const top3 = [...sd.items].sort((a,b)=>b.val-a.val).slice(0,3).map(i=>i.label+' ('+i.val.toFixed(1)+'/10)').join(', ');
    const bot3 = [...sd.items].sort((a,b)=>a.val-b.val).slice(0,3).map(i=>i.label+' ('+i.val.toFixed(1)+'/10)').join(', ');
    ctx += `\nPoints forts : ${top3}`;
    ctx += `\nPoints de vigilance : ${bot3}`;
  }

  return `Tu es ${prefs.nom}, l'assistante IA experte en immobilier de IMMO·AI.
Tu es professionnelle, chaleureuse et précise. Tu parles en français naturellement.
Tes réponses sont concises (3-5 phrases max) sauf si on te demande un détail.
Tu connais parfaitement l'application IMMO·AI et ses sections :
- Score global : synthèse de tous les critères notés sur 10
- Carte interactive : visualisation de l'adresse et du quartier
- Marché immobilier (DVF) : prix réels des transactions, loyers estimés
- Population & économie (INSEE) : revenus, chômage, diplômes
- Mobilité & transports : métro, bus, vélos, score de déplacement
- Cadre de vie : ensoleillement, bruit, qualité de l'air, risques
- Logement (Melodi) : propriétaires, vacance, résidences principales
- Dynamisme : évolution de la population, pyramide des âges
- Outils financiers : budget loyer, louer vs acheter, mensualités, PTZ, DPE, investissement
- PDF Export : rapport complet téléchargeable
${ctx ? '\nDonnées de l\'analyse en cours :'+ctx : ''}
Tu peux commenter, conseiller, expliquer, comparer. Sois directe et professionnelle.`;
}

function buildMessages(userMsg){
  const system = buildSystemPrompt();
  const msgs = [{role:'system', content:system}];
  // Inclure les 6 derniers échanges pour le contexte
  const recent = history.filter(function(h){ return h.role==='user'||h.role==='assistant'; }).slice(-6);
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
function showSetup(){
  const modal = document.getElementById('av-setup-modal');
  if(!modal) return;
  document.getElementById('av-pref-nom').value = prefs.nom || '';
  document.querySelector(`input[name="av-genre"][value="${prefs.genre}"]`).checked = true;
  document.getElementById('av-pref-vitesse').value = prefs.vitesse || 1;
  document.getElementById('av-pref-pitch').value = prefs.pitch || 1;
  modal.classList.add('open');
}
function closeSetup(){
  document.getElementById('av-setup-modal').classList.remove('open');
}
function saveSetup(){
  const nom = document.getElementById('av-pref-nom').value.trim() || 'Sofia';
  const genre = document.querySelector('input[name="av-genre"]:checked')?.value || 'femme';
  const vitesse = parseFloat(document.getElementById('av-pref-vitesse').value);
  const pitch = parseFloat(document.getElementById('av-pref-pitch').value);
  const genreChange = genre !== prefs.genre;
  prefs = { configured:true, nom, genre, vitesse, pitch };
  savePrefs();
  closeSetup();
  updateNameBadge();
  // Ouvrir le panneau après configuration
  if(!panelOpen) togglePanel();
  if(genreChange && avatarModel){
    // Recharger l'avatar avec le nouveau genre
    scene.remove(avatarModel);
    avatarModel = null; mouthMorphs = [];
    initThree();
  }
}

// ── Utilitaires ──
function setStatus(txt){
  const el = document.getElementById('av-status');
  if(el) el.textContent = txt;
}

// ── Démarrage ──
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
