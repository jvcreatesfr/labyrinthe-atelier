
'use strict';
/* ===== Joueur, butin, interface et boucle de jeu ===== */
const $ = id => document.getElementById(id);
const R_JOUEUR = 0.4;

/* ---------- entrées : clavier (touches physiques, OK en AZERTY), joystick virtuel, manette ---------- */
const keys = {};
const joy = { x: 0, y: 0, actif: false, id: null };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyC' && !e.repeat) basculerCamera();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
(function initJoystick() {
  const zone = $('joy'), knob = $('knob'), RAYON = 75;
  function maj(e) {
    const r = zone.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy); if (l > RAYON) { dx = dx / l * RAYON; dy = dy / l * RAYON; }
    joy.x = dx / RAYON; joy.y = dy / RAYON; knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  zone.addEventListener('pointerdown', e => { joy.actif = true; joy.id = e.pointerId; zone.setPointerCapture(e.pointerId); maj(e); e.preventDefault(); });
  zone.addEventListener('pointermove', e => { if (joy.actif && e.pointerId === joy.id) maj(e); });
  const fin = e => { if (e.pointerId !== joy.id) return; joy.actif = false; joy.x = joy.y = 0; knob.style.transform = ''; };
  zone.addEventListener('pointerup', fin); zone.addEventListener('pointercancel', fin);
})();
function resetJoy() { joy.actif = false; joy.x = joy.y = 0; $('knob').style.transform = ''; }
function lireEntree() {
  let x = joy.x, y = joy.y;
  if (x === 0 && y === 0) {
    const k = (a, b) => (keys[a] || keys[b]) ? 1 : 0;
    x = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft'); y = k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp');
  }
  if (x === 0 && y === 0 && navigator.getGamepads) {
    const gp = [...navigator.getGamepads()].find(g => g);
    if (gp) { const gx = gp.axes[0] || 0, gy = gp.axes[1] || 0; if (Math.hypot(gx, gy) > 0.2) { x = gx; y = gy; } }
  }
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  return { x, y };
}

