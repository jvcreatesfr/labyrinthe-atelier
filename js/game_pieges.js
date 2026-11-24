
'use strict';
/* ===== Pièges (même logique et mêmes durées que les scripts Godot) ===== */
function textureHazard(alpha) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), img = x.createImageData(64, 64);
  for (let yy = 0; yy < 64; yy++) for (let xx = 0; xx < 64; xx++) {
    const j = Math.floor((xx + yy) / 16) % 2 === 0, o = (yy * 64 + xx) * 4, col = j ? [245, 189, 15] : [18, 18, 20];
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255 * alpha;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.encoding = THREE.sRGBEncoding; return t;
}
function ombres(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
function planSol(w, d, mat) { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return new THREE.Mesh(g, mat); }

class Piege {
  constructor(ctx) { this.c = ctx; this.fini = false; }
  tuer(raison) { if (this.fini) return; if (this.c.proteger(raison)) return; this.fini = true; this.c.onMort(raison); }
  arreter() { this.fini = true; }
  update(dt) {}
}

/* ---------- plaques à piques ---------- */
class PiegePiquesSol extends Piege {
  constructor(ctx, positions, phases, tempo) {
    super(ctx); this.pos = positions; this.ph = phases; this.t = 0; this.dalles = [];
    this.T_REPOS = 1.7 / (tempo || 1); this.T_ALERTE = 0.7; this.T_SORTIES = 0.9; this.T_RENTREE = 0.3;
    if (!positions.length) { this.fini = true; return; }
    const geo = new THREE.CylinderGeometry(0, 0.13, 1, 6), mat = stdMat([0.80, 0.84, 0.90], 0.25, 0.7);
    positions.forEach((c, i) => {
      const gr = new THREE.Group(); gr.position.set(c[0], 0, c[1]); ctx.group.add(gr);
      if (ctx.assets.plaque) gr.add(ombres(ctx.assets.plaque.scene.clone(true)));
      else { const p = new THREE.Mesh(UNIT_BOX, stdMat([0.20, 0.20, 0.24], 0.6)); p.scale.set(2.5, 0.06, 2.5); p.position.y = 0.03; gr.add(p); }
      const matVoile = new THREE.MeshBasicMaterial({ color: mkCol([1.0, 0.45, 0.05]), transparent: true, opacity: 0, depthWrite: false });
      const voile = planSol(2.3, 2.3, matVoile); voile.position.y = 0.1; gr.add(voile);
      const piques = [];
      for (const gx of [-0.7, 0, 0.7]) for (const gz of [-0.7, 0, 0.7]) {
        const p = new THREE.Mesh(geo, mat); p.position.set(gx, 0.09, gz); p.scale.set(1, 0.01, 1); p.visible = false; p.castShadow = true; gr.add(p); piques.push(p);
      }
      this.dalles.push({ cx: c[0], cz: c[1], phase: phases[i] || 0, piques, matVoile });
    });
  }
  update(dt) {
    if (this.fini) return;
    this.t += dt; const total = this.T_REPOS + this.T_ALERTE + this.T_SORTIES + this.T_RENTREE, p = this.c.joueur;
    for (const d of this.dalles) {
      const t = (this.t + d.phase) % total; let sortie = 0, clignote = 0;
      if (t < this.T_REPOS) sortie = 0;
      else if (t < this.T_REPOS + this.T_ALERTE) { const k = (t - this.T_REPOS) / this.T_ALERTE; sortie = 0.10 + 0.06 * Math.sin(t * 45); clignote = 0.5 + 0.5 * Math.sin(k * TAU * 3); }
      else if (t < this.T_REPOS + this.T_ALERTE + this.T_SORTIES) { sortie = clamp((t - this.T_REPOS - this.T_ALERTE) / 0.12, 0, 1); clignote = 1; }
      else sortie = 1 - clamp((t - this.T_REPOS - this.T_ALERTE - this.T_SORTIES) / this.T_RENTREE, 0, 1);
      d.matVoile.opacity = clignote * 0.45;
      const h = Math.max(sortie * 0.95, 0.01);
      for (const m of d.piques) { m.visible = sortie > 0.02; m.scale.y = h; m.position.y = 0.09 + h * 0.5; }
      if (sortie > 0.4 && Math.abs(p.x - d.cx) < 1.25 && Math.abs(p.z - d.cz) < 1.25) { this.tuer('Empalé par les piques !'); return; }
    }
  }
}

/* ---------- barrières laser ---------- */
class PiegeLaser extends Piege {
  constructor(ctx, positions, directions, phases, tempo) {
    super(ctx); this.t = 0; this.l = [];
    this.T_ETEINT = 1.6 / (tempo || 1); this.T_ALERTE = 0.7; this.T_ALLUME = 1.1; this.ECART = 1.17;
    if (!positions.length) { this.fini = true; return; }
    const matF = basicMat([1.0, 0.12, 0.2]);
    positions.forEach((c, i) => {
      let d = directions[i] || [1, 0]; let len = Math.hypot(d[0], d[1]); if (len < 0.1) { d = [1, 0]; len = 1; } d = [d[0] / len, d[1] / len];
      const b = [-d[1], d[0]];
      const gr = new THREE.Group(); gr.position.set(c[0], 0, c[1]); gr.rotation.y = Math.atan2(-b[1], b[0]); ctx.group.add(gr);
      const faisceaux = [];
      for (const h of [0.35, 1.0, 1.7]) { const f = new THREE.Mesh(UNIT_BOX, matF); f.scale.set(this.ECART * 2, 0.09, 0.09); f.position.y = h; f.visible = false; gr.add(f); faisceaux.push(f); }
      const matL = new THREE.MeshBasicMaterial({ color: mkCol([0.2, 1, 0.3]) });
      for (const cote of [-1, 1]) {
        if (ctx.assets.poste) { const po = ombres(ctx.assets.poste.scene.clone(true)); po.position.x = cote * this.ECART; if (cote > 0) po.rotation.y = Math.PI; gr.add(po); }
        else { const em = new THREE.Mesh(UNIT_BOX, stdMat([0.95, 0.72, 0.06], 0.55)); em.scale.set(0.3, 2.1, 0.3); em.position.set(cote * this.ECART, 1.05, 0); gr.add(em); }
        const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), matL); lampe.position.set(cote * this.ECART, 2.55, 0); gr.add(lampe);
      }
      this.l.push({ cx: c[0], cz: c[1], marche: d, travers: b, phase: phases[i] || 0, faisceaux, matL });
    });
  }
  update(dt) {
    if (this.fini) return;
    this.t += dt; const total = this.T_ETEINT + this.T_ALERTE + this.T_ALLUME, p = this.c.joueur;
    for (const l of this.l) {
      const t = (this.t + l.phase) % total; let visible = false, allume = false, col = [0.2, 1, 0.3];
      if (t < this.T_ETEINT) col = [0.2, 1, 0.3];
      else if (t < this.T_ETEINT + this.T_ALERTE) { visible = Math.sin(t * 28) > 0.2; col = [1, 0.65, 0.1]; }
      else { visible = true; allume = true; col = [1, 0.1, 0.15]; }
      l.faisceaux.forEach(f => f.visible = visible); l.matL.color.copy(mkCol(col));
      if (allume) {
        const rx = p.x - l.cx, rz = p.z - l.cz;
        if (Math.abs(rx * l.marche[0] + rz * l.marche[1]) < 0.42 && Math.abs(rx * l.travers[0] + rz * l.travers[1]) < 1.4) { this.tuer('Grillé par le laser !'); return; }
      }
    }
  }
}

