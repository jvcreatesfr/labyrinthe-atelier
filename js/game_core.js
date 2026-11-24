
'use strict';
/* ===== Labyrinthe – Atelier (version HTML) : socle ===== */
const CELL = 2.8, TAU = Math.PI * 2;
const rad = d => d * Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angleDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- couleurs (sRGB comme dans Godot) ---------- */
const dark = (c, a) => [c[0] * (1 - a), c[1] * (1 - a), c[2] * (1 - a)];
const mkCol = c => new THREE.Color().setRGB(c[0], c[1], c[2]).convertSRGBToLinear();
function stdMat(c, rough, metal, opts) {
  const m = new THREE.MeshStandardMaterial({ color: mkCol(c), roughness: rough === undefined ? 0.85 : rough, metalness: metal || 0 });
  if (opts) Object.assign(m, opts); return m;
}
function basicMat(c, opts) { const m = new THREE.MeshBasicMaterial({ color: mkCol(c) }); if (opts) Object.assign(m, opts); return m; }

const THEMES = [
  { nom: "Quai bleu", mur: [0.16, 0.38, 0.68], sol: [0.72, 0.71, 0.67], fond: [0.07, 0.09, 0.13] },
  { nom: "Conteneur orange", mur: [0.90, 0.46, 0.13], sol: [0.70, 0.68, 0.64], fond: [0.10, 0.09, 0.09] },
  { nom: "Hangar vert", mur: [0.22, 0.52, 0.36], sol: [0.72, 0.72, 0.68], fond: [0.07, 0.10, 0.09] },
  { nom: "Stock rouge", mur: [0.74, 0.22, 0.17], sol: [0.74, 0.71, 0.66], fond: [0.11, 0.08, 0.08] },
  { nom: "Jaune sécurité", mur: [0.93, 0.72, 0.10], sol: [0.64, 0.65, 0.68], fond: [0.09, 0.09, 0.10] },
  { nom: "Acier", mur: [0.40, 0.47, 0.58], sol: [0.74, 0.72, 0.68], fond: [0.08, 0.09, 0.11] },
  { nom: "Sarcelle", mur: [0.20, 0.52, 0.56], sol: [0.72, 0.70, 0.64], fond: [0.07, 0.10, 0.11] },
  { nom: "Rouille", mur: [0.66, 0.36, 0.20], sol: [0.70, 0.69, 0.66], fond: [0.10, 0.08, 0.07] },
  { nom: "Marine", mur: [0.18, 0.26, 0.50], sol: [0.73, 0.71, 0.66], fond: [0.06, 0.07, 0.12] },
  { nom: "Anthracite", mur: [0.30, 0.33, 0.38], sol: [0.60, 0.60, 0.58], fond: [0.06, 0.06, 0.08] },
];
const theme = n => THEMES[(n - 1) % THEMES.length];
const COULEURS_DECOR = {
  x_cardboard: [0.80, 0.58, 0.34], x_paper: [1.00, 0.97, 0.90], x_wood: [0.74, 0.52, 0.30], x_wood_dark: [0.52, 0.34, 0.20],
  x_steel: [0.66, 0.70, 0.76], x_rubber: [0.25, 0.25, 0.32], x_blk: [0.18, 0.18, 0.24], x_blue: [0.22, 0.45, 0.78],
  x_red: [0.78, 0.27, 0.24], x_yellow: [0.96, 0.78, 0.14], x_yellow_dark: [0.86, 0.56, 0.08],
};
function cleMat(nom, nomMat) {
  if (nom.includes('Marq_red')) return 'balise_rouge';
  if (nom.includes('Marq_blue')) return 'balise_bleue';
  if (nom.includes('Marq_steel_dark')) return 'marquage';
  if (nomMat === 'x_wall') return 'mur';
  if (nomMat === 'x_floor') return 'sol';
  if (nomMat === 'x_steel_dark') return nom.includes('Mur_') ? 'lisere' : 'metal_sombre';
  if (COULEURS_DECOR[nomMat]) return nomMat;
  return '';
}
function creerMat(cle, nomMat, mur, sol, lis) {
  switch (cle) {
    case 'mur': return stdMat(mur, 0.75);
    case 'lisere': return stdMat(lis, 0.75);
    case 'sol': return stdMat(sol, 0.9);
    case 'marquage': return stdMat(dark(sol, 0.14), 0.9);
    case 'metal_sombre': return stdMat([0.36, 0.40, 0.54], 0.5);
    case 'balise_rouge': return stdMat([0.95, 0.25, 0.10], 0.75, 0, { emissive: mkCol([1, 0.25, 0.05]), emissiveIntensity: 1.6 });
    case 'balise_bleue': return stdMat([0.10, 0.80, 1.0], 0.75, 0, { emissive: mkCol([0.05, 0.7, 1.0]), emissiveIntensity: 1.3 });
    default: return nomMat === 'x_steel' ? stdMat(COULEURS_DECOR[nomMat], 0.45, 0.3) : stdMat(COULEURS_DECOR[nomMat], 0.75);
  }
}
function appliquerPalette(root, th) {
  const lis = dark(th.mur, 0.35), cache = {};
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.name && o.name.includes('colonly')) { o.visible = false; return; }
    const nomMat = (o.material && o.material.name) || '';
    const cle = cleMat(o.name || '', nomMat);
    if (cle !== '') { if (!cache[cle]) cache[cle] = creerMat(cle, nomMat, th.mur, th.sol, lis); o.material = cache[cle]; }
    o.castShadow = cle !== 'sol' && cle !== 'marquage';
    o.receiveShadow = true;
  });
}