/* ---------- joueur ---------- */
class Joueur {
  constructor() {
    this.x = 0; this.z = 0; this.y = 0.05; this.rot = 0; this.vx = 0; this.vz = 0; this.actif = true; this.fp = false; this.mult = 1;
    this.obj = new THREE.Group(); this.modele = new THREE.Group(); this.modele.rotation.y = Math.PI; this.obj.add(this.modele);
    this.clignoteJusqua = 0; this.celebre = false; this.nomAnim = ''; this.cur = null; this.clips = []; this.mixer = null;
  }
  async init() {
    try {
      const g = await glb('perso', 'data/perso.js'), inst = g.scene;
      inst.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      this.modele.add(inst); this.mixer = new THREE.AnimationMixer(inst); this.clips = g.animations;
    } catch (e) {
      console.warn('Modèle du perso introuvable, capsule de secours', e);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.4, 1.2, 4, 12) : new THREE.CylinderGeometry(0.4, 0.4, 2, 12), stdMat([0.9, 0.5, 0.2]));
      m.position.y = 1; this.modele.add(m);
    }
    this.appliquerVue();
  }
  trouver(court) { return this.clips.find(c => c.name.endsWith(court)); }
  jouer(court, vit) {
    if (!this.mixer) return; const clip = this.trouver(court); if (!clip) return;
    if (this.nomAnim !== clip.name) {
      const next = this.mixer.clipAction(clip); next.enabled = true; next.reset();
      if (court === 'Interagir') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
      if (this.cur && this.cur !== next) next.crossFadeFrom(this.cur, 0.15, false);
      next.play(); this.cur = next; this.nomAnim = clip.name;
    }
    if (this.cur) this.cur.timeScale = vit || 1;
  }
  appliquerVue() { this.modele.visible = !this.fp; }
  placer(x, z) { this.x = x; this.z = z; this.rot = 0; this.vx = this.vz = 0; this.celebre = false; this.nomAnim = ''; this.jouer('Idle'); this.modele.visible = !this.fp; this.sync(); }
  clignoter(d) { this.clignoteJusqua = performance.now() / 1000 + d; }
  celebration() { this.celebre = true; this.jouer('Interagir'); }
  appliquerGilet(i) {
    const c = mkCol(GILETS_COUL[clamp(i, 0, GILETS_COUL.length - 1)]);
    this.modele.traverse(o => { if (o.isMesh && o.material && o.material.name && o.material.name.includes('Vest')) { if (!o.userData.matClone) { o.material = o.material.clone(); o.userData.matClone = true; } o.material.color.copy(c); } });
  }
  update(dt, inp, boxes) {
    let vx, vz;
    if (this.fp) {
      this.rot -= inp.x * 2.4 * dt; const av = -inp.y;
      vx = -Math.sin(this.rot) * av * 6 * this.mult; vz = -Math.cos(this.rot) * av * 6 * this.mult;
    } else {
      vx = inp.x * 6 * this.mult; vz = inp.y * 6 * this.mult;
      if (Math.hypot(inp.x, inp.y) > 0.05) this.rot = lerpAngle(this.rot, Math.atan2(-inp.x, -inp.y), clamp(14 * dt, 0, 1));
    }
    let nx = this.x + vx * dt, nz = this.z + vz * dt;
    for (let it = 0; it < 4; it++) {
      let bouge = false;
      for (const b of boxes) {
        const cx = clamp(nx, b.x0, b.x1), cz = clamp(nz, b.z0, b.z1), dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz;
        if (d2 < R_JOUEUR * R_JOUEUR) {
          if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = cx + dx / d * R_JOUEUR; nz = cz + dz / d * R_JOUEUR; }
          else { const l = nx - b.x0, r = b.x1 - nx, t = nz - b.z0, bt = b.z1 - nz, m = Math.min(l, r, t, bt); if (m === l) nx = b.x0 - R_JOUEUR; else if (m === r) nx = b.x1 + R_JOUEUR; else if (m === t) nz = b.z0 - R_JOUEUR; else nz = b.z1 + R_JOUEUR; }
          bouge = true;
        }
      }
      if (!bouge) break;
    }
    this.vx = (nx - this.x) / dt; this.vz = (nz - this.z) / dt; this.x = nx; this.z = nz;
    if (!this.celebre) { const v = Math.hypot(this.vx, this.vz); if (v > 0.6) this.jouer('Run', clamp(v / 5, 0.8, 1.6)); else this.jouer('Idle'); }
    this.sync();
  }
  sync() { this.obj.position.set(this.x, this.y, this.z); this.obj.rotation.y = this.rot; }
  majVisuel(dt) {
    if (this.mixer) this.mixer.update(dt);
    const now = performance.now() / 1000;
    if (this.fp) this.modele.visible = false;
    else if (now < this.clignoteJusqua) this.modele.visible = Math.floor(now * 14) % 2 === 0;
    else this.modele.visible = true;
  }
}

