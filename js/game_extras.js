'use strict';
/* ===== Extras : tonneaux qui roulent, portes + interrupteurs, barrières laser, interrupteurs piégés ===== */
const COUL_PORTES = [[0.95, 0.25, 0.20], [0.20, 0.55, 1.00], [0.20, 0.85, 0.35], [0.80, 0.40, 1.00]];
const NOM_PORTE = ['rouge', 'bleue', 'verte', 'violette'];
const NOM_INTER = ['rouge', 'bleu', 'vert', 'violet'];

/* ---------- tonneaux : un distributeur lâche des tonneaux qui roulent sur la voie gauche OU droite du couloir ---------- */
class PiegeTonneaux extends Piege {
  constructor(ctx, liste) {
    super(ctx); this.t = 0; this.runs = []; this.actifs = [];
    this.RAYON = 0.55; this.VOIE = 0.8; this.HIT = 0.9; this.T_CHUTE = 0.35; this.T_COULE = 0.45; this.DIST_SPAWN = 3.4;
    this.geoCorps = new THREE.CylinderGeometry(0.55, 0.55, 0.95, 20);
    this.geoBande = new THREE.CylinderGeometry(0.575, 0.575, 0.07, 20);
    this.mBois = stdMat([0.78, 0.27, 0.24], 0.6); this.mAcier = stdMat([0.62, 0.66, 0.72], 0.35, 0.6); this.mJaune = stdMat([0.96, 0.78, 0.14], 0.6);
    const noir = stdMat([0.07, 0.07, 0.08], 0.6);
    for (const t of liste) {
      const dx = t.dir[0], dz = t.dir[1], rot = Math.atan2(-dz, dx), L = Math.hypot(t.fin[0] - t.pos[0], t.fin[1] - t.pos[1]);
      const run = { x: t.pos[0], z: t.pos[1], dx, dz, px: -dz, pz: dx, L, rot, v: t.vitesse, periode: t.periode, motif: t.motif, k: 0, cd: 0.8 + (t.phase || 0),
        rafale: !!t.rafale, file: [], pool: [], flash: 0, matLampe: new THREE.MeshBasicMaterial({ color: mkCol([0.2, 1, 0.3]) }), group: ctx.group };
      /* bande de danger sur toute la zone + grille d'évacuation au bout */
      const tex = textureHazard(0.22); tex.repeat.set(L / 2.2, 1.1);
      const bande = planSol(L + 1.4, 2.4, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      bande.position.set(t.pos[0] + dx * L / 2, 0.02, t.pos[1] + dz * L / 2); bande.rotation.y = rot; ctx.group.add(bande);
      const grille = planSol(1.8, 2.4, basicMat([0.04, 0.04, 0.06]));
      grille.position.set(t.pos[0] + dx * L, 0.03, t.pos[1] + dz * L); grille.rotation.y = rot; ctx.group.add(grille);
      /* distributeur au-dessus du couloir */
      const dist = new THREE.Group(); dist.position.set(t.pos[0], 0, t.pos[1]); dist.rotation.y = rot; ctx.group.add(dist);
      const tr = new THREE.Mesh(UNIT_BOX, this.mJaune); tr.scale.set(1.9, 0.5, 1.9); tr.position.y = 3.6; tr.castShadow = true; dist.add(tr);
      const dessous = new THREE.Mesh(UNIT_BOX, noir); dessous.scale.set(1.5, 0.12, 1.5); dessous.position.y = 3.3; dist.add(dessous);
      const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), run.matLampe); lampe.position.y = 3.12; dist.add(lampe);
      for (const cote of [-1, 1]) { const po = new THREE.Mesh(UNIT_BOX, this.mAcier); po.scale.set(0.15, 3.4, 0.15); po.position.set(0, 1.7, cote * 1.3); po.castShadow = true; dist.add(po); }
      this.runs.push(run);
    }
  }
  creerBaril(run) {
    const g = new THREE.Group(), roul = new THREE.Group(); g.add(roul);
    const corps = new THREE.Mesh(this.geoCorps, this.mBois); corps.rotation.x = Math.PI / 2; corps.castShadow = true; corps.receiveShadow = true; roul.add(corps);
    for (const z of [-0.32, 0.32]) { const b = new THREE.Mesh(this.geoBande, this.mAcier); b.rotation.x = Math.PI / 2; b.position.z = z; b.castShadow = true; roul.add(b); }
    for (let k = 0; k < 3; k++) {   // nervures jaunes : on voit le tonneau tourner
      const a = k * TAU / 3, r = new THREE.Mesh(UNIT_BOX, this.mJaune); r.scale.set(0.16, 0.06, 0.5);
      r.position.set(Math.sin(a) * 0.56, Math.cos(a) * 0.56, 0); r.rotation.z = -a; roul.add(r);
    }
    g.rotation.y = run.rot; g.visible = false; run.group.add(g);
    return { r: run, g, roul, lane: 1, s: 0, t: 0, etat: 0 };
  }
  lancer(r, lane) {
    let b = r.pool.pop(); if (!b) b = this.creerBaril(r);
    b.lane = lane; b.s = 0; b.t = 0; b.etat = 0; b.g.visible = true; b.roul.rotation.z = 0;
    b.g.position.set(r.x + r.px * lane * this.VOIE, 3.75, r.z + r.pz * lane * this.VOIE);
    this.actifs.push(b); r.flash = 0.2;
  }
  update(dt) {
    if (this.fini) return;
    this.t += dt; const p = this.c.joueur;
    for (const r of this.runs) {
      r.cd -= dt; r.flash = Math.max(0, r.flash - dt);
      for (const q of r.file) q.t -= dt;
      for (let i = r.file.length - 1; i >= 0; i--) if (r.file[i].t <= 0) { const q = r.file[i]; r.file.splice(i, 1); if (Math.hypot(p.x - r.x, p.z - r.z) >= this.DIST_SPAWN) this.lancer(r, q.lane); }
      if (r.cd <= 0) {
        if (Math.hypot(p.x - r.x, p.z - r.z) < this.DIST_SPAWN) r.cd = 0.3;   // jamais de tonneau qui tombe sur le joueur
        else { const lane = r.motif[r.k % r.motif.length]; r.k++; this.lancer(r, lane); if (r.rafale) r.file.push({ t: 0.75, lane: -lane }); r.cd = r.periode; }
      }
      r.matLampe.color.copy(mkCol(r.flash > 0 ? [1, 0.1, 0.15] : r.cd < 0.6 ? [1, 0.65, 0.1] : [0.2, 1, 0.3]));
    }
    for (let i = this.actifs.length - 1; i >= 0; i--) {
      const b = this.actifs[i], r = b.r; b.t += dt;
      if (b.etat === 0) {   // chute depuis le distributeur
        const k = Math.min(b.t / this.T_CHUTE, 1);
        b.g.position.y = 0.55 + 3.2 * (1 - k * k);
        if (k >= 1) { b.etat = 1; b.s = 0; }
      } else if (b.etat === 1) {   // il roule
        b.s += r.v * dt;
        const bx = r.x + r.dx * b.s + r.px * b.lane * this.VOIE, bz = r.z + r.dz * b.s + r.pz * b.lane * this.VOIE;
        b.g.position.set(bx, 0.55, bz); b.roul.rotation.z = -b.s / this.RAYON;
        if ((p.x - bx) * (p.x - bx) + (p.z - bz) * (p.z - bz) < this.HIT * this.HIT) { this.tuer('Écrasé par un tonneau ! Reste sur la voie libre.'); return; }
        if (b.s >= r.L) { b.etat = 2; b.t = 0; }
      } else {   // il tombe dans la grille
        const k = Math.min(b.t / this.T_COULE, 1); b.g.position.y = 0.55 - 1.4 * k;
        if (k >= 1) { b.g.visible = false; this.actifs.splice(i, 1); r.pool.push(b); }
      }
    }
  }
}

