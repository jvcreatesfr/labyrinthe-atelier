'use strict';
const g = require('../js/game_generateur.js');
const CELL = 2.8;
let erreurs = 0, avertissements = 0;
const err = (n, msg) => { erreurs++; console.log('  ERREUR niveau ' + n + ' : ' + msg); };
const warn = (n, msg) => { avertissements++; console.log('  avert. niveau ' + n + ' : ' + msg); };
const stats = [];
let tMax = 0;
for (let n = 11; n <= 100; n++) {
  const t0 = process.hrtime.bigint(); const d = g.genererNiveau(n); const ms = Number(process.hrtime.bigint() - t0) / 1e6; tMax = Math.max(tMax, ms);
  const d2 = g.genererNiveau(n); if (JSON.stringify(d) !== JSON.stringify(d2)) err(n, 'génération non déterministe');
  const N = d.taille, m = (N - 1) / 2, G = d.grille;
  if (N !== g.tailleNiveau(n)) err(n, 'taille inattendue');
  if (G.length !== N || G.some(r => r.length !== N)) { err(n, 'grille mal dimensionnée'); continue; }
  for (let i = 0; i < N; i++) if (G[0][i] !== '#' || G[N - 1][i] !== '#' || G[i][0] !== '#' || G[i][N - 1] !== '#') { err(n, 'le pourtour n\'est pas fermé'); break; }
  const cell = p => [Math.round(p[0] / CELL) + m, Math.round(p[1] / CELL) + m];
  const ouvert = (i, j) => i >= 0 && j >= 0 && i < N && j < N && G[j][i] === ' ';
  const nbVoisinsOuverts = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => ouvert(c[0] + a, c[1] + b)).length;
  const sp = cell(d.depart), fi = cell(d.arrivee);
  if (!ouvert(sp[0], sp[1])) err(n, 'départ dans un mur'); if (!ouvert(fi[0], fi[1])) err(n, 'arrivée dans un mur');
  /* connexité : tout ce qui est ouvert est-il atteignable depuis le départ ? */
  const dist = new Int32Array(N * N).fill(-1); const q = [[sp[0], sp[1]]]; dist[sp[1] * N + sp[0]] = 0;
  for (let h = 0; h < q.length; h++) { const [i, j] = q[h]; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ouvert(i + a, j + b) && dist[(j + b) * N + i + a] < 0) { dist[(j + b) * N + i + a] = dist[j * N + i] + 1; q.push([i + a, j + b]); } }
  if (dist[fi[1] * N + fi[0]] < 0) err(n, 'l\'arrivée n\'est pas atteignable');
  let ouverts = 0, isoles = 0; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (G[j][i] === ' ') { ouverts++; if (dist[j * N + i] < 0) isoles++; }
  if (isoles) err(n, isoles + ' cases ouvertes inaccessibles');
  const at = (p, nom) => { const c = cell(p); if (!ouvert(c[0], c[1])) err(n, nom + ' hors couloir en ' + p); if (Math.abs(p[0] - (c[0] - m) * CELL) > 1.5 || Math.abs(p[1] - (c[1] - m) * CELL) > 1.5) err(n, nom + ' mal aligné'); return c; };
  if (dist[cell(d.cle)[1] * N + cell(d.cle)[0]] < 0) err(n, 'clé inaccessible'); at(d.cle, 'clé');
  d.pieces.forEach(p => { const c = at(p, 'pièce'); if (dist[c[1] * N + c[0]] < 0) err(n, 'pièce inaccessible'); });
  const cles = new Set(d.pieces.map(p => p.join(','))); if (cles.size !== d.pieces.length) err(n, 'pièces en double'); if (cles.has(d.cle.join(','))) err(n, 'pièce sur la clé');
  /* pièges */
  const comptes = {}; const cellsP = [];
  for (const t of d.pieges) {
    comptes[t.type] = (comptes[t.type] || 0) + 1; const c = at(t.pos, 'piège ' + t.type);
    if (t.type === 'tonneaux') {
      const f = cell(t.fin), dx = t.dir[0], dz = t.dir[1];
      if (Math.abs(dx) + Math.abs(dz) !== 1) { err(n, 'tonneaux : direction invalide'); continue; }
      const len = Math.abs(f[0] - c[0]) + Math.abs(f[1] - c[1]);
      if (len < 6) err(n, 'tonneaux : trajet trop court (' + len + ')');
      for (let k = 0; k <= len; k++) if (!ouvert(c[0] + dx * k, c[1] + dz * k)) { err(n, 'tonneaux : trajet bloqué par un mur'); break; }
      if (c[0] + dx * len !== f[0] || c[1] + dz * len !== f[1]) err(n, 'tonneaux : arrivée pas alignée avec la direction');
      if (!(t.vitesse > 2 && t.vitesse < 8) || !(t.periode > 1 && t.periode < 4)) err(n, 'tonneaux : vitesse/période étranges');
      if (!Array.isArray(t.motif) || !t.motif.length || t.motif.some(v => v !== 1 && v !== -1)) err(n, 'tonneaux : motif invalide');
      if (Math.hypot(t.pos[0] - d.depart[0], t.pos[1] - d.depart[1]) < 8 || Math.hypot(t.pos[0] - d.arrivee[0], t.pos[1] - d.arrivee[1]) < 8) err(n, 'tonneaux trop près du départ/arrivée');
      continue;
    }
    if (t.type === 'camera') { if (!(t.periode >= 10 && t.periode <= 22)) err(n, 'période de caméra étrange : ' + t.periode); if (typeof t.cap !== 'number') err(n, 'caméra sans cap'); continue; }
    cellsP.push(c);
    const dx = t.dir[0], dz = t.dir[1];
    if (Math.abs(dx) + Math.abs(dz) !== 1) { err(n, 'direction de piège invalide ' + t.dir); continue; }
    if (!ouvert(c[0] + dx, c[1] + dz) || !ouvert(c[0] - dx, c[1] - dz)) err(n, t.type + ' pas dans un couloir droit');
    if (ouvert(c[0] + dz, c[1] + dx) || ouvert(c[0] - dz, c[1] - dx)) err(n, t.type + ' sur un croisement');
    if (Math.hypot(t.pos[0] - d.depart[0], t.pos[1] - d.depart[1]) < 8 || Math.hypot(t.pos[0] - d.arrivee[0], t.pos[1] - d.arrivee[1]) < 8) err(n, 'piège trop près du départ/arrivée');
  }
  for (let a = 0; a < cellsP.length; a++) for (let b = a + 1; b < cellsP.length; b++) if (Math.abs(cellsP[a][0] - cellsP[b][0]) + Math.abs(cellsP[a][1] - cellsP[b][1]) < 3) err(n, 'deux pièges collés');
  /* portes verrouillées et interrupteurs */
  const portes = d.portes || [], inters = d.interrupteurs || [];
  const kc = c => c[0] * 1000 + c[1];
  const atteint = bl => { const D = new Int32Array(N * N).fill(-1), Q = [[sp[0], sp[1]]]; D[sp[1] * N + sp[0]] = 0;
    for (let h = 0; h < Q.length; h++) { const [i, j] = Q[h]; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, y = j + b; if (ouvert(x, y) && D[y * N + x] < 0 && !bl.has(x * 1000 + y)) { D[y * N + x] = D[j * N + i] + 1; Q.push([x, y]); } } } return D; };
  portes.forEach((p, j) => {
    const c = at(p.pos, 'porte'), dx = p.dir[0], dz = p.dir[1];
    if (Math.abs(dx) + Math.abs(dz) !== 1) err(n, 'porte : direction invalide');
    else { if (!ouvert(c[0] + dx, c[1] + dz) || !ouvert(c[0] - dx, c[1] - dz)) err(n, 'porte pas dans un couloir droit'); if (ouvert(c[0] + dz, c[1] + dx) || ouvert(c[0] - dz, c[1] - dx)) err(n, 'porte sur un croisement'); }
    if (p.mode !== 'mur' && p.mode !== 'laser') err(n, 'porte : mode inconnu ' + p.mode);
    if (p.couleur !== j) err(n, 'porte : couleur inattendue');
    if (Math.hypot(p.pos[0] - d.depart[0], p.pos[1] - d.depart[1]) < 8 || Math.hypot(p.pos[0] - d.arrivee[0], p.pos[1] - d.arrivee[1]) < 8) err(n, 'porte trop près du départ/arrivée');
    cellsP.forEach(q => { if (Math.abs(q[0] - c[0]) + Math.abs(q[1] - c[1]) < 3) err(n, 'porte collée à un piège'); });
  });
  /* faisabilité : on ouvre les portes dans l'ordre, chaque interrupteur doit être atteignable quand sa porte et les suivantes sont fermées */
  const bloq = new Set(portes.map(p => kc(cell(p.pos))));
  portes.forEach((p, j) => {
    const lev = inters.find(s => !s.leurre && s.porte === j);
    if (!lev) { err(n, 'porte ' + j + ' sans interrupteur'); return; }
    const lc = at(lev.pos, 'interrupteur'), R = atteint(bloq);
    if (R[lc[1] * N + lc[0]] < 0) err(n, 'interrupteur ' + j + ' inatteignable avant d\'ouvrir la porte ' + j);
    if (nbVoisinsOuverts(lc) !== 1) err(n, 'interrupteur pas dans un cul-de-sac');
    bloq.delete(kc(cell(p.pos)));
  });
  if (atteint(bloq)[fi[1] * N + fi[0]] < 0) err(n, 'arrivée inatteignable une fois les portes ouvertes');
  inters.filter(s => s.leurre).forEach(s => { const lc = at(s.pos, 'interrupteur piégé'); if (atteint(new Set(portes.map(p => kc(cell(p.pos)))))[lc[1] * N + lc[0]] < 0) err(n, 'interrupteur piégé inatteignable'); });
  if (inters.some(s => !s.leurre && !(s.porte >= 0 && s.porte < portes.length))) err(n, 'interrupteur relié à une porte inexistante');
  { const cc = new Set(inters.map(s => s.pos.join(',')).concat(portes.map(p => p.pos.join(',')))); if (cc.size !== inters.length + portes.length) err(n, 'portes/interrupteurs superposés'); d.pieces.forEach(p => { if (cc.has(p.join(','))) err(n, 'pièce sur une porte ou un interrupteur'); }); }
  /* salle des lasers */
  if (g.aSalle(n)) {
    if (!d.salle) err(n, 'salle manquante');
    else {
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (!ouvert(m + i, m + j)) err(n, 'intérieur de la salle fermé');
      let portes = 0; for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) if (Math.max(Math.abs(i), Math.abs(j)) === 4 && ouvert(m + i, m + j)) portes++;
      if (portes !== 2) err(n, 'la salle a ' + portes + ' portes au lieu de 2');
      d.salle.emetteurs.forEach(e => { if (Math.abs(e.pos[0]) > 9.8 || Math.abs(e.pos[1]) > 9.8) err(n, 'projecteur hors salle'); if (!(e.amp > 0.8 && e.amp < 1.3)) err(n, 'champ de vision étrange'); });
      if (d.salle.piliers.length !== 9) err(n, 'piliers != 9');
      if (Math.abs(d.cle[0]) > 9.8 || Math.abs(d.cle[1]) > 9.8) err(n, 'la clé devrait être dans la salle');
      /* la clé ne doit pas être sur un pilier */
      d.salle.piliers.forEach(p => { if (Math.abs(p[0] - d.cle[0]) < 1.3 && Math.abs(p[1] - d.cle[1]) < 1.3) err(n, 'clé dans un pilier'); });
    }
  } else if (d.salle) err(n, 'salle inattendue');
  stats.push({ n, N, ouverts, pieges: d.pieges.length, comptes, pieces: d.pieces.length, salle: !!d.salle, tempo: d.tempo, ms: Math.round(ms), portes: portes.length, leurres: inters.filter(x => x.leurre).length, plan: d.plan, ton: comptes.tonneaux || 0 });
}
console.log('\nniveau | taille | cases ouvertes | pièges | détail | pièces | salle | tempo');
for (const n of [11, 12, 14, 20, 30, 40, 50, 60, 70, 80, 90, 98, 99, 100]) { const s = stats.find(x => x.n === n); console.log(String(s.n).padStart(5), '|', s.N, '|', String(s.ouverts).padStart(4), '|', String(s.pieges).padStart(2), '|', JSON.stringify(s.comptes), '|', s.pieces, '|', s.salle ? 'OUI' : '-', '|', s.tempo); }
const moy = (a, b, f) => { const l = stats.filter(s => s.n >= a && s.n <= b); return (l.reduce((t, s) => t + f(s), 0) / l.length).toFixed(1); };
console.log('\npièges par niveau en moyenne : 11-30 =', moy(11, 30, s => s.pieges), '| 31-50 =', moy(31, 50, s => s.pieges), '| 51-70 =', moy(51, 70, s => s.pieges), '| 71-100 =', moy(71, 100, s => s.pieges));
console.log('niveaux serpentins :', stats.filter(s => s.plan === 'serpentin').length, '/ 90 | avec tonneaux :', stats.filter(s => s.ton > 0).length, '| avec portes :', stats.filter(s => s.portes > 0).length, '| avec interrupteurs piégés :', stats.filter(s => s.leurres > 0).length);
console.log('tonneaux par niveau (moy.) : 11-30 =', moy(11, 30, s => s.ton), '| 31-50 =', moy(31, 50, s => s.ton), '| 51-70 =', moy(51, 70, s => s.ton), '| 71-100 =', moy(71, 100, s => s.ton));
console.log('portes par niveau (moy.) : 11-30 =', moy(11, 30, s => s.portes), '| 31-50 =', moy(31, 50, s => s.portes), '| 51-70 =', moy(51, 70, s => s.portes), '| 71-100 =', moy(71, 100, s => s.portes));
console.log('niveaux avec salle :', stats.filter(s => s.salle).length, '| temps de génération max :', Math.round(tMax), 'ms');
console.log('\nRÉSULTAT :', erreurs, 'erreur(s),', avertissements, 'avertissement(s)');
process.exit(erreurs ? 1 : 0);