/* ---------- pièces et clé ---------- */
class Butin {
  constructor(group, joueur, donnees) {
    this.group = group; this.j = joueur; this.poche = 0; this.clePrise = false; this.temps = 0; this.pieces = []; this.cle = null; this.effets = [];
    this.onPieces = () => {}; this.onCle = () => {};
    const matOr = stdMat([1.0, 0.78, 0.15], 0.3, 0.7, { emissive: mkCol([1.0, 0.62, 0.05]), emissiveIntensity: 0.8 });
    const disque = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 20);
    for (const p of (donnees.pieces || [])) {
      const g = new THREE.Group(); g.position.set(p[0], 1.0, p[1]); g.rotation.y = Math.random() * TAU;
      const m = new THREE.Mesh(disque, matOr); m.rotation.x = Math.PI / 2; g.add(m); group.add(g); this.pieces.push(g);
    }
    if (donnees.cle && donnees.cle.length === 2) {
      const mc = stdMat([1.0, 0.92, 0.35], 0.25, 0.5, { emissive: mkCol([1.0, 0.85, 0.2]), emissiveIntensity: 1.3 });
      const k = new THREE.Group();
      const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.085, 12, 24), mc); anneau.rotation.x = Math.PI / 2; anneau.position.y = 0.55; k.add(anneau);
      const tige = new THREE.Mesh(UNIT_BOX, mc); tige.scale.set(0.13, 0.85, 0.13); k.add(tige);
      for (const dy of [-0.30, -0.08]) { const d = new THREE.Mesh(UNIT_BOX, mc); d.scale.set(0.30, 0.11, 0.13); d.position.set(0.17, dy, 0); k.add(d); }
      k.scale.setScalar(1.5);
      const l = new THREE.PointLight(0xffe666, 1.4, 5); k.add(l);
      k.position.set(donnees.cle[0], 1.2, donnees.cle[1]); group.add(k); this.cle = k;
    }
  }
  effet(o) { this.effets.push({ o, t: 0, y0: o.position.y, s0: o.scale.x }); }
  update(dt) {
    this.temps += dt; const p = this.j, aimant = Sauv.aimant;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const g = this.pieces[i]; g.rotation.y += dt * 3; g.position.y = 1.0 + Math.sin(this.temps * 3 + i) * 0.08;
      const vx = p.x - g.position.x, vz = p.z - g.position.z; let dist = Math.hypot(vx, vz);
      if (aimant && dist < 3.6 && dist > 0.01) { const pas = Math.min(11 * dt, dist); g.position.x += vx / dist * pas; g.position.z += vz / dist * pas; dist -= pas; }
      if (dist < (aimant ? 0.75 : 0.95)) { this.pieces.splice(i, 1); this.poche++; this.onPieces(this.poche); this.effet(g); }
    }
    if (this.cle) {
      this.cle.rotation.y += dt * 2.2; this.cle.position.y = 1.2 + Math.sin(this.temps * 2.5) * 0.12;
      if (Math.hypot(p.x - this.cle.position.x, p.z - this.cle.position.z) < 1.2) { const k = this.cle; this.cle = null; this.clePrise = true; this.onCle(); this.effet(k); }
    }
  }
  majEffets(dt) {
    for (let i = this.effets.length - 1; i >= 0; i--) {
      const e = this.effets[i]; e.t += dt; const k = clamp(e.t / 0.25, 0, 1);
      e.o.scale.setScalar(Math.max(0.01, e.s0 * (1 - k * k))); e.o.position.y = e.y0 + 1.2 * k;
      if (k >= 1) { this.group.remove(e.o); this.effets.splice(i, 1); }
    }
  }
}

/* ---------- état du jeu ---------- */
const E = { niveau: 1, lvl: null, pieges: [], butin: null, termine: false, pret: false, pause: false, charge: true, invulJusqua: 0, arme: 0, fin: null, numAstuce: 0, assets: { plaque: null, poste: null }, effetsFin: null };
const J = new Joueur();
window.E = E; window.J = J;   // pratique pour déboguer dans la console du navigateur

function basculerCamera() { J.fp = !J.fp; J.appliquerVue(); }
function basculerPleinEcran() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
}
document.addEventListener('fullscreenchange', () => {
  const b = $('bPlein'); if (b) b.textContent = document.fullscreenElement ? 'Quitter plein écran' : 'Plein écran';
});
function appliquerAchats() { J.mult = Sauv.bottes ? Sauv.BONUS_BOTTES : 1; J.appliquerGilet(Sauv.gilet); }

