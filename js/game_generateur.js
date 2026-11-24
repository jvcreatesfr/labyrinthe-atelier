'use strict';
/* ===== Générateur des niveaux 11 à 100 (version 2 : plus dur, plus varié) =====
   Deux types de plan, tirés au sort selon le niveau :
   - « classique » : couloir direct (COURT, dangereux, avec la clé) + grand détour (LONG, plus sûr)
   - « serpentin » : vrai labyrinthe (couloirs longs et sinueux), un seul chemin, départ et arrivée à des endroits différents,
                     la clé est au fond du cul-de-sac le plus éloigné (et son accès est piégé)
   Difficulté croissante :
   - pièges classiques (piques, lasers, écraseurs, caméras) de plus en plus nombreux, rapprochés et rapides
   - TONNEAUX qui roulent dans les longs couloirs (deux voies : il faut se tenir du côté libre) dès le niveau 12, rafales dès le 55
   - PORTES verrouillées (mur ou barrière laser) à ouvrir avec un interrupteur de la même couleur caché dans un cul-de-sac :
     dès le niveau 14, jusqu'à 3 portes en chaîne (l'interrupteur n°2 est derrière la porte n°1...)
   - INTERRUPTEURS PIÉGÉS (noir et jaune) dès le niveau 38
   - une salle de lasers (piliers + détecteurs) tous les 4 niveaux à partir du niveau 14
   Tout est vérifié par tests/test_generateur.js (niveau faisable, interrupteurs atteignables dans l'ordre, etc.). */