/* ---------- écraseurs ---------- */
class PiegeEcraseurs extends Piege {
  constructor(ctx, positions) {
    super(ctx); this.t = 0; this.blocs = []; this.centres = positions;
    this.PERIODE = 3.2; this.T_HAUT = 1.5; this.T_DESCENTE = 0.6; this.T_BAS = 0.6; this.T_REMONTEE = 0.5; this.HAUT = 3.6;
    if (!positions.length) { this.fini = true; return; }
    const jaune = stdMat([0.95, 0.72, 0.06], 0.55), noir = stdMat([0.07, 0.07, 0.08], 0.6), acier = stdMat([0.62, 0.66, 0.72], 0.3, 0.7);
    const danger = new THREE.MeshBasicMaterial({ map: textureHazard(0.65), transparent: true, depthWrite: false });
    positions.forEach(c => {
      const bloc = new THREE.Mesh(UNIT_BOX, jaune); bloc.scale.set(2.1, 1.2, 2.0); bloc.castShadow = true; bloc.receiveShadow = true;
      const sem = new THREE.Mesh(UNIT_BOX, noir); sem.scale.set(2.2 / 2.1, 0.2 / 1.2, 2.1 / 2.0); sem.position.y = -0.5 / 1.2 + 0.1 / 1.2;
      const pis = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6, 16), acier); pis.scale.set(1 / 2.1, 1 / 1.2, 1 / 2.0); pis.position.y = (0.6 + 3.0) / 1.2;
      bloc.add(sem); bloc.add(pis); bloc.position.set(c[0], this.HAUT + 0.6, c[1]); ctx.group.add(bloc); this.blocs.push(bloc);
      const sol = planSol(2.2, 2.0, danger); sol.position.set(c[0], 0.03, c[1]); ctx.group.add(sol);
    });
  }
  hauteur(t) {
    if (t < this.T_HAUT) return this.HAUT; t -= this.T_HAUT;
    if (t < this.T_DESCENTE) { const k = t / this.T_DESCENTE; return lerp(this.HAUT, 0, k * k); } t -= this.T_DESCENTE;
    if (t < this.T_BAS) return 0; t -= this.T_BAS;
    const k2 = clamp(t / this.T_REMONTEE, 0, 1); return lerp(0, this.HAUT, 1 - (1 - k2) * (1 - k2));
  }
  update(dt) {
    if (this.fini) return;
    this.t += dt; const p = this.c.joueur;
    for (let i = 0; i < this.blocs.length; i++) {
      const h = this.hauteur((this.t + i * 1.07) % this.PERIODE), c = this.centres[i];
      this.blocs[i].position.set(c[0], h + 0.6, c[1]);
      if (h < 1.9 && Math.abs(p.x - c[0]) < 1.05 + 0.3 && Math.abs(p.z - c[1]) < 1.0 + 0.3) { this.tuer('Écrasé !'); return; }
    }
  }
}

