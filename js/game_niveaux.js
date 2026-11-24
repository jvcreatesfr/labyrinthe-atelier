
'use strict';
/* ===== Construction des niveaux ===== */

/* ---- collisions 2D (le joueur est un cercle de rayon 0,4 ; murs = boîtes alignées) ---- */
function boxesDepuisGeom(n) {
  return GEOM[String(n)].boxes.filter(b => b[4] >= 0.3).map(b => ({ x0: b[0], x1: b[1], z0: b[2], z1: b[3], h: b[4] }));
}
/* distance du premier obstacle plus haut que h sur le rayon (ox,oz)+t*(dx,dz) ; Infinity si rien (origine à l'intérieur d'une boîte = ignorée, comme Godot) */
function rayBoxes(boxes, ox, oz, dx, dz, maxD, h) {
  let best = Infinity;
  for (const b of boxes) {
    if (b.h <= h) continue;
    if (ox > b.x0 && ox < b.x1 && oz > b.z0 && oz < b.z1) continue;
    let tmin = -1e9, tmax = 1e9, ok = true;
    if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) ok = false; }
    else { let t1 = (b.x0 - ox) / dx, t2 = (b.x1 - ox) / dx; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
    if (ok) {
      if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) ok = false; }
      else { let t1 = (b.z0 - oz) / dz, t2 = (b.z1 - oz) / dz; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
    }
    if (!ok || tmin > tmax || tmax < 0) continue;
    const t = Math.max(tmin, 0);
    if (t <= maxD && t < best) best = t;
  }
  return best;
}

function repere(couleur, x, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 32),
    stdMat(couleur, 0.5, 0, { emissive: mkCol(couleur), emissiveIntensity: 1.4 }));
  m.position.set(x, 0.04, z); return m;
}

/* ---- niveaux 1 à 9 : .glb recoloré avec la palette de l'atelier ---- */
async function construireGlb(n, th) {
  const gl = await glb('niv' + n, 'data/niv' + n + '.js');
  const root = gl.scene.clone(true);
  appliquerPalette(root, th);
  const g = new THREE.Group(); g.add(root);
  const mk = GEOM[String(n)].markers;
  const P = nm => mk[nm] || [0, 0, 0];
  const find = sub => { const r = []; root.traverse(o => { if (o.name && o.name.includes(sub)) r.push(o); }); return r; };
  return {
    group: g, root, th, boxes: boxesDepuisGeom(n), markers: mk,
    spawn: { x: P('Spawn')[0], z: P('Spawn')[2] }, fin: { x: P('Fin')[0], z: P('Fin')[2] },
    find,
  };
}

/* ---- niveau 10 : généré par code (labyrinthe + rayonnages + salle des lasers) ---- */
const ETAGES = [0.30, 1.25, 2.20], PROBA_RACK = 0.6, HAUTEUR_MUR = 3.0, DEMI_PILIER = 0.6;
const COULEURS_COLIS = [[0.80, 0.60, 0.36], [0.70, 0.50, 0.28], [0.86, 0.70, 0.48], [0.92, 0.92, 0.90]];
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
function instances(liste, mat, ombres) {
  const m = new THREE.InstancedMesh(UNIT_BOX, mat, Math.max(liste.length, 1));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Pv = new THREE.Vector3(), S = new THREE.Vector3();
  liste.forEach((t, i) => { Pv.set(t.p[0], t.p[1], t.p[2]); S.set(t.s[0], t.s[1], t.s[2]); M.compose(Pv, Q, S); m.setMatrixAt(i, M); });
  m.count = liste.length; m.instanceMatrix.needsUpdate = true; m.frustumCulled = false;
  m.castShadow = !!ombres; m.receiveShadow = true; return m;
}
const tr = (orient, cx, cz, u, y, v, su, sy, sv) => orient === 0 ? { p: [cx + u, y, cz + v], s: [su, sy, sv] } : { p: [cx + v, y, cz + u], s: [sv, sy, su] };

