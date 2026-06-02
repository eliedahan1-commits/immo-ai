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
    <span id="av-trigger-icon">🤖</span>
    <span id="av-trigger-lbl">Assistant</span>
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
      <div id="av-quick-btns">
        <button onclick="window._avatarQuick('analyse')">📊 Analyser</button>
        <button onclick="window._avatarQuick('guide')">📖 Guide</button>
        <button onclick="window._avatarQuick('score')">⭐ Score</button>
        <button onclick="window._avatarQuick('prix')">💰 Prix</button>
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

  #av-quick-btns {
    display:flex; gap:.35rem; flex-wrap:wrap;
  }
  #av-quick-btns button {
    background:#1a1610; border:1px solid #2a2218;
    color:#8a7755; padding:.3rem .6rem; border-radius:6px;
    font-size:.7rem; cursor:pointer; transition:all .2s;
  }
  #av-quick-btns button:hover { border-color:#b8832a44; color:#c8a860; }

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
  // Avatar CSS de secours élégant
  const fb = document.createElement('div');
  fb.id = 'av-fallback';
  fb.innerHTML = `
    <div class="av-fb-body">
      <div class="av-fb-head">
        <div class="av-fb-face">
          <div class="av-fb-eyes"><div class="av-fb-eye"></div><div class="av-fb-eye"></div></div>
          <div class="av-fb-mouth" id="av-fb-mouth"></div>
        </div>
        <div class="av-fb-hair"></div>
      </div>
      <div class="av-fb-torso"></div>
    </div>
  `;
  const style = document.createElement('style');
  style.textContent = `
    #av-fallback { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#1a1610,#0a0806); }
    .av-fb-body { display:flex;flex-direction:column;align-items:center;gap:0; }
    .av-fb-head { position:relative;width:90px;height:110px;background:linear-gradient(180deg,#e8c8a0,#d4a878);border-radius:50% 50% 45% 45%;display:flex;flex-direction:column;align-items:center;justify-content:center; }
    .av-fb-hair { position:absolute;top:-8px;left:-5px;right:-5px;height:55px;background:#3d2810;border-radius:50% 50% 0 0;z-index:0; }
    .av-fb-face { position:relative;z-index:1; }
    .av-fb-eyes { display:flex;gap:20px;margin-bottom:12px; }
    .av-fb-eye { width:10px;height:10px;background:#2d1a08;border-radius:50%;animation:av-blink 4s infinite; }
    .av-fb-mouth { width:22px;height:8px;background:#c87050;border-radius:0 0 12px 12px;margin:0 auto;transition:height .1s; }
    .av-fb-torso { width:70px;height:90px;background:linear-gradient(180deg,#2a3a5a,#1a2a4a);border-radius:8px 8px 0 0;margin-top:-2px; }
    @keyframes av-blink { 0%,92%,100%{transform:scaleY(1)} 95%{transform:scaleY(0.1)} }
  `;
  document.head.appendChild(style);
  wrap.appendChild(fb);
  // Masquer le canvas
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
    mouthMorphs.forEach(function(m){ m.mesh.morphTargetInfluences[m.idx] = v; });
    // Fallback CSS
    const fb = document.getElementById('av-fb-mouth');
    if(fb) fb.style.height = (8 + v*12)+'px';
  }, 60);
}

function stopMouthAnim(){
  if(mouthInterval){ clearInterval(mouthInterval); mouthInterval=null; }
  mouthMorphs.forEach(function(m){ m.mesh.morphTargetInfluences[m.idx] = 0; });
  const fb = document.getElementById('av-fb-mouth');
  if(fb) fb.style.height = '8px';
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
  if(!window.groqKey) throw new Error('no_key');
  const model = 'llama-3.3-70b-versatile';
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+window.groqKey},
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

})();txt){
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