/* ---------- sauvegarde (localStorage) ---------- */
const GILETS_NOMS = ["Gilet d'origine", "Gilet orange", "Gilet vert", "Gilet violet", "Gilet rose"];
const GILETS_PRIX = [0, 40, 40, 60, 60];
const GILETS_COUL = [[0.22, 0.18, 0.16], [1.0, 0.50, 0.10], [0.15, 0.75, 0.35], [0.60, 0.32, 0.95], [1.0, 0.40, 0.70]];
const PRIX_BOUCLIER = 25, PRIX_BOTTES = 120, PRIX_AIMANT = 90;
const Sauv = {
  KEY: 'labyrinthe_atelier_html_v1', CLES_PAR_COFFRE: 3, BOUCLIERS_MAX: 3, BONUS_BOTTES: 1.15,
  pieces: 0, cles: 0, coffres_ouverts: 0, boucliers: 0, bottes: false, aimant: false, gilets: [0], gilet: 0, niveau_max: 1,
  charger() {
    try {
      const t = localStorage.getItem(this.KEY); if (!t) return;
      const d = JSON.parse(t);
      this.pieces = d.pieces | 0; this.cles = d.cles | 0; this.coffres_ouverts = d.coffres_ouverts | 0;
      this.boucliers = clamp(d.boucliers | 0, 0, this.BOUCLIERS_MAX);
      this.bottes = !!d.bottes; this.aimant = !!d.aimant;
      this.gilet = clamp(d.gilet | 0, 0, GILETS_NOMS.length - 1);
      this.niveau_max = Math.max(1, d.niveau_max | 0);
      this.gilets = [0]; (d.gilets || [0]).forEach(g => { g = g | 0; if (g >= 0 && g < GILETS_NOMS.length && !this.gilets.includes(g)) this.gilets.push(g); });
    } catch (e) { console.warn('Sauvegarde illisible', e); }
  },
  sauver() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({ pieces: this.pieces, cles: this.cles, coffres_ouverts: this.coffres_ouverts,
        boucliers: this.boucliers, bottes: this.bottes, aimant: this.aimant, gilets: this.gilets, gilet: this.gilet, niveau_max: this.niveau_max }));
    } catch (e) { console.warn('Sauvegarde impossible', e); }
  },
  reset() { try { localStorage.removeItem(this.KEY); } catch (e) {} location.reload(); },
  ouvrirCoffre() {
    this.coffres_ouverts++;
    let texte = ''; const tirage = Math.floor(Math.random() * 100);
    const libres = []; for (let i = 1; i < GILETS_NOMS.length; i++) if (!this.gilets.includes(i)) libres.push(i);
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    if (tirage < 40) { const g = ri(40, 90); this.pieces += g; texte = '+' + g + ' pièces !'; }
    else if (tirage < 65 && this.boucliers < this.BOUCLIERS_MAX) { const a = Math.min(2, this.BOUCLIERS_MAX - this.boucliers); this.boucliers += a; texte = '+' + a + ' bouclier' + (a > 1 ? 's' : '') + ' !'; }
    else if (tirage < 90 && libres.length) { const g = libres[Math.floor(Math.random() * libres.length)]; this.gilets.push(g); texte = 'Nouveau : ' + GILETS_NOMS[g] + ' !'; }
    else { const j = ri(120, 180); this.pieces += j; texte = 'JACKPOT ! +' + j + ' pièces !'; }
    this.sauver(); return texte;
  },
};

/* ---------- rendu ---------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camTP = new THREE.PerspectiveCamera(50, 1, 0.1, 250);   // 3e personne (vue du dessus)
const camFP = new THREE.PerspectiveCamera(75, 1, 0.05, 250);  // 1ère personne
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
scene.add(sun); scene.add(sun.target);
const SUN_DIR = new THREE.Vector3(0.158, -0.961, -0.226);   // même direction que le soleil du projet Godot
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camTP.aspect = camFP.aspect = w / h; camTP.updateProjectionMatrix(); camFP.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

/* ---------- chargement des .glb embarqués (base64 : marche en double-clic, sans serveur) ---------- */
function b64ToBuf(b64) { const s = atob(b64), n = s.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = s.charCodeAt(i); return u.buffer; }
const gltfLoader = new THREE.GLTFLoader();
const cacheGLTF = {};
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Fichier introuvable : ' + src)); document.head.appendChild(s); }); }
async function glb(key, src) {
  if (cacheGLTF[key]) return cacheGLTF[key];
  if (!(window.GLB && window.GLB[key])) await loadScript(src);
  const g = await new Promise((res, rej) => gltfLoader.parse(b64ToBuf(window.GLB[key]), '', res, rej));
  window.GLB[key] = null;   // libère la mémoire du texte base64
  cacheGLTF[key] = g; return g;
}