/* ---------- interface ---------- */
const montrer = id => { $(id).style.display = 'flex'; }, cacher = id => { $(id).style.display = 'none'; };
function majHud() {
  const poche = E.butin ? E.butin.poche : 0;
  $('hudPieces').textContent = 'Pièces : ' + Sauv.pieces + '  (+' + poche + ')';
  let c = 'Clés : ' + Sauv.cles + '/' + Sauv.CLES_PAR_COFFRE; if (E.butin && E.butin.clePrise) c += '  (+1 clé !)';
  $('hudCles').textContent = c; $('hudBoucliers').textContent = 'Boucliers : ' + Sauv.boucliers;
}
function afficherAstuce(texte) {
  const n = ++E.numAstuce, a = $('astuce'); a.textContent = texte; a.style.transition = 'none'; a.style.opacity = texte ? '1' : '0';
  if (!texte) return;
  setTimeout(() => { if (n === E.numAstuce) { a.style.transition = 'opacity .6s'; a.style.opacity = '0'; } }, 4500);
}
let actionPrincipale = () => {};
function afficherMenu(msg, detail, texteBouton, action) {
  $('menuMsg').textContent = msg; $('menuDetail').textContent = detail; $('menuDetail').style.display = detail ? 'block' : 'none';
  $('menuPrincipal').textContent = texteBouton; actionPrincipale = action; montrer('menu');
}
function afficherCoffre(texte, suite) {
  $('coffreTitre').textContent = Sauv.CLES_PAR_COFFRE + ' clés : un coffre s\'ouvre !'; $('coffreRecompense').textContent = texte; montrer('coffre');
  $('coffreOk').onclick = () => { cacher('coffre'); majHud(); suite(); };
}

/* boutique */
function ligneBoutique(nom, desc, texte, actif, action) {
  const r = document.createElement('div'); r.className = 'rangee';
  r.innerHTML = '<div class="info"><div class="nom"></div><div class="desc"></div></div>';
  r.querySelector('.nom').textContent = nom; r.querySelector('.desc').textContent = desc;
  const b = document.createElement('button'); b.textContent = texte; b.disabled = !actif; b.onclick = () => { action(); Sauv.sauver(); rendreBoutique(); majHud(); }; r.appendChild(b); return r;
}
function rendreBoutique() {
  $('boutiqueInfo').textContent = 'Pièces : ' + Sauv.pieces + '      Clés : ' + Sauv.cles + '/' + Sauv.CLES_PAR_COFFRE + '      Boucliers : ' + Sauv.boucliers + '/' + Sauv.BOUCLIERS_MAX;
  const L = $('boutiqueListe'); L.innerHTML = '';
  const plein = Sauv.boucliers >= Sauv.BOUCLIERS_MAX;
  L.appendChild(ligneBoutique('Bouclier', 'Te sauve d\'un piège mortel (2 s d\'invincibilité). Maximum ' + Sauv.BOUCLIERS_MAX + '.', plein ? 'Plein' : PRIX_BOUCLIER + ' pièces', !plein && Sauv.pieces >= PRIX_BOUCLIER, () => { Sauv.pieces -= PRIX_BOUCLIER; Sauv.boucliers++; }));
  L.appendChild(ligneBoutique('Bottes', '+15 % de vitesse.', Sauv.bottes ? 'Acheté' : PRIX_BOTTES + ' pièces', !Sauv.bottes && Sauv.pieces >= PRIX_BOTTES, () => { Sauv.pieces -= PRIX_BOTTES; Sauv.bottes = true; appliquerAchats(); }));
  L.appendChild(ligneBoutique('Aimant', 'Attire les pièces proches.', Sauv.aimant ? 'Acheté' : PRIX_AIMANT + ' pièces', !Sauv.aimant && Sauv.pieces >= PRIX_AIMANT, () => { Sauv.pieces -= PRIX_AIMANT; Sauv.aimant = true; }));
  for (let i = 1; i < GILETS_NOMS.length; i++) {
    const poss = Sauv.gilets.includes(i), prix = GILETS_PRIX[i]; let texte, actif;
    if (Sauv.gilet === i) { texte = 'Équipé'; actif = false; } else if (poss) { texte = 'Équiper'; actif = true; } else { texte = prix + ' pièces'; actif = Sauv.pieces >= prix; }
    L.appendChild(ligneBoutique(GILETS_NOMS[i], 'Change la couleur du gilet.', texte, actif, () => { if (!poss) { Sauv.pieces -= prix; Sauv.gilets.push(i); } Sauv.gilet = i; appliquerAchats(); }));
  }
  const o = Sauv.gilet !== 0 ? ligneBoutique(GILETS_NOMS[0], 'Couleur d\'origine.', 'Équiper', true, () => { Sauv.gilet = 0; appliquerAchats(); }) : null; if (o) L.appendChild(o);
}
function ouvrirBoutique() { if (E.charge) return; E.pause = true; rendreBoutique(); montrer('boutique'); }
function fermerBoutique() { cacher('boutique'); E.pause = false; appliquerAchats(); majHud(); }