/* ---------- caméra de surveillance ---------- */
class PiegeSurveillance extends Piege {
  constructor(ctx, pos, cap, periode) {
    super(ctx); this.x = pos[0]; this.z = pos[1]; this.cap = cap; this.periode = periode; this.t = 0; this.expo = 0;
    this.AMP = rad(75); this.DEMI = rad(18); this.PORTEE = 24; this.DUREE = 0.4; this.NB = 28;
    const tete = new THREE.Group(); tete.position.set(this.x, 2.3, this.z); ctx.group.add(tete); this.tete = tete;
    const corps = new THREE.Mesh(UNIT_BOX, stdMat([0.15, 0.16, 0.18], 0.4)); corps.scale.set(0.5, 0.4, 0.7); corps.castShadow = true; tete.add(corps);
    const oeil = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), stdMat([1, 0.1, 0.1], 0.3, 0, { emissive: mkCol([1, 0.1, 0.1]) })); oeil.position.z = -0.4; tete.add(oeil);
    this.geo = new THREE.BufferGeometry(); this.arr = new Float32Array(this.NB * 9); this.geo.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    this.matF = new THREE.MeshBasicMaterial({ color: mkCol([1, 0.9, 0.2]), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const f = new THREE.Mesh(this.geo, this.matF); f.frustumCulled = false; ctx.group.add(f);
  }
  update(dt) {
    if (this.fini) return;
    this.t += dt; const angle = this.cap + this.AMP * Math.sin(TAU * this.t / this.periode), boxes = this.c.boxes, p = this.c.joueur;
    this.tete.rotation.y = angle + Math.PI;
    /* faisceau : rayons arrêtés par les murs et les piliers */
    const pts = [];
    for (let i = 0; i <= this.NB; i++) {
      const a = angle - this.DEMI + 2 * this.DEMI * i / this.NB, dx = Math.sin(a), dz = Math.cos(a);
      const dist = Math.min(this.PORTEE, rayBoxes(boxes, this.x, this.z, dx, dz, this.PORTEE, 1.0));
      pts.push([this.x + dx * dist, this.z + dz * dist]);
    }
    let k = 0; const A = this.arr;
    for (let i = 0; i < this.NB; i++) {
      A[k++] = this.x; A[k++] = 0.06; A[k++] = this.z;
      A[k++] = pts[i][0]; A[k++] = 0.06; A[k++] = pts[i][1];
      A[k++] = pts[i + 1][0]; A[k++] = 0.06; A[k++] = pts[i + 1][1];
    }
    this.geo.attributes.position.needsUpdate = true;
    /* le joueur est-il vu ? */
    let vu = false; const vx = p.x - this.x, vz = p.z - this.z, len = Math.hypot(vx, vz);
    if (len <= this.PORTEE && len >= 0.01 && Math.abs(angleDiff(angle, Math.atan2(vx, vz))) <= this.DEMI) {
      for (const h of [1.0, 1.75]) if (rayBoxes(boxes, this.x, this.z, vx / len, vz / len, len, h) === Infinity) { vu = true; break; }
    }
    this.expo = vu ? this.expo + dt : Math.max(0, this.expo - dt * 2);
    const kk = clamp(this.expo / this.DUREE, 0, 1);
    this.matF.color.copy(mkCol([1.0, 0.9 - 0.75 * kk, 0.2 * (1 - kk)])); this.matF.opacity = 0.30 + 0.30 * kk;
    if (this.expo >= this.DUREE) this.tuer('Repéré par la caméra !');
  }
}