async function construireCode(niv, th) {
  const d = donneesNiveau(niv), grille = d.grille, n = grille.length, moitie = Math.floor((n - 1) / 2);
  const PR = niv === 10 ? PROBA_RACK : Math.max(0.35, PROBA_RACK - 0.15 * (n - 25) / 16);   // moins de rayonnages dans les très grands niveaux (fluidité)
  const rng = mulberry32(4242 + niv), rr = (a, b) => a + (b - a) * rng(), ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const g = new THREE.Group(), boxes = [];
  const etendue = n * CELL, mur = th.mur, sol = th.sol, lisere = dark(mur, 0.4);

  const solMesh = new THREE.Mesh(new THREE.BoxGeometry(etendue + 20, 1, etendue + 20), stdMat(sol, 0.9));
  solMesh.position.y = -0.5; solMesh.receiveShadow = true; g.add(solMesh);

  /* cases jamais transformées en rack : pourtour + anneau de la salle des lasers */
  const exclus = new Set();
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i === 0 || j === 0 || i === n - 1 || j === n - 1) exclus.add(i * 1000 + j);
  if (d.salle) { const r = Math.ceil(d.salle.limites[1] / CELL); for (let i = moitie - r; i <= moitie + r; i++) for (let j = moitie - r; j <= moitie + r; j++) exclus.add(i * 1000 + j); }

  /* longs murs droits (3 cases et plus) candidats au rayonnage */
  const cand = [];
  for (let orient = 0; orient < 2; orient++) for (let a = 1; a < n - 1; a++) {
    let debut = -1;
    for (let b = 1; b < n; b++) {
      let estMur = false;
      if (b < n - 1) { const i = orient === 0 ? b : a, j = orient === 0 ? a : b; estMur = grille[j][i] === '#' && !exclus.has(i * 1000 + j); }
      if (estMur) { if (debut < 0) debut = b; }
      else { if (debut >= 0 && b - debut >= 3) cand.push({ orient, a, b0: debut, b1: b - 1 }); debut = -1; }
    }
  }
  for (let k = cand.length - 1; k > 0; k--) { const m = ri(0, k); const t = cand[k]; cand[k] = cand[m]; cand[m] = t; }
  const pris = new Set(), racks = [];
  for (const c of cand) {
    if (rng() > PR) continue;
    const cases = []; let libre = true;
    for (let b = c.b0; b <= c.b1; b++) { const i = c.orient === 0 ? b : c.a, j = c.orient === 0 ? c.a : b, cle = i * 1000 + j; if (pris.has(cle)) { libre = false; break; } cases.push(cle); }
    if (!libre) continue;
    cases.forEach(k => pris.add(k)); racks.push({ orient: c.orient, a: c.a, b0: c.b0, b1: c.b1 });
  }

  const G = { montants: [], lisses: [], palettes: [], colis: [[], [], [], []] };
  function remplirPalette(orient, cx, cz, u, v, yBase, etage) {
    const hmax = etage === 2 ? 0.55 : 0.7, boites = [], tirage = rng();
    if (tirage < 0.5) boites.push([0, 0, [rr(0.85, 1.05), rr(0.4, hmax), rr(0.8, 0.95)], 0]);
    else if (tirage < 0.8) { boites.push([-0.28, 0, [0.52, rr(0.35, hmax), 0.9], 0]); boites.push([0.28, 0, [0.52, rr(0.3, hmax), 0.9], 0]); }
    else { const h1 = hmax * 0.5; boites.push([0, 0, [0.95, h1, 0.9], 0]); boites.push([0, 0, [0.8, h1 - 0.02, 0.8], h1]); }
    for (const bt of boites) { const s = bt[2], ci = ri(0, 3); G.colis[ci].push(tr(orient, cx, cz, u + bt[0], yBase + bt[3] + s[1] * 0.5, v + bt[1], s[0], s[1], s[2])); }
  }
  for (const r of racks) {
    const orient = r.orient, a = r.a, k = r.b1 - r.b0 + 1, centreB = (r.b0 + r.b1) / 2;
    const cx = ((orient === 0 ? centreB : a) - moitie) * CELL, cz = ((orient === 0 ? a : centreB) - moitie) * CELL, longueur = k * CELL;
    for (let b = 0; b <= k; b++) { const u = -longueur / 2 + b * CELL; for (const v of [-1.2, 1.2]) G.montants.push(tr(orient, cx, cz, u, 1.5, v, 0.12, 3.0, 0.12)); }
    for (let b = 0; b < k; b++) {
      const u0 = -longueur / 2 + (b + 0.5) * CELL;
      for (let e = 0; e < ETAGES.length; e++) {
        const h = ETAGES[e];
        for (const v of [-1.2, 1.2]) G.lisses.push(tr(orient, cx, cz, u0, h, v, CELL - 0.1, 0.12, 0.07));
        for (const pu of [-0.7, 0.7]) for (const pv of [-0.62, 0.62]) {
          if (rng() > (e === 0 ? 0.88 : 0.72)) continue;
          const yPal = h + 0.13;
          G.palettes.push(tr(orient, cx, cz, u0 + pu, yPal, pv, 1.2, 0.14, 1.05));
          remplirPalette(orient, cx, cz, u0 + pu, pv, yPal + 0.07, e);
        }
      }
    }
    boxes.push(orient === 0 ? { x0: cx - longueur / 2, x1: cx + longueur / 2, z0: cz - CELL / 2, z1: cz + CELL / 2, h: HAUTEUR_MUR }
                            : { x0: cx - CELL / 2, x1: cx + CELL / 2, z0: cz - longueur / 2, z1: cz + longueur / 2, h: HAUTEUR_MUR });
  }
  g.add(instances(G.montants, stdMat([0.12, 0.32, 0.68], 0.5), true));
  g.add(instances(G.lisses, stdMat([0.95, 0.48, 0.08], 0.5), true));
  g.add(instances(G.palettes, stdMat([0.70, 0.50, 0.28], 0.9), false));
  G.colis.forEach((l, i) => g.add(instances(l, stdMat(COULEURS_COLIS[i], 0.85), false)));

  /* murs pleins : cases d'une même rangée fusionnées */
  const blocs = [], socles = [], chapeaux = [];
  for (let j = 0; j < n; j++) {
    const ligne = grille[j]; let i = 0;
    while (i < n) {
      if (ligne[i] !== '#' || pris.has(i * 1000 + j)) { i++; continue; }
      const debut = i; while (i < n && ligne[i] === '#' && !pris.has(i * 1000 + j)) i++;
      const longueur = (i - debut) * CELL, cx = ((debut + i - 1) * 0.5 - moitie) * CELL, cz = (j - moitie) * CELL;
      blocs.push({ p: [cx, HAUTEUR_MUR * 0.5, cz], s: [longueur, HAUTEUR_MUR, CELL] });
      socles.push({ p: [cx, 0.3, cz], s: [longueur + 0.08, 0.6, CELL + 0.08] });
      chapeaux.push({ p: [cx, HAUTEUR_MUR + 0.05, cz], s: [longueur + 0.1, 0.1, CELL + 0.1] });
      boxes.push({ x0: cx - longueur / 2, x1: cx + longueur / 2, z0: cz - CELL / 2, z1: cz + CELL / 2, h: HAUTEUR_MUR });
    }
  }
  g.add(instances(blocs, stdMat(mur, 0.7), true));
  g.add(instances(socles, stdMat([0.20, 0.21, 0.24], 0.6), true));
  g.add(instances(chapeaux, stdMat(lisere, 0.6), true));

  /* salle des lasers : sol sombre, bords jaunes, piliers */
  if (d.salle) {
    const lo = d.salle.limites[0], hi = d.salle.limites[1], larg = hi - lo;
    const tapis = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.02, larg), stdMat(dark(sol, 0.22), 0.9));
    tapis.position.set((lo + hi) * 0.5, 0.01, (lo + hi) * 0.5); tapis.receiveShadow = true; g.add(tapis);
    const jaune = stdMat([0.95, 0.72, 0.06], 0.6);
    for (const c of [[0, lo + 0.2, larg, 0.3], [0, hi - 0.2, larg, 0.3], [lo + 0.2, 0, 0.3, larg], [hi - 0.2, 0, 0.3, larg]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(c[2], 0.03, c[3]), jaune); b.position.set(c[0], 0.02, c[1]); b.receiveShadow = true; g.add(b);
    }
    let pil = null; try { pil = await glb('pilier', 'data/pieges.js'); } catch (e) { console.warn(e); }
    for (const pc of d.salle.piliers) {
      let o;
      if (pil) { o = pil.scene.clone(true); o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); }
      else { o = new THREE.Mesh(UNIT_BOX, stdMat([0.6, 0.6, 0.58], 0.9)); o.scale.set(1.2, HAUTEUR_MUR, 1.2); o.position.y = HAUTEUR_MUR / 2; }
      o.position.x = pc[0]; o.position.z = pc[1]; g.add(o);
      boxes.push({ x0: pc[0] - DEMI_PILIER, x1: pc[0] + DEMI_PILIER, z0: pc[1] - DEMI_PILIER, z1: pc[1] + DEMI_PILIER, h: HAUTEUR_MUR });
    }
  }
  g.add(repere([0.10, 0.65, 0.95], d.depart[0], d.depart[1]));
  g.add(repere([0.95, 0.25, 0.10], d.arrivee[0], d.arrivee[1]));
  return { group: g, root: g, th, boxes, markers: {}, spawn: { x: d.depart[0], z: d.depart[1] }, fin: { x: d.arrivee[0], z: d.arrivee[1] }, find: () => [] };
}

async function construireNiveau(n) {
  const th = theme(n);
  return n >= 10 ? construireCode(n, th) : construireGlb(n, th);
}

/* libère la mémoire GPU d'un niveau quitté (100 niveaux : on ne peut pas tout garder) */
function disposerNiveau(lvl) {
  if (!lvl || !lvl.group) return;
  lvl.group.traverse(o => { if (o.isInstancedMesh) { o.dispose(); if (o.material && o.material.dispose) o.material.dispose(); } });
}