/* choix du niveau (mode test) */
const MODE_TEST = true;   // true : tous les niveaux sont accessibles (mettre false pour débloquer au fil de la progression)
function ouvrirNiveaux() {
  if (E.charge) return; E.pause = true; const g = $('niveauxGrille'); g.innerHTML = '';
  $('niveauxInfo').textContent = MODE_TEST ? 'Mode test : tous les niveaux sont accessibles.' : 'Niveaux débloqués : ' + Sauv.niveau_max + ' / ' + NB_NIVEAUX;
  for (let n = 1; n <= NB_NIVEAUX; n++) {
    const b = document.createElement('button'); b.textContent = n; b.disabled = !MODE_TEST && n > Sauv.niveau_max;
    b.onclick = () => { cacher('niveaux'); cacher('menu'); E.pause = false; chargerNiveau(n); }; g.appendChild(b);
  }
  montrer('niveaux');
}

/* ---------- niveau : chargement ---------- */
function creerPieges(n, lvl, ctx) {
  const L = [];
  if (n < 10) { if (n >= 8) L.push(new PiegeGarage(ctx, 1)); else if (n >= 4) L.push(new PiegeGrue(ctx, 1)); }
  if (n >= 6 && n < 10) L.push(new PiegeGrue(ctx, 2));
  const d = donneesNiveau(n), piques = [], phPiques = [], lasers = [], dirLasers = [], phLasers = [], ecras = [], cams = [];
  for (const t of (d.pieges || [])) {
    switch (t.type) {
      case 'piques': piques.push(t.pos); phPiques.push(t.phase); break;
      case 'laser': lasers.push(t.pos); dirLasers.push(t.dir); phLasers.push(t.phase); break;
      case 'ecraseur': ecras.push(t.pos); break;
      case 'camera': cams.push(t); break;
    }
  }
  if (piques.length) L.push(new PiegePiquesSol(ctx, piques, phPiques, d.tempo));
  if (lasers.length) L.push(new PiegeLaser(ctx, lasers, dirLasers, phLasers, d.tempo));
  if (ecras.length) L.push(new PiegeEcraseurs(ctx, ecras));
  for (const c of cams) L.push(new PiegeSurveillance(ctx, [c.pos[0], c.pos[1]], c.cap, c.periode || 10.0));
  const tons = (d.pieges || []).filter(t => t.type === 'tonneaux'); if (tons.length) L.push(new PiegeTonneaux(ctx, tons));
  if ((d.portes && d.portes.length) || (d.interrupteurs && d.interrupteurs.length)) L.push(new PiegePortes(ctx, d.portes || [], d.interrupteurs || []));
  if (d.salle) L.push(new PiegeSalleLasers(ctx, d.salle));
  return L;
}
function creerZoneFin(lvl) {
  const g = new THREE.Group(), p = lvl.fin;
  const rayon = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 7, 24), new THREE.MeshBasicMaterial({ color: mkCol([1.0, 0.3, 0.5]), transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
  rayon.position.set(p.x, 3.5, p.z); g.add(rayon);
  const l = new THREE.PointLight(0xff5a8c, 1.6, 6); l.position.set(p.x, 2, p.z); g.add(l);
  lvl.group.add(g);
}
async function chargerNiveau(n) {
  E.charge = true; E.pret = false; E.termine = false; E.invulJusqua = 0; E.arme = 0;
  cacher('menu'); cacher('coffre'); resetJoy(); $('chargementTxt').textContent = 'Chargement du niveau ' + n + '…'; montrer('chargement');
  if (E.lvl) { scene.remove(E.lvl.group); disposerNiveau(E.lvl); E.lvl = null; }
  E.pieges = []; E.butin = null; E.niveau = n;
  try {
    await new Promise(r => setTimeout(r, 30));   // laisse l'écran « Chargement » s'afficher
    const lvl = await construireNiveau(n);
    E.lvl = lvl; scene.add(lvl.group); scene.background = mkCol(lvl.th.fond);
    J.placer(lvl.spawn.x, lvl.spawn.z); J.actif = true; E.fin = lvl.fin;
    creerZoneFin(lvl);
    const ctx = { group: lvl.group, boxes: lvl.boxes, joueur: J, lvl, assets: E.assets, proteger: proteger, onMort: onMort };
    E.pieges = creerPieges(n, lvl, ctx);
    E.butin = new Butin(lvl.group, J, donneesNiveau(n));
    E.butin.onPieces = () => majHud(); E.butin.onCle = () => { afficherAstuce('Clé récupérée ! Arrive jusqu\'au bout pour la garder.'); majHud(); };
    $('titre').textContent = 'Niveau ' + n + ' / ' + NB_NIVEAUX + '   -   ' + lvl.th.nom;
    majHud(); afficherAstuce(n <= ASTUCES.length ? ASTUCES[n - 1] : (donneesNiveau(n).astuce || ''));
    console.log('Niveau ' + n + ' chargé | départ (' + lvl.spawn.x + ', ' + lvl.spawn.z + ') | fin (' + lvl.fin.x + ', ' + lvl.fin.z + ') | ' + lvl.boxes.length + ' obstacles | ' + E.pieges.length + ' pièges');
  } catch (e) {
    console.error(e); const d = $('erreur'); d.style.display = 'block'; d.textContent += 'Niveau ' + n + ' : ' + (e && e.message || e) + '\n';
  }
  cacher('chargement'); E.charge = false;
}

/* ---------- bouclier, mort, arrivée ---------- */
function proteger(raison) {
  const now = performance.now() / 1000;
  if (now < E.invulJusqua) return true;
  if (Sauv.boucliers > 0) {
    Sauv.boucliers--; Sauv.sauver(); E.invulJusqua = now + 2; J.clignoter(2);
    afficherAstuce('Bouclier brisé ! Il t\'en reste ' + Sauv.boucliers + '.'); majHud(); return true;
  }
  return false;
}
function onMort(raison) {
  if (E.termine) return;
  E.termine = true; J.actif = false; resetJoy();
  let detail = '';
  if (E.butin) {
    if (E.butin.poche > 0) detail = 'Tu perds les ' + E.butin.poche + ' pièces ramassées.';
    if (E.butin.clePrise) detail += detail ? '  La clé est perdue aussi.' : 'La clé est perdue.';
  }
  afficherMenu(raison, detail, 'Recommencer', () => chargerNiveau(E.niveau));
}
function terminer() {
  E.termine = true; J.actif = false; resetJoy(); E.pieges.forEach(p => p.arreter()); J.celebration();
  const gain = E.butin ? E.butin.poche : 0, avecCle = !!(E.butin && E.butin.clePrise); let coffre = false;
  Sauv.pieces += gain;
  if (avecCle) { Sauv.cles++; if (Sauv.cles >= Sauv.CLES_PAR_COFFRE) { Sauv.cles -= Sauv.CLES_PAR_COFFRE; coffre = true; } }
  Sauv.niveau_max = Math.max(Sauv.niveau_max, Math.min(E.niveau + 1, NB_NIVEAUX)); Sauv.sauver(); majHud();
  let detail = '+' + gain + ' pièces';
  if (avecCle) detail += coffre ? '   |   Clé trouvée !' : '   |   Clé trouvée (' + Sauv.cles + '/' + Sauv.CLES_PAR_COFFRE + ')';
  else detail += '   |   Pas de clé (elle se cache sur le chemin court ou au fond d\'un cul-de-sac)';
  const suite = () => afficherMenu('Bravo, niveau réussi !', detail, 'Suivant', () => chargerNiveau(E.niveau % NB_NIVEAUX + 1));
  if (coffre) afficherCoffre(Sauv.ouvrirCoffre(), suite); else suite();
}

/* ---------- boucle ---------- */
function physique(dt) {
  const inp = J.actif ? lireEntree() : { x: 0, y: 0 };
  J.update(dt, inp, E.lvl.boxes);
  for (const p of E.pieges) p.update(dt);
  if (E.butin) E.butin.update(dt);
  if (!E.pret) { if (++E.arme >= 2) E.pret = true; }
  if (!E.termine && E.pret && Math.hypot(J.x - E.fin.x, J.z - E.fin.z) < 1.7) terminer();
}
let dernier = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - dernier) / 1000, 0.1); dernier = now;
  if (E.lvl && !E.charge) {
    if (!E.pause) { acc += dt; let n = 0; while (acc >= 1 / 60 && n++ < 6) { physique(1 / 60); acc -= 1 / 60; } if (n >= 6) acc = 0; J.majVisuel(dt); if (E.butin) E.butin.majEffets(dt); }
    /* caméras : 3e personne = vue du dessus qui ne tourne pas ; 1ère personne = suit la rotation du perso */
    camTP.position.set(J.x, J.y + 7 + 3 * Math.sin(rad(75)), J.z + 3 * Math.cos(rad(75))); camTP.rotation.set(-rad(75), 0, 0);
    camFP.position.set(J.x, J.y + 1.75, J.z); camFP.rotation.set(0, J.rot, 0);
    sun.target.position.set(J.x, 0, J.z); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, -70);
    renderer.render(scene, J.fp ? camFP : camTP);
  }
}