/* ---------- salle des lasers (niveau 10) ---------- */
class PiegeSalleLasers extends Piege {
  constructor(ctx, salle) {
    super(ctx); this.lmin = salle.limites[0]; this.lmax = salle.limites[1]; this.piliers = salle.piliers; this.t = 0; this.u = [];
    this.HF = 1.0; this.RAYON = 0.5; this.T_VISEE = 0.9; this.T_VERROU = 0.35; this.T_TIR = 0.4; this.T_REPOS = 1.6; this.GRACE = 0.25;
    const matF = basicMat([1.0, 0.12, 0.2]);
    for (const e of salle.emetteurs) {
      const tete = new THREE.Group(); tete.position.set(e.pos[0], this.HF - 2.18, e.pos[1]); ctx.group.add(tete);
      if (ctx.assets.poste) tete.add(ombres(ctx.assets.poste.scene.clone(true)));
      else { const m = new THREE.Mesh(UNIT_BOX, stdMat([0.95, 0.72, 0.06], 0.55)); m.scale.set(0.36, 0.36, 0.36); m.position.y = 2.18; tete.add(m); }
      const matL = new THREE.MeshBasicMaterial({ color: mkCol([0.2, 1, 0.3]) });
      const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), matL); lampe.position.y = 2.55; tete.add(lampe);
      const f = new THREE.Mesh(UNIT_BOX, matF); f.visible = false; ctx.group.add(f);
      this.u.push({ o: e.pos, cap: e.cap, champ: e.amp, dir: [Math.sin(e.cap), Math.cos(e.cap)], tete, f, matL, etat: 0, t: 0, perdu: 0 });
    }
  }
  longueur(o, d) {
    let t = 1e9;
    if (Math.abs(d[0]) > 1e-6) t = Math.min(t, ((d[0] > 0 ? this.lmax : this.lmin) - o[0]) / d[0]);
    if (Math.abs(d[1]) > 1e-6) t = Math.min(t, ((d[1] > 0 ? this.lmax : this.lmin) - o[1]) / d[1]);
    for (const c of this.piliers) {
      let tmin = -1e9, tmax = 1e9, touche = true;
      for (let axe = 0; axe < 2; axe++) {
        const oa = o[axe], da = d[axe], ca = c[axe];
        if (Math.abs(da) < 1e-6) { if (Math.abs(oa - ca) > DEMI_PILIER) { touche = false; break; } }
        else { let t1 = (ca - DEMI_PILIER - oa) / da, t2 = (ca + DEMI_PILIER - oa) / da; if (t1 > t2) { const x = t1; t1 = t2; t2 = x; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
      }
      if (touche && tmin <= tmax && tmax > 0) t = Math.min(t, Math.max(tmin, 0));
    }
    return Math.max(t, 0.1);
  }
  voit(u, p, dans) {
    if (!dans) return false;
    const vx = p[0] - u.o[0], vz = p[1] - u.o[1], dist = Math.hypot(vx, vz);
    if (dist < 0.3) return false;
    const dp = [vx / dist, vz / dist];
    if (Math.abs(angleDiff(u.cap, Math.atan2(dp[0], dp[1]))) > u.champ) return false;
    return this.longueur(u.o, dp) >= dist - 0.3;
  }
  maj(u, p, dans, dt) {
    const o = u.o; let t = u.t + dt;
    const norm = () => { const vx = p[0] - o[0], vz = p[1] - o[1], l = Math.hypot(vx, vz) || 1; return [vx / l, vz / l]; };
    switch (u.etat) {
      case 0: if (this.voit(u, p, dans)) { u.etat = 1; t = 0; u.perdu = 0; u.dir = norm(); } break;
      case 1:
        if (this.voit(u, p, dans)) { u.perdu = 0; u.dir = norm(); }
        else { u.perdu += dt; if (u.perdu > this.GRACE) { u.etat = 0; t = 0; } }
        if (u.etat === 1 && t >= this.T_VISEE) { u.etat = 2; t = 0; } break;
      case 2: if (t >= this.T_VERROU) { u.etat = 3; t = 0; } break;
      case 3: {
        const lg = this.longueur(o, u.dir), s = clamp((p[0] - o[0]) * u.dir[0] + (p[1] - o[1]) * u.dir[1], 0, lg);
        if (Math.hypot(p[0] - (o[0] + u.dir[0] * s), p[1] - (o[1] + u.dir[1] * s)) < this.RAYON) { this.tuer('Repéré par un laser ! Cache-toi derrière un pilier.'); return; }
        if (t >= this.T_TIR) { u.etat = 4; t = 0; } break;
      }
      case 4: if (t >= this.T_REPOS) { u.etat = 0; t = 0; } break;
    }
    u.t = t;
  }
  afficher(u) {
    const o = u.o; let dv = u.dir;
    if (u.etat === 0 || u.etat === 4) { const a = u.cap + 0.35 * Math.sin(this.t * 0.9 + o[0]); dv = [Math.sin(a), Math.cos(a)]; }
    u.tete.rotation.y = Math.atan2(-dv[1], dv[0]);
    let col = [0.2, 1, 0.3], vis = false, ep = 0.7;
    switch (u.etat) {
      case 1: col = [1, 0.65, 0.1]; vis = true; break;
      case 2: col = [1, 0.1, 0.15]; vis = Math.sin(this.t * 40) > -0.2; ep = 1.0; break;
      case 3: col = [1, 0.1, 0.15]; vis = true; ep = 1.8; break;
      case 4: col = [0.35, 0.35, 0.38]; break;
    }
    u.matL.color.copy(mkCol(col)); u.f.visible = vis;
    if (vis) {
      const lg = this.longueur(o, dv);
      u.f.position.set(o[0] + dv[0] * lg * 0.5, this.HF, o[1] + dv[1] * lg * 0.5);
      u.f.scale.set(lg, 0.1 * ep, 0.1 * ep); u.f.rotation.y = Math.atan2(-dv[1], dv[0]);
    }
  }
  update(dt) {
    if (this.fini) return;
    this.t += dt; const j = this.c.joueur, p = [j.x, j.z];
    const dans = p[0] > this.lmin && p[0] < this.lmax && p[1] > this.lmin && p[1] < this.lmax;
    for (const u of this.u) { this.maj(u, p, dans, dt); if (this.fini) return; this.afficher(u); }
  }
}

/* ---------- outils pour la grue et le garage : position du joueur le long de la « route » ---------- */
function projeterRoute(pts, cum, px, pz, axeDefaut) {
  let m = { ecart: Infinity, reste: 0, tx: axeDefaut[0], tz: axeDefaut[1] };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], abx = pts[i + 1][0] - a[0], abz = pts[i + 1][1] - a[1], l2 = abx * abx + abz * abz, L = Math.sqrt(l2);
    const t = clamp(((px - a[0]) * abx + (pz - a[1]) * abz) / l2, 0, 1);
    const ecart = Math.hypot(px - (a[0] + abx * t), pz - (a[1] + abz * t));
    if (ecart < m.ecart) m = { ecart, reste: cum[cum.length - 1] - (cum[i] + t * L), tx: abx / L, tz: abz / L };
  }
  return m;
}
function routeDepuis(lvl, prefixe, finPt, sansDefaut) {
  const keys = Object.keys(lvl.markers).filter(k => k.startsWith(prefixe)).sort();
  const pts = keys.map(k => [lvl.markers[k][0], lvl.markers[k][2]]);
  pts.push(finPt);
  const cum = [0]; let tot = 0; for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(tot); }
  return { pts, cum };
}