(function (root) {
  const CELL = 2.8, NB_NIVEAUX = 100;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const clampv = (v, a, b) => Math.min(b, Math.max(a, v));
  const r2 = v => Math.round(v * 100) / 100 + 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /* dispositions de la salle des lasers : positions des projecteurs sur les murs (avant rotation/miroir), champ de vision, cachette de la clé */
  const SALLES_FACILES = [
    { champ: 65, cle: [2.8, 0.0], em: [[8.4, -9.55], [-9.55, -8.4], [8.4, 9.55]] },
    { champ: 55, cle: [-8.4, -8.4], em: [[5.6, -9.55], [9.55, -5.6], [-9.55, -2.8]] },
    { champ: 55, cle: [-8.4, 5.6], em: [[8.4, 9.55], [-9.55, -2.8], [9.55, -5.6]] },
    { champ: 55, cle: [-8.4, -5.6], em: [[2.8, -9.55], [9.55, -8.4], [-9.55, -2.8]] },
    { champ: 65, cle: [2.8, 0.0], em: [[-9.55, 0.0], [-2.8, -9.55], [8.4, 9.55]] },
    { champ: 65, cle: [5.6, 8.4], em: [[5.6, -9.55], [-9.55, -2.8], [9.55, -2.8]] },
  ];
  const SALLES_DURES = [
    { champ: 65, cle: [-8.4, -8.4], em: [[9.55, -5.6], [-2.8, 9.55], [-9.55, -2.8], [-2.8, -9.55]] },
    { champ: 65, cle: [-5.6, -8.4], em: [[5.6, 9.55], [-2.8, -9.55], [9.55, -2.8], [-9.55, -2.8]] },
    { champ: 60, cle: [-8.4, 2.8], em: [[9.55, 5.6], [5.6, -9.55], [0.0, 9.55], [-9.55, -2.8]] },
    { champ: 60, cle: [-8.4, 8.4], em: [[-9.55, 0.0], [8.4, -9.55], [9.55, -2.8], [-2.8, 9.55]] },
    { champ: 65, cle: [2.8, 5.6], em: [[-9.55, 8.4], [9.55, -8.4], [-8.4, -9.55], [-8.4, 9.55]] },
    { champ: 65, cle: [-2.8, -2.8], em: [[-9.55, -8.4], [8.4, 9.55], [-8.4, -9.55], [9.55, 8.4]] },
  ];

  function tailleNiveau(n) { return [25, 29, 33, 37, 41][clampv(Math.floor((n - 11) / 18), 0, 4)]; }
  function aSalle(n) { return n >= 14 && n % 4 === 2; }

  function genererNiveau(n) {
    const rng = mulberry32(90210 + n * 7919), ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const d = clampv((n - 10) / 90, 0, 1);
    const N = tailleNiveau(n), m = (N - 1) / 2, row = m + 1, salle = aSalle(n);
    const serp = !salle && n > 11 && rng() < (n < 20 ? 0.5 : 0.65);
    const mur = new Uint8Array(N * N).fill(1), I = (i, j) => j * N + i, K = (i, j) => i * 1000 + j;
    const ouvert = (i, j) => i >= 0 && j >= 0 && i < N && j < N && !mur[I(i, j)];
    const nbVoisins = (i, j) => DIRS.filter(([a, b]) => ouvert(i + a, j + b)).length;
    const squelette = new Set();
    const carve = (i, j) => { mur[I(i, j)] = 0; };
    const sk = (i, j) => { carve(i, j); squelette.add(K(i, j)); };
    const ligneH = (j, i0, i1) => { for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) sk(i, j); };
    const ligneV = (i, j0, j1) => { for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) sk(i, j); };
    const dansSalle = (i, j) => salle && Math.abs(i - m) <= 4 && Math.abs(j - m) <= 4;
    /* parcours en largeur : distances depuis des cases sources, en évitant éventuellement des cases bloquées (portes fermées) */
    function bfs(sources, bloques) {
      const dist = new Int32Array(N * N).fill(-1), par = new Int32Array(N * N).fill(-1), q = [];
      sources.forEach(([i, j]) => { dist[I(i, j)] = 0; q.push([i, j]); });
      for (let h = 0; h < q.length; h++) {
        const [i, j] = q[h];
        for (const [a, b] of DIRS) {
          const x = i + a, y = j + b;
          if (ouvert(x, y) && dist[I(x, y)] < 0 && !(bloques && bloques.has(K(x, y)))) { dist[I(x, y)] = dist[I(i, j)] + 1; par[I(x, y)] = I(i, j); q.push([x, y]); }
        }
      }
      return { dist, par };
    }

    let sc, ec, S = [], L = [], partage = new Set();
    if (!serp) {
      /* --- plan classique : couloir direct + détour par le haut + culs-de-sac par le bas --- */
      sc = [1, row]; ec = [N - 2, row];
      const k = ri(0, Math.min(3, Math.floor((m - 8) / 2)));
      const cw = m - 5 - 2 * k, ce = N - 1 - cw;
      const jtop = 1 + 2 * ri(0, 2), jbot = N - 2 - 2 * ri(0, 2);
      if (salle) {
        for (let i = m - 3; i <= m + 3; i++) for (let j = m - 3; j <= m + 3; j++) carve(i, j);
        ligneH(row, 1, m - 4); ligneH(row, m + 4, N - 2);
      } else ligneH(row, 1, N - 2);
      ligneV(cw, jtop, row); ligneH(jtop, cw, ce); ligneV(ce, jtop, row);
      ligneV(cw, row, jbot); ligneH(jbot, cw, ce); ligneV(ce, row, jbot);
      const gap = m + 2 * ri(-2, 2); mur[I(gap, jbot)] = 1; squelette.delete(K(gap, jbot));
      /* remplissage : branches et culs-de-sac (algorithme de Prim, pas de boucle) */
      const visite = new Set();
      for (let i = 1; i < N; i += 2) for (let j = 1; j < N; j += 2) if (!mur[I(i, j)] && !dansSalle(i, j)) visite.add(K(i, j));
      const front = [];
      const addF = (i, j) => { for (const [di, dj] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const a = i + di, b = j + dj; if (a >= 1 && a <= N - 2 && b >= 1 && b <= N - 2 && !visite.has(K(a, b)) && !dansSalle(a, b)) front.push([a, b, i + di / 2, j + dj / 2]); } };
      visite.forEach(c => addF(Math.floor(c / 1000), c % 1000));
      while (front.length) {
        const q = ri(0, front.length - 1), f = front[q]; front[q] = front[front.length - 1]; front.pop();
        if (visite.has(K(f[0], f[1]))) continue;
        visite.add(K(f[0], f[1])); carve(f[0], f[1]); carve(f[2], f[3]); addF(f[0], f[1]);
      }
      for (let i = 1; i <= N - 2; i++) S.push([i, row]);
      for (let i = 1; i <= cw; i++) L.push([i, row]);
      for (let j = row - 1; j >= jtop; j--) L.push([cw, j]);
      for (let i = cw + 1; i <= ce; i++) L.push([i, jtop]);
      for (let j = jtop + 1; j <= row; j++) L.push([ce, j]);
      for (let i = ce + 1; i <= N - 2; i++) L.push([i, row]);
      const cleS = new Set(S.map(c => K(c[0], c[1])));
      partage = new Set(L.filter(c => cleS.has(K(c[0], c[1]))).map(c => K(c[0], c[1])));
    } else {
      /* --- plan serpentin : labyrinthe parfait (un seul chemin), couloirs longs, départ et arrivée décalés --- */
      sc = [1, 1 + 2 * ri(0, m - 1)]; ec = [N - 2, 1 + 2 * ri(0, m - 1)];
      const pTout = 0.55 + 0.25 * d;   // plus on avance, plus les couloirs sont longs et droits
      const pile = [[sc[0], sc[1], 0, 0]]; carve(sc[0], sc[1]);
      while (pile.length) {
        const [i, j, pa, pb] = pile[pile.length - 1];
        const libres = DIRS.map(([a, b]) => [a * 2, b * 2]).filter(([a, b]) => { const x = i + a, y = j + b; return x >= 1 && x <= N - 2 && y >= 1 && y <= N - 2 && mur[I(x, y)]; });
        if (!libres.length) { pile.pop(); continue; }
        let ch = libres.find(([a, b]) => a === pa && b === pb);
        if (!ch || rng() > pTout) ch = libres[ri(0, libres.length - 1)];
        carve(i + ch[0] / 2, j + ch[1] / 2); carve(i + ch[0], j + ch[1]); pile.push([i + ch[0], j + ch[1], ch[0], ch[1]]);
      }
      const b0 = bfs([sc]);
      for (let id = I(ec[0], ec[1]); id >= 0; id = b0.par[id]) L.push([id % N, Math.floor(id / N)]);
      L.reverse(); L.forEach(c => squelette.add(K(c[0], c[1])));
    }
    const W = c => [r2((c[0] - m) * CELL), r2((c[1] - m) * CELL)];
    const dep = W(sc), arr = W(ec);

    /* --- culs-de-sac : les plus éloignés du couloir principal --- */
    const srcs = []; squelette.forEach(c => { const i = Math.floor(c / 1000), j = c % 1000; if (ouvert(i, j)) srcs.push([i, j]); });
    const ds = bfs(srcs);
    const feuilles = [];
    for (let i = 1; i <= N - 2; i++) for (let j = 1; j <= N - 2; j++) if (ouvert(i, j) && !squelette.has(K(i, j)) && !dansSalle(i, j) && nbVoisins(i, j) === 1) feuilles.push([i, j, ds.dist[I(i, j)]]);
    feuilles.sort((p, q) => q[2] - p[2]);
    /* serpentin : la clé est au fond du cul-de-sac le plus lointain, et le chemin pour y aller est piégé */
    let cleLeaf = null, branche = null;
    if (serp && feuilles.length) {
      cleLeaf = feuilles[0]; const ch = [];
      for (let id = I(cleLeaf[0], cleLeaf[1]); id >= 0; id = ds.par[id]) ch.push([id % N, Math.floor(id / N)]);
      branche = ch.reverse();
    }

    /* --- pièges --- */
    const sep = 5 - Math.floor(d * 2);
    const pieges = [], zones = new Set();
    const droit = (P, i) => { if (i <= 0 || i >= P.length - 1) return false; const a = P[i - 1], b = P[i], c = P[i + 1]; return (b[0] - a[0]) === (c[0] - b[0]) && (b[1] - a[1]) === (c[1] - b[1]); };
    function interdits(P, sansCroisements) {
      const f = new Set();
      P.forEach((c, i) => {
        if (pieges.some(t => Math.abs(t.c[0] - c[0]) + Math.abs(t.c[1] - c[1]) < 4)) f.add(i);
        if (partage.has(K(c[0], c[1]))) f.add(i);
        if (zones.has(K(c[0], c[1]))) f.add(i);
        if (salle && Math.abs(c[0] - m) <= 5) f.add(i);
        if (!sansCroisements && nbVoisins(c[0], c[1]) > 2) f.add(i);
        if (Math.hypot(c[0] - sc[0], c[1] - sc[1]) < 4 || Math.hypot(c[0] - ec[0], c[1] - ec[1]) < 4) f.add(i);
      });
      return f;
    }
    const manh = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    const zoneProche = c => { for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (Math.abs(a) + Math.abs(b) <= 2 && zones.has(K(c[0] + a, c[1] + b))) return true; return false; };
    function choisir(P, fb, lo, hi, cible, pris) {
      const cands = []; for (let i = lo; i <= hi; i++) cands.push(i);
      cands.sort((a, b) => Math.abs(a - cible) - Math.abs(b - cible));
      for (const i of cands) { if (fb.has(i) || pris.some(o => Math.abs(i - o) < sep) || !droit(P, i) || pieges.some(t => manh(t.c, P[i]) < 4) || zoneProche(P[i])) continue; return i; }
      return -1;
    }
    /* lignes droites d'un chemin : [indice de départ, indice de fin] */
    function runsDe(P) {
      const runs = []; let i = 1;
      while (i < P.length - 1) {
        const dv = [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]]; let j = i;
        while (j + 1 < P.length && P[j + 1][0] - P[j][0] === dv[0] && P[j + 1][1] - P[j][1] === dv[1]) j++;
        runs.push([i - 1, j]); i = j > i ? j + 1 : i + 1;
      }
      return runs;
    }
    /* caméra : posée au bout d'une ligne droite de 5 cases ou plus (le couloir peut avoir des embranchements : les murs bloquent le faisceau) */
    function camera(P, tag, fbc, pris) {
      const bons = runsDe(P).filter(r => {
        if (r[1] - r[0] < 4) return false;
        for (let q = Math.max(r[0], r[1] - 9); q <= r[1]; q++) if (fbc.has(q)) return false;
        return !pris.some(o => Math.abs(r[1] - o) < 6);
      });
      if (!bons.length) return null;
      const r = bons[ri(0, bons.length - 1)], a = P[r[0]], b = P[r[1]];
      const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]), w = W(b);
      const cap = Math.atan2(-dx, -dz), expose = Math.min((r[1] - r[0]) * CELL, 24) / 5.4;
      pieges.push({ c: b, type: "camera", pos: [r2(w[0] + dx * 1.05), r2(w[1] + dz * 1.05)], cap: Math.round(cap * 1000) / 1000, periode: Math.round(Math.max(10, 2 * (expose + 1.3)) * 10) / 10, chemin: tag === "S" ? "court" : "long" });
      pris.push(r[1]); return [Math.max(r[0], r[1] - 9) - 1, r[1] + 1];
    }
    /* tonneaux : un distributeur au-dessus du couloir lâche des tonneaux qui roulent vers le joueur (2 voies, il faut choisir la libre) */
    function tonneaux(P, tag, fbc, pris, cible) {
      const cands = [];
      for (const r of runsDe(P)) {
        let u = r[0];
        while (u <= r[1]) {
          if (fbc.has(u)) { u++; continue; }
          let v = u; while (v + 1 <= r[1] && !fbc.has(v + 1)) v++;
          if (v - u >= 9) { const b = v - 1, s = Math.max(u + 2, b - 10); cands.push([s, b]); }
          u = v + 1;
        }
      }
      const libres = cands.filter(([s, b]) => {
        if (pris.some(o => Math.abs((s + b) / 2 - o) < 12)) return false;
        for (let q = s; q <= b; q++) if (pieges.some(t => t.type !== "tonneaux" && manh(t.c, P[q]) < 4)) return false;
        return true;
      });
      if (!libres.length) return null;
      libres.sort((p, q) => Math.abs((p[0] + p[1]) / 2 - cible) - Math.abs((q[0] + q[1]) / 2 - cible));
      const [s, b] = libres[0], mid = Math.floor((s + b) / 2);
      const dd = [P[b][0] - P[s][0], P[b][1] - P[s][1]];
      const motif = []; let last = rng() < 0.5 ? -1 : 1; const nm = 4 + ri(0, 2);
      for (let q = 0; q < nm; q++) {
        let l = (d < 0.2 || rng() < 0.6) ? -last : last;
        if (motif.length >= 2 && motif[motif.length - 1] === l && motif[motif.length - 2] === l) l = -l;
        motif.push(l); last = l;
      }
      pieges.push({ c: P[mid], type: "tonneaux", pos: W(P[b]), fin: W(P[s]), dir: [-Math.sign(dd[0]) + 0, -Math.sign(dd[1]) + 0],
        periode: r2(2.5 - 1.1 * d), vitesse: r2(3.4 + 2.4 * d), motif, phase: r2(rng() * 2), rafale: n >= 55 && rng() < 0.5, chemin: tag === "S" ? "court" : "long" });
      for (let q = s; q <= b; q++) zones.add(K(P[q][0], P[q][1]));
      pris.push((s + b) / 2); return [s - 2, b + 2];
    }
    function placer(P, tag, types, fb, fbc0) {
      const kk = types.length; if (!kk) return;
      const cand = []; for (let i = 0; i < P.length; i++) if (!fb.has(i)) cand.push(i);
      if (!cand.length) return;
      const lo = cand[0], hi = cand[cand.length - 1], pris = [], marques = new Set();
      const marquer = (a, b) => { for (let q = a; q <= b; q++) { fb.add(q); marques.add(q); } };
      types.forEach((t, j) => {
        const a = lo + Math.floor((hi - lo) * j / kk), b = lo + Math.floor((hi - lo) * (j + 1) / kk);
        if (t === "tonneaux") {
          const fbc = new Set(fbc0); marques.forEach(x => fbc.add(x));
          const zone = tonneaux(P, tag, fbc, pris, (a + b) / 2); if (zone) { marquer(zone[0], zone[1]); return; }
          t = "laser";
        }
        if (t === "camera") {
          if (tag === "L") { const fbc = new Set(fbc0); marques.forEach(x => fbc.add(x)); const zone = camera(P, tag, fbc, pris); if (zone) { marquer(zone[0], zone[1]); return; } }
          t = "laser";
        }
        const fb2 = new Set(fb); for (let q = 0; q < a; q++) fb2.add(q); for (let q = b + 1; q < P.length; q++) fb2.add(q);
        let i = choisir(P, fb2, a, b, (a + b) / 2, pris);
        if (i < 0) i = choisir(P, fb, lo, hi, (a + b) / 2, pris);
        if (i < 0) return;
        const dd = [P[i + 1][0] - P[i - 1][0], P[i + 1][1] - P[i - 1][1]];
        pieges.push({ c: P[i], type: t, pos: W(P[i]), dir: [Math.sign(dd[0]), Math.sign(dd[1])], phase: r2(rng() * 3), chemin: tag === "S" ? "court" : "long" });
        pris.push(i); marquer(i - 2, i + 2);
      });
    }
    const pool = n < 14 ? ["piques", "laser", "ecraseur"] : ["piques", "laser", "ecraseur", "camera"];
    function typesPour(nb, sansCamera, nbT) {
      const out = []; let o = ri(0, pool.length - 1);
      for (let q = 0; q < nb; q++) { let t = pool[(o + q) % pool.length]; if (sansCamera && t === "camera") t = "laser"; out.push(t); }
      for (let q = 0; q < (nbT || 0); q++) out.push("tonneaux");
      for (let q = out.length - 1; q > 0; q--) { const z = ri(0, q); const t = out[q]; out[q] = out[z]; out[z] = t; }
      return out;
    }
    const nbTon = n < 12 ? 0 : n < 30 ? 1 : n < 55 ? 2 : n < 80 ? 3 : 4;
    if (!serp) {
      const nCourt = salle ? 2 : 1 + Math.floor(d * 3), nLong = 3 + Math.floor(d * 9);
      placer(S, "S", typesPour(nCourt, true, 0), interdits(S), interdits(S, true));
      placer(L, "L", typesPour(nLong, false, nbTon), interdits(L), interdits(L, true));
    } else {
      placer(L, "L", typesPour(4 + Math.floor(d * 11), false, nbTon), interdits(L), interdits(L, true));
      if (branche && branche.length >= 9) placer(branche, "L", typesPour(1 + (d > 0.45 ? 1 : 0), true, 0), interdits(branche), interdits(branche, true));
    }

    /* --- portes verrouillées + interrupteurs (énigmes logiques) --- */
    const portesBrut = [];
    function poserPortes(Pd, nb) {
      if (!nb || Pd.length < 8) return;
      const fb = interdits(Pd), cand = [];
      for (let i = 0; i < Pd.length; i++) if (!fb.has(i) && droit(Pd, i)) cand.push(i);
      if (!cand.length) return;
      const lo = cand[0], hi = cand[cand.length - 1], pris = [];
      for (let j = 0; j < nb; j++) {
        const cible = lo + (hi - lo) * (j + 0.5) / nb;
        const ok = cand.filter(i => !pris.some(o => Math.abs(o - i) < 6)).sort((a, b) => Math.abs(a - cible) - Math.abs(b - cible));
        if (!ok.length) break;
        const i = ok[0]; pris.push(i);
        const dd = [Pd[i + 1][0] - Pd[i - 1][0], Pd[i + 1][1] - Pd[i - 1][1]];
        portesBrut.push({ c: Pd[i], dir: [Math.sign(dd[0]) + 0, Math.sign(dd[1]) + 0] });
      }
    }
    const nbPortes = n < 14 ? 0 : n < 26 ? 1 : n < 46 ? 2 : 3;
    poserPortes(L, salle ? Math.min(nbPortes, 1) : nbPortes);
    if (!serp && !salle && n >= 50) poserPortes(S, 1);

    const occupes = new Set(); if (cleLeaf) occupes.add(K(cleLeaf[0], cleLeaf[1]));
    const profondeur = bfs([sc]).dist;
    portesBrut.sort((a, b) => profondeur[I(a.c[0], a.c[1])] - profondeur[I(b.c[0], b.c[1])]);
    /* les portes s'ouvrent dans l'ordre : l'interrupteur de la porte j doit être atteignable quand les portes j, j+1... sont encore fermées */
    const portes = []; let Rprev = null;
    for (let j = 0; j < portesBrut.length; j++) {
      const bloq = new Set(portesBrut.slice(j).filter(p => !p.invalide).map(p => K(p.c[0], p.c[1])));
      const R = bfs([sc], bloq).dist;
      let cands = feuilles.filter(f => R[I(f[0], f[1])] >= 6 && !occupes.has(K(f[0], f[1])));
      if (Rprev) { const neufs = cands.filter(f => Rprev[I(f[0], f[1])] < 0); if (neufs.length) cands = neufs; }   // de préférence derrière la porte précédente
      if (!cands.length) { portesBrut[j].invalide = true; continue; }
      cands.sort((a, b) => R[I(b[0], b[1])] - R[I(a[0], a[1])]);
      const f = cands[ri(0, Math.min(2, cands.length - 1))];
      occupes.add(K(f[0], f[1]));
      portes.push({ c: portesBrut[j].c, dir: portesBrut[j].dir, mode: (n >= 28 && rng() < 0.3 + 0.4 * d) ? "laser" : "mur", couleur: portes.length, lev: f });
      Rprev = R;
    }
    /* interrupteurs piégés : même genre de cul-de-sac, mais noir et jaune */
    const leurres = [];
    if (n >= 38 && portes.length) {
      const R0 = bfs([sc], new Set(portes.map(p => K(p.c[0], p.c[1])))).dist;
      const cands = feuilles.filter(f => R0[I(f[0], f[1])] >= 6 && !occupes.has(K(f[0], f[1])));
      for (let q = cands.length - 1; q > 0; q--) { const z = ri(0, q); const t = cands[q]; cands[q] = cands[z]; cands[z] = t; }
      cands.slice(0, clampv(1 + Math.floor((n - 38) / 22), 1, 3)).forEach(f => { leurres.push(f); occupes.add(K(f[0], f[1])); });
    }
    const reserves = new Set(pieges.filter(t => t.type !== "camera").map(t => t.pos.join(",")));
    portes.forEach(p => { reserves.add(W(p.c).join(",")); reserves.add(W(p.lev).join(",")); });
    leurres.forEach(f => reserves.add(W(f).join(",")));

    /* --- pièces et clé --- */
    const pieces = [], vus = new Set();
    const addPiece = p => { const c = p.join(","); if (vus.has(c) || reserves.has(c)) return; if (Math.hypot(p[0] - dep[0], p[1] - dep[1]) < 2.0 || Math.hypot(p[0] - arr[0], p[1] - arr[1]) < 2.0) return; vus.add(c); pieces.push(p); };
    S.forEach((c, i) => { if (i < 2 || partage.has(K(c[0], c[1])) || (salle && Math.abs(c[0] - m) <= 4)) return; addPiece(W(c)); });
    L.forEach((c, i) => { if (i >= 3 && i % 2 === 0 && !partage.has(K(c[0], c[1]))) addPiece(W(c)); });
    feuilles.slice(0, 16 + Math.floor(d * 10)).forEach(([i, j]) => {
      addPiece(W([i, j]));
      for (const [a, b] of DIRS) if (ouvert(i + a, j + b)) addPiece(W([i + a, j + b]));
    });

    let cle, infoSalle = null;
    if (salle) {
      const pl = n < 46 ? SALLES_FACILES : n < 70 ? SALLES_FACILES.concat(SALLES_DURES) : SALLES_DURES, v = pl[ri(0, pl.length - 1)];
      cle = v.cle.slice();
      [[-5.6, -8.4], [5.6, -8.4], [-8.4, -2.8], [8.4, -2.8], [-2.8, 8.4], [2.8, 8.4]].forEach(p => addPiece(p));
      const piliers = []; for (const x of [-5.6, 0, 5.6]) for (const z of [-5.6, 0, 5.6]) piliers.push([x, z]);
      infoSalle = { limites: [-9.8, 9.8], piliers, emetteurs: v.em.map(p => ({ pos: p.slice(), cap: Math.round(Math.atan2(-p[0], -p[1]) * 1000) / 1000, amp: Math.round(v.champ * Math.PI / 180 * 1000) / 1000, periode: 1.0, phase: 0.0 })) };
    } else if (cleLeaf) {
      cle = W(cleLeaf);
    } else {
      const uniq = S.filter(c => !partage.has(K(c[0], c[1])) && !reserves.has(W(c).join(",")));
      cle = W(uniq.length ? uniq[Math.floor(uniq.length * 0.6)] : S[Math.floor(S.length / 2)]);
    }
    const cleTxt = cle.join(","); const idxCle = pieces.findIndex(p => p.join(",") === cleTxt); if (idxCle >= 0) pieces.splice(idxCle, 1);

    /* --- rotation / miroir pour que les niveaux ne se ressemblent pas --- */
    const mode = ri(0, 7), sw = mode & 1, fx = mode & 2, fz = mode & 4;
    const tp = p => { let x = p[0], z = p[1]; if (sw) { const t = x; x = z; z = t; } if (fx) x = -x; if (fz) z = -z; return [r2(x), r2(z)]; };
    const td = p => { let x = p[0], z = p[1]; if (sw) { const t = x; x = z; z = t; } if (fx) x = -x; if (fz) z = -z; return [x + 0, z + 0]; };
    const tcap = c => { const v = td([Math.sin(c), Math.cos(c)]); return Math.round(Math.atan2(v[0], v[1]) * 1000) / 1000; };
    const grille = [];
    for (let j2 = 0; j2 < N; j2++) {
      let ligne = "";
      for (let i2 = 0; i2 < N; i2++) {
        let a = i2, b = j2; if (fz) b = N - 1 - b; if (fx) a = N - 1 - a; if (sw) { const t = a; a = b; b = t; }
        ligne += mur[I(a, b)] ? "#" : " ";
      }
      grille.push(ligne);
    }
    const out = {
      grille, taille: N, depart: tp(dep), arrivee: tp(arr), cle: tp(cle), pieces: pieces.map(tp), tempo: Math.round((1 + 0.5 * d) * 100) / 100,
      pieges: pieges.map(t => { const o = Object.assign({}, t); delete o.c; o.pos = tp(t.pos); if (t.fin) o.fin = tp(t.fin); if (t.dir) { const q = td(t.dir); o.dir = [q[0] + 0, q[1] + 0]; } if (t.cap !== undefined) o.cap = tcap(t.cap); return o; }),
      portes: portes.map(p => ({ pos: tp(W(p.c)), dir: td(p.dir), mode: p.mode, couleur: p.couleur })),
      interrupteurs: portes.map((p, j) => ({ pos: tp(W(p.lev)), couleur: p.couleur, porte: j })).concat(leurres.map(f => ({ pos: tp(W(f)), leurre: true }))),
      plan: serp ? "serpentin" : "classique",
    };
    if (infoSalle) out.salle = { limites: infoSalle.limites, piliers: infoSalle.piliers.map(tp), emetteurs: infoSalle.emetteurs.map(e => ({ pos: tp(e.pos), cap: tcap(e.cap), amp: e.amp, periode: e.periode, phase: e.phase })) };
    const nb = out.pieges.length + out.portes.length;
    const conseils = [];
    if (out.pieges.some(t => t.type === "tonneaux") && n < 18) conseils.push("Tonneaux : ils roulent sur la voie gauche OU droite, tiens-toi du côté libre !");
    if (out.portes.some(p => p.mode === "mur") && n < 20) conseils.push("Porte verrouillée : trouve l'interrupteur de la même couleur, au fond d'un cul-de-sac.");
    if (out.portes.some(p => p.mode === "laser") && n < 34) conseils.push("Barrière laser : seul l'interrupteur de sa couleur peut la couper.");
    if (leurres.length && n < 44) conseils.push("Méfie-toi des interrupteurs noir et jaune : ce sont des pièges !");
    if (serp && n < 26) conseils.push("Ici, pas de raccourci : la clé est au fond du cul-de-sac le plus éloigné.");
    out.astuce = salle ? "Salle des lasers : cache-toi derrière les piliers, ils ne voient que ce qu'ils peuvent voir !"
      : conseils.length ? conseils.slice(0, 2).join("  ")
      : (n % 10 === 1 ? "Niveau " + n + " : " + nb + " pièges et portes. Réfléchis avant de courir." : "");
    return out;
  }

  const cacheNiv = {};
  function donneesNiveau(n) {
    const c = String(n);
    if (typeof DONNEES !== "undefined" && DONNEES[c]) return DONNEES[c];
    return cacheNiv[c] || (cacheNiv[c] = genererNiveau(n));
  }
  root.NB_NIVEAUX = NB_NIVEAUX; root.genererNiveau = genererNiveau; root.donneesNiveau = donneesNiveau; root.tailleNiveau = tailleNiveau; root.aSalle = aSalle;
  if (typeof module !== "undefined") module.exports = { genererNiveau, tailleNiveau, aSalle, NB_NIVEAUX };
})(typeof window !== "undefined" ? window : globalThis);