/* ---------- portes verrouillées (mur ou barrière laser), interrupteurs, interrupteurs piégés ---------- */
class PiegePortes extends Piege {
  constructor(ctx, portes, inters) {
    super(ctx); this.t = 0; this.portes = []; this.inters = [];
    const gris = stdMat([0.30, 0.33, 0.38], 0.5, 0.4), noir = stdMat([0.07, 0.07, 0.08], 0.6), jaune = stdMat([0.95, 0.72, 0.06], 0.55), matF = basicMat([1.0, 0.12, 0.2]);
    portes.forEach((p, idx) => {
      const col = COUL_PORTES[p.couleur % 4], rot = Math.atan2(-p.dir[1], p.dir[0]);
      const gr = new THREE.Group(); gr.position.set(p.pos[0], 0, p.pos[1]); gr.rotation.y = rot; ctx.group.add(gr);
      const o = { idx, mode: p.mode, couleur: p.couleur % 4, gr, x: p.pos[0], z: p.pos[1], dx: p.dir[0], dz: p.dir[1], px: -p.dir[1], pz: p.dir[0], ouverte: false, prog: 0, vu: false, box: null, beams: [], lampes: [] };
      const matCol = stdMat(col, 0.5, 0, { emissive: mkCol(col), emissiveIntensity: 1.0 });
      if (p.mode === 'laser') {
        for (const h of [0.35, 1.0, 1.7]) { const f = new THREE.Mesh(UNIT_BOX, matF); f.scale.set(0.09, 0.09, 2.6); f.position.y = h; gr.add(f); o.beams.push(f); }
        for (const cote of [-1, 1]) {
          const po = new THREE.Mesh(UNIT_BOX, jaune); po.scale.set(0.3, 2.1, 0.3); po.position.set(0, 1.05, cote * 1.35); po.castShadow = true; gr.add(po);
          const matL = new THREE.MeshBasicMaterial({ color: mkCol(col) }), l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), matL); l.position.set(0, 2.4, cote * 1.35); gr.add(l); o.lampes.push(matL);
        }
      } else {
        const dalle = new THREE.Mesh(UNIT_BOX, gris); dalle.scale.set(0.5, 3.0, 2.8); dalle.position.y = 1.5; dalle.castShadow = true; dalle.receiveShadow = true; gr.add(dalle);
        const bande = new THREE.Mesh(UNIT_BOX, matCol); bande.scale.set(0.56, 0.5, 2.86); bande.position.y = 2.4; gr.add(bande);
        const bas = new THREE.Mesh(UNIT_BOX, noir); bas.scale.set(0.56, 0.35, 2.86); bas.position.y = 0.18; gr.add(bas);
        const alongX = Math.abs(p.dir[0]) > 0.5;
        o.box = alongX ? { x0: p.pos[0] - 0.3, x1: p.pos[0] + 0.3, z0: p.pos[1] - 1.4, z1: p.pos[1] + 1.4, h: 3.0 } : { x0: p.pos[0] - 1.4, x1: p.pos[0] + 1.4, z0: p.pos[1] - 0.3, z1: p.pos[1] + 0.3, h: 3.0 };
        ctx.boxes.push(o.box);
      }
      this.portes.push(o);
    });
    inters.forEach((s, idx) => {
      const leurre = !!s.leurre, col = leurre ? [0.9, 0.12, 0.08] : COUL_PORTES[s.couleur % 4];
      const gr = new THREE.Group(); gr.position.set(s.pos[0], 0, s.pos[1]); ctx.group.add(gr);
      const matBase = leurre ? new THREE.MeshBasicMaterial({ map: textureHazard(1) }) : stdMat(dark(col, 0.55), 0.6, 0, { emissive: mkCol(col), emissiveIntensity: 0.5 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 28), matBase); base.position.y = 0.05; base.receiveShadow = true; gr.add(base);
      const matB = stdMat(col, 0.4, 0, { emissive: mkCol(col), emissiveIntensity: 1.2 });
      const bouton = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.25, 24), matB); bouton.position.y = 0.22; bouton.castShadow = true; gr.add(bouton);
      let rayon = null;
      if (!leurre) { rayon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 12), new THREE.MeshBasicMaterial({ color: mkCol(col), transparent: true, opacity: 0.35, depthWrite: false })); rayon.position.y = 1.3; gr.add(rayon); }
      this.inters.push({ idx, porte: s.porte, couleur: (s.couleur || 0) % 4, leurre, gr, bouton, matB, rayon, x: s.pos[0], z: s.pos[1], actif: false });
    });
  }
  ouvrir(o) {
    o.ouverte = true; o.prog = 0;
    o.beams.forEach(f => { f.visible = false; });
    o.lampes.forEach(m => m.color.copy(mkCol([0.2, 1, 0.3])));
  }
  update(dt) {
    if (this.fini) return;
    this.t += dt; const p = this.c.joueur;
    for (const s of this.inters) {
      if (s.leurre) s.matB.emissiveIntensity = 0.8 + 0.8 * Math.sin(this.t * 9);
      if (s.actif || Math.hypot(p.x - s.x, p.z - s.z) >= 0.95) continue;
      if (s.leurre) { this.tuer('Interrupteur piégé ! Méfie-toi des interrupteurs noir et jaune.'); return; }
      s.actif = true; s.bouton.position.y = 0.1; s.matB.emissiveIntensity = 0.1; if (s.rayon) s.rayon.visible = false;
      const o = this.portes[s.porte];
      if (o && !o.ouverte) { this.ouvrir(o); afficherAstuce('Interrupteur ' + NOM_INTER[s.couleur] + ' activé : ' + (o.mode === 'laser' ? 'la barrière laser est coupée !' : 'la porte s\'ouvre !')); }
    }
    for (const o of this.portes) {
      if (!o.ouverte) {
        if (!o.vu && Math.hypot(p.x - o.x, p.z - o.z) < 6) {
          o.vu = true;
          afficherAstuce(o.mode === 'laser' ? 'Barrière laser ' + NOM_PORTE[o.couleur] + ' : seul l\'interrupteur ' + NOM_INTER[o.couleur] + ' peut la couper. Cherche un cul-de-sac.'
            : 'Porte ' + NOM_PORTE[o.couleur] + ' verrouillée : trouve l\'interrupteur ' + NOM_INTER[o.couleur] + ' dans un cul-de-sac.');
        }
        if (o.mode === 'laser') {
          const rx = p.x - o.x, rz = p.z - o.z;
          if (Math.abs(rx * o.dx + rz * o.dz) < 0.4 && Math.abs(rx * o.px + rz * o.pz) < 1.45) { this.tuer('Grillé par la barrière laser !'); return; }
        }
      } else if (o.prog < 1 && o.mode !== 'laser') {
        o.prog = Math.min(1, o.prog + dt / 0.7); const k = smoothstep(0, 1, o.prog);
        o.gr.position.y = -3.2 * k;
        if (k > 0.45 && o.box) { const i = this.c.boxes.indexOf(o.box); if (i >= 0) this.c.boxes.splice(i, 1); o.box = null; }
      }
    }
  }
}