/* ---------- grue + palette ---------- */
class PiegeGrue extends Piege {
  constructor(ctx, indice) {
    super(ctx); const lvl = ctx.lvl, mk = lvl.markers;
    this.T_ALERTE = 0.8; this.GRAV = 18; this.T_SOL = 0.9; this.T_REM = 1.6; this.PORTEE = 14; this.VMIN = 0.8; this.HJ = 1.95; this.DA = 1.0; this.DT = 1.3; this.CABLE = 1.2;
    this.chute = 2.784; this.etat = 0; this.decalage = 0; this.tt = 0;
    const imp = mk['Grue_Impact_' + indice], app = mk['Grue_Approche_' + indice];
    if (!imp || !app) { this.fini = true; return; }
    this.impact = [imp[0], imp[2]];
    const r = routeDepuis(lvl, 'Grue_Route_' + indice + '_', this.impact); this.pts = r.pts; this.cum = r.cum;
    if (this.pts.length === 1) { this.pts.unshift([app[0], app[2]]); this.cum = [0, Math.hypot(this.pts[1][0] - this.pts[0][0], this.pts[1][1] - this.pts[0][1])]; }
    const a = this.pts[this.pts.length - 2], b = this.pts[this.pts.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    this.axe = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; this.perp = [-this.axe[1], this.axe[0]];
    this.crochets = lvl.find('Hook' + indice); this.posCrochets = this.crochets.map(n => n.position.clone());
    this.cables = lvl.find('Cable' + indice);
    this.tImpact = this.T_ALERTE + Math.sqrt(2 * this.chute / this.GRAV);
  }
  appliquer(sx, sz) {
    this.crochets.forEach((n, i) => n.position.set(this.posCrochets[i].x + (sx || 0), this.posCrochets[i].y - this.decalage, this.posCrochets[i].z + (sz || 0)));
    this.cables.forEach(c => c.scale.y = (this.CABLE + this.decalage) / this.CABLE);
  }
  update(dt) {
    if (this.fini) return; const j = this.c.joueur;
    switch (this.etat) {
      case 0: {
        const pr = projeterRoute(this.pts, this.cum, j.x, j.z, this.axe);
        if (pr.ecart > 1.6 || pr.reste <= 0 || pr.reste > this.PORTEE) return;
        const v = Math.hypot(j.vx, j.vz);
        if (v < this.VMIN || (j.vx / v * pr.tx + j.vz / v * pr.tz) < 0.5) return;
        if (pr.reste / v <= this.tImpact) { this.etat = 1; this.tt = 0; }
        break;
      }
      case 1: {
        this.tt += dt; const s = Math.sin(this.tt * 60) * 0.04 * (0.4 + 0.6 * this.tt / this.T_ALERTE); this.appliquer(s, s * 0.7);
        if (this.tt >= this.T_ALERTE) { this.etat = 2; this.tt = 0; } break;
      }
      case 2: {
        this.tt += dt; this.decalage = Math.min(0.5 * this.GRAV * this.tt * this.tt, this.chute); this.appliquer();
        if (this.chute - this.decalage < this.HJ) {
          const rx = j.x - this.impact[0], rz = j.z - this.impact[1];
          if (Math.abs(rx * this.axe[0] + rz * this.axe[1]) < this.DA && Math.abs(rx * this.perp[0] + rz * this.perp[1]) < this.DT) { this.tuer('Écrasé par la palette !'); return; }
        }
        if (this.decalage >= this.chute && !this.fini) { this.etat = 3; this.tt = 0; } break;
      }
      case 3: this.tt += dt; if (this.tt >= this.T_SOL) { this.etat = 4; this.tt = 0; } break;
      case 4: {
        this.tt += dt; this.decalage = this.chute * (1 - smoothstep(0, 1, this.tt / this.T_REM)); this.appliquer();
        if (this.tt >= this.T_REM) { this.decalage = 0; this.appliquer(); this.etat = 0; } break;
      }
    }
  }
}

/* ---------- garage : 3 chariots lancés en travers du couloir ---------- */
class PiegeGarage extends Piege {
  constructor(ctx, indice) {
    super(ctx); const lvl = ctx.lvl, mk = lvl.markers;
    this.T_ALERTE = 0.6; this.T_OUV = 0.6; this.ECART = 0.55; this.V = 9; this.T_FERM = 0.7; this.PROF = 0.65; this.LARG = 2.8; this.COURSE = 2.95;
    this.DAV = 0.9; this.DCO = 0.7; this.ORDRE = [1, 0, 2]; this.PORTEE = 14; this.VMIN = 0.8;
    this.etat = 0; this.tt = 0; this.dist = [-1, -1, -1];
    const porte = mk['Garage_Porte_' + indice], impact = mk['Garage_Impact_' + indice];
    if (!porte || !impact) { this.fini = true; return; }
    this.porte = [porte[0], porte[2]]; const centre = [impact[0], impact[2]];
    const dx = centre[0] - this.porte[0], dz = centre[1] - this.porte[1], l = Math.hypot(dx, dz);
    this.f = [dx / l, dz / l]; this.perp = [-this.f[1], this.f[0]];
    const r = routeDepuis(lvl, 'Garage_Route_' + indice + '_', centre); this.pts = r.pts; this.cum = r.cum;
    if (this.pts.length === 1) { this.pts.unshift([centre[0] - this.f[0] * 6, centre[1] - this.f[1] * 6]); this.cum = [0, 6]; }
    this.volets = lvl.find('Volet' + indice); this.voletsPos = this.volets.map(n => n.position.clone());
    this.chariots = [0, 1, 2].map(i => lvl.find('Troll' + (i + 1))); this.chPos = this.chariots.map(a => a.map(n => n.position.clone()));
    this.centres = this.chariots.map((a, i) => a.length ? [this.chPos[i][0].x, this.chPos[i][0].z] : [0, 0]);
  }
  placerVolet(v, sec) {
    this.volets.forEach((n, i) => { n.scale.y = Math.max(1 - v, 0.03); n.position.set(this.voletsPos[i].x + this.perp[0] * (sec || 0), this.voletsPos[i].y, this.voletsPos[i].z + this.perp[1] * (sec || 0)); });
  }
  reinit() {
    this.placerVolet(0);
    for (let i = 0; i < 3; i++) { this.dist[i] = -1; this.chariots[i].forEach((n, k) => { n.position.copy(this.chPos[i][k]); n.visible = true; }); }
    this.etat = 0;
  }
  update(dt) {
    if (this.fini) return; const j = this.c.joueur;
    if (this.etat === 0) {
      const pr = projeterRoute(this.pts, this.cum, j.x, j.z, this.perp);
      if (pr.ecart > 1.6 || pr.reste <= 0 || pr.reste > this.PORTEE) return;
      const v = Math.hypot(j.vx, j.vz);
      if (v < this.VMIN || (j.vx / v * pr.tx + j.vz / v * pr.tz) < 0.5) return;
      const devant = clamp((j.x - this.porte[0]) * this.f[0] + (j.z - this.porte[1]) * this.f[1], 0, this.LARG);
      if (pr.reste / v <= this.T_ALERTE + this.T_OUV + (this.PROF + devant) / this.V) { this.etat = 1; this.tt = 0; }
      return;
    }
    this.tt += dt;
    switch (this.etat) {
      case 1: this.placerVolet(0, Math.sin(this.tt * 70) * 0.025 * (0.5 + this.tt / this.T_ALERTE)); if (this.tt >= this.T_ALERTE) { this.etat = 2; this.tt = 0; } break;
      case 2: this.placerVolet(smoothstep(0, 1, this.tt / this.T_OUV)); if (this.tt >= this.T_OUV) { this.placerVolet(1); this.etat = 3; this.tt = 0; } break;
      case 3: {
        for (let jj = 0; jj < 3; jj++) {
          const i = this.ORDRE[jj], depuis = this.tt - jj * this.ECART; if (depuis < 0) continue;
          this.dist[i] = Math.min(this.V * depuis, this.COURSE);
          this.chariots[i].forEach((n, k) => { n.position.set(this.chPos[i][k].x + this.f[0] * this.dist[i], this.chPos[i][k].y, this.chPos[i][k].z + this.f[1] * this.dist[i]); n.visible = this.V * depuis < this.COURSE + 0.4; });
        }
        if (this.tt >= this.ECART * 2 + this.COURSE / this.V + 0.35) { this.etat = 4; this.tt = 0; }
        break;
      }
      case 4: this.placerVolet(1 - smoothstep(0, 1, this.tt / this.T_FERM)); if (this.tt >= this.T_FERM) this.reinit(); break;
    }
    if (this.etat === 3) {
      for (let i = 0; i < 3; i++) {
        if (this.dist[i] < 0 || this.dist[i] >= this.COURSE) continue;
        const cx = this.centres[i][0] + this.f[0] * this.dist[i], cz = this.centres[i][1] + this.f[1] * this.dist[i];
        const rx = j.x - cx, rz = j.z - cz;
        if (Math.abs(rx * this.f[0] + rz * this.f[1]) < this.DAV && Math.abs(rx * this.perp[0] + rz * this.perp[1]) < this.DCO) { this.tuer('Écrasé par un chariot !'); return; }
      }
    }
  }
}
