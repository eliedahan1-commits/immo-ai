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
  // Supprimer ancien fallback si présent
  const old = document.getElementById('av-fallback');
  if(old) old.remove();

  const fb = document.createElement('div');
  fb.id = 'av-fallback';
  fb.style.cssText = 'position:absolute;inset:0;display:block;background:#000;overflow:hidden;';

  const imgSrc = (prefs.genre === 'homme')
    ? '/images/avatar-m.png'
    : '/images/avatar-f.png';

  // Div fond solide derrière l'image (background-color sur <img> n'affecte pas les px transparents)
  const bgDiv = document.createElement('div');
  bgDiv.style.cssText = 'position:absolute;inset:0;background:#0a0806;z-index:0;';
  fb.appendChild(bgDiv);

  const img = document.createElement('img');
  img.id = 'av-img';
  img.alt = prefs.nom || 'Assistant';
  img.style.cssText = 'position:relative;z-index:1;width:100%;height:auto;display:block;object-position:top center;';
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
  const nom = document.getElementById('av-pref-nom')?.value || prefs.nom || 'Sofia';
  const genre = document.querySelector('input[name="av-genre"]:checked')?.value || prefs.genre;
  window.speechSynthesis.cancel();
  function doSpeak(){
    const utt = new SpeechSynthesisUtterance('Bonjour, je suis ' + nom + '. Je suis votre assistant IMMO AI, specialiste de l immobilier.');
    utt.lang = 'fr-FR'; utt.rate = v; utt.pitch = p;
    const voices = window.speechSynthesis.getVoices();
    const frVoices = voices.filter(v=>v.lang.startsWith('fr'));
    if(frVoices.length){
      const maleKeys=['thomas','nicolas','pierre'];
      const femaleKeys=['marie','audrey','amelie','juliette'];
      const isMale = genre==='homme';
      let found = frVoices.find(v=>( isMale?maleKeys:femaleKeys ).some(k=>v.name.toLowerCase().includes(k)));
      utt.voice = found || frVoices[0];
      if(!found && isMale) utt.pitch = Math.min(p, 0.75);
    }
    window.speechSynthesis.speak(utt);
  }
  const voices = window.speechSynthesis.getVoices();
  if(voices.length){ doSpeak(); }
  else { window.speechSynthesis.onvoiceschanged = function(){ window.speechSynthesis.onvoiceschanged=null; doSpeak(); }; }
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

  // Choisir une voix française adaptée au genre
  function applyVoice(utt){
    const voices = window.speechSynthesis.getVoices();
    if(!voices.length) return;
    const frVoices = voices.filter(v=>v.lang.startsWith('fr'));
    if(!frVoices.length) return;
    const isMale = prefs.genre === 'homme';
    // Mots-clés voix masculine/féminine
    const maleKeys = ['thomas','nicolas','pierre','male','homme'];
    const femaleKeys = ['marie','audrey','amélie','female','femme','siri'];
    let found = null;
    if(isMale){
      found = frVoices.find(v=>maleKeys.some(k=>v.name.toLowerCase().includes(k)));
    } else {
      found = frVoices.find(v=>femaleKeys.some(k=>v.name.toLowerCase().includes(k)));
    }
    utt.voice = found || frVoices[isMale ? frVoices.length-1 : 0];
    // Ajuster pitch si aucune voix genrée trouvée
    if(!found && isMale && utt.pitch >= 1) utt.pitch = Math.min(utt.pitch, 0.8);
  }
  const voicesFr = window.speechSynthesis.getVoices();
  if(voicesFr.length){ applyVoice(currentUtterance); }
  else {
    window.speechSynthesis.onvoiceschanged = function(){
      applyVoice(currentUtterance);
      window.speechSynthesis.onvoiceschanged = null;
    };
  }

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
  // Parser [CARD:id] dans les réponses assistant
  let displayText = text;
  if(role === 'assistant'){
    const cardMatches = [...(text.matchAll(/\[CARD:([a-z]+)\]/g)||[])];
    cardMatches.forEach(m=>{
      const cardId = m[1];
      if(cardId === 'close'){
        setTimeout(()=>{ if(typeof closePanel==='function') closePanel(); }, 400);
      } else {
        setTimeout(()=>{
          if(typeof go==='function') go('analyse');
          setTimeout(()=>{ if(typeof showDetail==='function') showDetail(cardId); }, 350);
        }, 600);
      }
    });
    displayText = text.replace(/\[CARD:[a-z]+\]/g, '').trim();
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

function buildAllData(){
  const ins = window._inseeData?.commune;
  const sd = window._scoreData;
  const dvf = window._dvfData;
  const dept = window._dvfDeptData;
  const mel = window._melodiData;
  const nat = window._melodiNational;
  const mob = window._mobiliteData;
  const svc = window._servicesData;
  const eco = window._ecolesData;
  const meteo = window._meteoData;
  const bruit = window._bruitData;
  const fibre = window._fibreData;
  const risques = window._risquesData;
  const demo = window._demographieData;
  const aq = window._qualiteAirData;
  const loyers = window._loyersData;
  const dpe = window._dpeData;
  const cr = window._criminaliteData;
  const addr = window.currentAddress || '';

  const lines = [];
  if(addr) lines.push('ADRESSE ANALYSEE: ' + addr);
  if(ins){
    lines.push('COMMUNE: ' + ins.nom + (ins.departement ? ', dep. ' + ins.departement : '') + (ins.region ? ', ' + ins.region : ''));
    if(ins.population) lines.push('Population: ' + ins.population.toLocaleString('fr-FR') + ' habitants');
    if(ins.densite) lines.push('Densite: ' + ins.densite.toLocaleString('fr-FR') + ' hab/km2 (' + (ins.densite>10000?'Tres dense':ins.densite>5000?'Dense':ins.densite>2000?'Urbaine':'Peri-urbaine') + ')');
    if(ins.superficie) lines.push('Superficie: ' + Math.round(ins.superficie) + ' km2');
    if(ins.codePostal) lines.push('Code postal: ' + ins.codePostal);
    if(ins.codeInsee) lines.push('Code INSEE: ' + ins.codeInsee);
    if(ins.altitude) lines.push('Altitude: ' + ins.altitude + ' m');
  }
  if(sd){
    lines.push('SCORE GLOBAL: ' + sd.note?.toFixed(1) + '/10 - ' + (sd.label||''));
    if(sd.items?.length) sd.items.forEach(item=>{
      lines.push('  Score ' + item.label + ': ' + item.val?.toFixed(1) + '/10' + (item.sub ? ' (' + item.sub + ')' : ''));
    });
  }
  if(dvf?.stats){
    lines.push('MARCHE IMMOBILIER (DVF):');
    if(dvf.stats.medianM2) lines.push('  Prix median: ' + dvf.stats.medianM2.toLocaleString('fr-FR') + ' EUR/m2');
    if(dvf.stats.moyenneM2) lines.push('  Prix moyen: ' + dvf.stats.moyenneM2.toLocaleString('fr-FR') + ' EUR/m2');
    if(dvf.count) lines.push('  Transactions analysees: ' + dvf.count);
    if(dept?.medianM2){
      const d=Math.round((dvf.stats.medianM2-dept.medianM2)/dept.medianM2*100);
      lines.push('  vs departement: ' + (d>=0?'+':'') + d + '%');
    }
    if(dvf.stats.minM2) lines.push('  Prix min: ' + dvf.stats.minM2.toLocaleString('fr-FR') + ' EUR/m2');
    if(dvf.stats.maxM2) lines.push('  Prix max: ' + dvf.stats.maxM2.toLocaleString('fr-FR') + ' EUR/m2');
  }
  if(loyers){
    lines.push('LOYERS ESTIMES:');
    if(loyers.estLoyer) Object.entries(loyers.estLoyer).forEach(([k,v])=>{ if(v) lines.push('  ' + k + ': ' + v.toLocaleString('fr-FR') + ' EUR/mois'); });
    if(loyers.rendement) lines.push('  Rendement brut estime: ' + Math.round(loyers.rendement*100) + '%');
  }
  if(mel){
    lines.push('POPULATION & ECONOMIE (INSEE Melodi - annee ' + (mel.anneeFilosofi||'?') + '):');
    if(mel.revenuMedian) lines.push('  Revenu median net: ' + Math.round(mel.revenuMedian/12).toLocaleString('fr-FR') + ' EUR/mois (' + Math.round(mel.revenuMedian).toLocaleString('fr-FR') + ' EUR/an)');
    if(nat?.revenuMedian && mel.revenuMedian) lines.push('  vs national: ' + (Math.round((mel.revenuMedian-nat.revenuMedian)/nat.revenuMedian*100)>=0?'+':'') + Math.round((mel.revenuMedian-nat.revenuMedian)/nat.revenuMedian*100) + '%');
    if(mel.tauxChomage!=null) lines.push('  Chomage: ' + mel.tauxChomage + '% (national: ' + (nat?.tauxChomage||'?') + '%)');
    if(mel.pctBac5!=null) lines.push('  Diplomes Bac+5: ' + mel.pctBac5 + '% (national: ' + (nat?.pctBac5Nat||'?') + '%)');
    if(mel.pctPropri!=null) lines.push('  Proprietaires: ' + mel.pctPropri + '% (national: ' + (nat?.pctPropri||'?') + '%)');
    if(mel.nbResidPrinc) lines.push('  Residences principales: ' + mel.nbResidPrinc.toLocaleString('fr-FR'));
    if(mel.nbVacants) lines.push('  Logements vacants: ' + mel.nbVacants.toLocaleString('fr-FR'));
    if(mel.pctSeuls!=null) lines.push('  Menages seuls: ' + mel.pctSeuls + '%');
    if(mel.pyramideAges){
      const pyr=mel.pyramideAges; const tot=Object.values(pyr).reduce((s,v)=>s+v,0);
      if(tot>0){
        const yj=Math.round(((pyr.Y_LT15||0)+(pyr.Y15T24||0))/tot*100);
        const se=Math.round(((pyr.Y65T79||0)+(pyr.Y_GE80||0))/tot*100);
        lines.push('  Pyramide ages: Jeunes ' + yj + '%, Actifs ' + (100-yj-se) + '%, Seniors ' + se + '%');
      }
    }
  }
  if(mob){
    lines.push('MOBILITE (score: ' + mob.score + '/10 - ' + (mob.scoreLabel||'') + '):');
    if(mob.stats){
      if(mob.stats.metro>0) lines.push('  Metro/RER: ' + mob.stats.metro + ' stations');
      if(mob.stats.trams>0) lines.push('  Tramways: ' + mob.stats.trams);
      if(mob.stats.arretsBus>0) lines.push('  Arrets bus: ' + mob.stats.arretsBus);
      if(mob.stats.gares>0) lines.push('  Gares: ' + mob.stats.gares);
      if(mob.stats.velos>0) lines.push('  Velos/trottinettes: ' + mob.stats.velos);
    }
  }
  if(svc){
    lines.push('SERVICES & COMMERCES (total: ' + svc.total + '):');
    if(svc.sante) lines.push('  Sante: ' + svc.sante);
    if(svc.commerces) lines.push('  Commerces: ' + svc.commerces);
    if(svc.autres) lines.push('  Autres services: ' + svc.autres);
  }
  if(eco){
    lines.push('ETABLISSEMENTS SCOLAIRES (' + eco.total + ' etablissements):');
    if(eco.types) lines.push('  Ecoles: ' + (eco.types.ecoles||0) + ', Colleges: ' + (eco.types.college||0) + ', Lycees: ' + (eco.types.lycee||0));
    if(eco.ips!=null) lines.push('  Indice Positionnement Social moyen: ' + eco.ips);
  }
  if(meteo){
    lines.push('METEO & CLIMAT:');
    if(meteo.ensoleillement) lines.push('  Ensoleillement: ' + meteo.ensoleillement.heuresAnnuelles + ' h/an (' + meteo.ensoleillement.label + ')');
    if(meteo.temperatures) lines.push('  Temperatures: max moy ' + meteo.temperatures.maxMoyenne + 'C, min moy ' + meteo.temperatures.minMoyenne + 'C');
    if(meteo.precipitations) lines.push('  Precipitations: ' + meteo.precipitations.annuelles + ' mm/an');
  }
  if(bruit?.niveauCode){
    const bonus=ins?.densite>10000?4:ins?.densite>5000?3:ins?.densite>2000?2:0;
    const sc=Math.min((bruit.score||0)+bonus,10);
    lines.push('BRUIT ESTIME: ' + (sc>=7?'Eleve':sc>=4?'Modere':'Faible') + ' (score ' + sc + '/10)');
  }
  if(aq) lines.push('QUALITE AIR: AQI ' + aq.aqi + ' - ' + (aq.label||'') + (aq.pm25?', PM2.5: '+aq.pm25:'') + (aq.pm10?', PM10: '+aq.pm10:''));
  if(risques) lines.push('RISQUES NATURELS: ' + risques.total + ' risque(s) identifie(s)' + (risques.score?' (score: '+risques.score+')':''));
  if(fibre?.fibre) lines.push('FIBRE FTTH: ' + (fibre.fibre.eligible?'Eligible':'Non eligible') + (fibre.fibre.operateurs?.length?' - '+fibre.fibre.operateurs.join(', '):''));
  if(dpe) lines.push('DPE: ' + (dpe.pctAB?dpe.pctAB+'% classes A-B':'') + (dpe.pctFG?', '+dpe.pctFG+'% passoires F-G':''));
  if(cr?.success && cr.indicateurs){
    lines.push('SECURITE/CRIMINALITE:');
    Object.entries(cr.indicateurs).slice(0,6).forEach(([k,v])=>{
      if(v.taux!=null) lines.push('  ' + k + ': ' + v.taux + ' pour 1000 hab');
    });
  }
  if(demo?.rows?.length>=2){
    const r=demo.rows; const ev=((r[r.length-1].pop-r[0].pop)/r[0].pop*100).toFixed(1);
    lines.push('EVOLUTION POPULATION: ' + (ev>=0?'+':'') + ev + '% entre ' + r[0].year + ' et ' + r[r.length-1].year);
  }
  return lines.join('\n');
}

function buildSystemPrompt(){
  const dataCtx = buildAllData();
  const nom = prefs.nom || 'Sofia';

  return "Tu es " + nom + ", l'assistante IA experte en immobilier de IMMO·AI. Tu parles en francais, de facon naturelle, concise et professionnelle (3-5 phrases max sauf si detail demande).\n" +
"\n" +
"Tu connais parfaitement l'application IMMO·AI et ses sections :\n" +
"- Score global (score), Carte interactive, Marche immobilier/DVF (dvf), Loyers estimes (loyers)\n" +
"- Population & economie/INSEE (insee), Logement/Melodi (logement), Mobilite & transports (mobilite)\n" +
"- Cadre de vie : Ensoleillement (soleil), Bruit (bruit), Qualite air (qualiteair), Risques naturels (risques)\n" +
"- Etablissements scolaires (ecoles), Services & commerces (services), Fibre (fibre), DPE (dpe)\n" +
"- Securite/criminalite (criminalite), Demographie (demographique)\n" +
"- Outils : Budget loyer, Louer vs acheter, Mensualites credit, PTZ, Investissement locatif, Coaching offre\n" +
"\n" +
"DONNEES DE L'ANALYSE EN COURS :\n" +
dataCtx + "\n" +
"\n" +
"INSTRUCTIONS IMPORTANTES :\n" +
"1. Tu connais TOUTES les donnees ci-dessus par coeur. Utilise-les pour repondre avec precision.\n" +
"2. Si une donnee n'est PAS dans les donnees ci-dessus (ex: altitude precise, prix d'un bien specifique), dis-le clairement sans inventer.\n" +
"3. Quand tu parles d'une section specifique, ajoute en fin de reponse [CARD:id] pour l'ouvrir. Ex: [CARD:score] [CARD:dvf] [CARD:mobilite]\n" +
"4. Pour fermer une carte : [CARD:close]\n" +
"5. Tu peux mentionner plusieurs cartes dans une meme reponse.\n" +
"6. JAMAIS d'information exterieure ou inventee. Si absent des donnees = 'Cette information n'est pas dans l'analyse IMMO-AI.'";
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
  if(genreChange){
    const wrap = document.getElementById('av-canvas-wrap');
    if(wrap) showFallbackAvatar(wrap);
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