/* ---------- démarrage ---------- */
(async function boot() {
  Sauv.charger();
  $('bCam').onclick = e => { basculerCamera(); e.target.blur(); };
  $('bBoutique').onclick = e => { ouvrirBoutique(); e.target.blur(); };
  $('bNiveaux').onclick = e => { ouvrirNiveaux(); e.target.blur(); };
  $('bPlein').onclick = e => { basculerPleinEcran(); e.target.blur(); };
  $('boutiqueFermer').onclick = fermerBoutique;
  $('niveauxFermer').onclick = () => { cacher('niveaux'); E.pause = false; };
  $('resetSauv').onclick = () => { if (confirm('Effacer toute la progression (pièces, clés, achats) ?')) Sauv.reset(); };
  $('menuPrincipal').onclick = () => actionPrincipale();
  $('menuBoutique').onclick = ouvrirBoutique;
  $('menuNiveaux').onclick = ouvrirNiveaux;
  scene.add(J.obj);
  await J.init(); appliquerAchats();
  for (const k of ['plaque', 'poste']) { try { E.assets[k] = await glb(k, 'data/pieges.js'); } catch (e) { console.warn('Asset piège manquant :', k, e); } }
  requestAnimationFrame(frame);
  await chargerNiveau(clamp(Sauv.niveau_max, 1, NB_NIVEAUX));
})();
