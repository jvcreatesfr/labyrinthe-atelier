'use strict';
const fs = require('fs'), vm = require('vm');
const gen = require('../js/game_generateur.js');
class Vec { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } setScalar(s) { this.x = this.y = this.z = s; return this; } copy() { return this; } }
class Node { constructor() { this.position = new Vec(); this.scale = new Vec(); this.rotation = new Vec(); this.children = []; this.visible = true; this.material = { color: { copy() {} } }; this.color = { copy() {} }; this.repeat = new Vec(); this.rotateX = () => {}; this.geometry = { rotateX() {} }; }
  add(c) { this.children.push(c); } }
const THREE = new Proxy({}, { get: (_, k) => k === 'Color' ? class { setRGB() { return this; } convertSRGBToLinear() { return this; } copy() {} } : k === 'CanvasTexture' ? class extends Node {} : class extends Node {} });
const document = { createElement: () => ({ getContext: () => ({ createImageData: () => ({ data: [] }), putImageData() {} }) }) };
const sandbox = { THREE, document, console, Math, Object, Array, Set, Float32Array, Uint8Array, avert: [], afficherAstuce: m => sandbox.avert.push(m) };
vm.createContext(sandbox);
const shim = `
const TAU = Math.PI * 2; const clamp = (v, a, b) => Math.min(b, Math.max(a, v)); const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dark = (c, a) => [c[0] * (1 - a), c[1] * (1 - a), c[2] * (1 - a)];
const mkCol = c => new THREE.Color().setRGB(c[0], c[1], c[2]).convertSRGBToLinear();
function stdMat(c, r, m, o) { const x = new THREE.MeshStandardMaterial({}); if (o) Object.assign(x, o); return x; }
function basicMat(c, o) { return new THREE.MeshBasicMaterial({}); }
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
`;
const code = shim + fs.readFileSync(__dirname + '/../js/game_pieges.js', 'utf8') + fs.readFileSync(__dirname + '/../js/game_extras.js', 'utf8');
vm.runInContext(code + '\nthis.PiegeTonneaux = PiegeTonneaux; this.PiegePortes = PiegePortes;', sandbox);
let erreurs = 0; const ok = (c, msg) => { if (!c) { erreurs++; console.log('  ECHEC :', msg); } else console.log('  ok :', msg); };
const mk = () => { const morts = []; const j = { x: 999, z: 999, vx: 0, vz: 0 }; return { morts, j, ctx: { group: new Node(), boxes: [], joueur: j, assets: {}, lvl: {}, proteger: () => false, onMort: r => morts.push(r) } }; };

/* --- tonneaux : couloir fictif le long de +x, tonneaux qui roulent vers -x --- */
{
  const run = { type: 'tonneaux', pos: [30, 0], fin: [0, 0], dir: [-1, 0], periode: 2.5, vitesse: 4, motif: [1], phase: 0, rafale: false };
  /* le motif [1] : toujours la voie +perp ; perp = (-dz, dx) = (0, -1) -> z = -0.8 */
  for (const [nom, zj, doitMourir] of [['même voie', -0.8, true], ['voie opposée', 0.8, false], ['au centre', 0, true]]) {
    const { morts, j, ctx } = mk(); const t = new sandbox.PiegeTonneaux(ctx, [run]); j.x = 15; j.z = zj;
    for (let i = 0; i < 60 * 12 && !morts.length; i++) t.update(1 / 60);
    ok(morts.length === (doitMourir ? 1 : 0), 'tonneaux, joueur ' + nom + ' -> ' + (doitMourir ? 'mort' : 'survit') + ' (' + (morts[0] || '-') + ')');
  }
  { const { morts, j, ctx } = mk(); const t = new sandbox.PiegeTonneaux(ctx, [run]); j.x = 29; j.z = 0;   // joueur sous le distributeur : rien ne doit tomber dessus
    for (let i = 0; i < 60 * 6; i++) t.update(1 / 60); ok(morts.length === 0 && t.actifs.length === 0, 'aucun tonneau lâché sur un joueur collé au distributeur'); }
  { const { morts, j, ctx } = mk(); const t = new sandbox.PiegeTonneaux(ctx, [Object.assign({}, run, { rafale: true, motif: [1] })]); j.x = 10; j.z = 0.8;   // rafale : 2e tonneau sur l'autre voie
    for (let i = 0; i < 60 * 8 && !morts.length; i++) t.update(1 / 60); ok(morts.length === 1, 'rafale : rester immobile finit par tuer (voie opposée prise par le 2e tonneau)'); }
  { const { morts, j, ctx } = mk(); const t = new sandbox.PiegeTonneaux(ctx, [run]); j.x = 15; j.z = 0.8; let max = 0; for (let i = 0; i < 60 * 20; i++) { t.update(1 / 60); max = Math.max(max, t.actifs.length); } ok(max >= 2 && max <= 8, 'plusieurs tonneaux en même temps, recyclés (max ' + max + ', ' + t.runs[0].pool.length + ' en réserve)'); }
}
/* --- portes : mur --- */
{
  const { morts, j, ctx } = mk();
  const t = new sandbox.PiegePortes(ctx, [{ pos: [10, 0], dir: [1, 0], mode: 'mur', couleur: 0 }], [{ pos: [0, 0], couleur: 0, porte: 0 }, { pos: [0, 20], leurre: true }]);
  ok(ctx.boxes.length === 1, 'la porte-mur ajoute une boîte de collision');
  j.x = 5; j.z = 0; t.update(1 / 60); ok(sandbox.avert.some(a => a.includes('Porte rouge')), 'indice affiché près de la porte fermée');
  j.x = 0; j.z = 0; t.update(1 / 60); for (let i = 0; i < 60; i++) t.update(1 / 60);
  ok(ctx.boxes.length === 0, 'la collision disparaît une fois la porte ouverte');
  j.x = 0; j.z = 20; t.update(1 / 60); ok(morts.length === 1 && morts[0].includes('piégé'), 'interrupteur piégé tue');
}
/* --- barrière laser --- */
{
  const { morts, j, ctx } = mk();
  const t = new sandbox.PiegePortes(ctx, [{ pos: [10, 0], dir: [1, 0], mode: 'laser', couleur: 1 }], [{ pos: [0, 0], couleur: 1, porte: 0 }]);
  j.x = 10; j.z = 0.5; t.update(1 / 60); ok(morts.length === 1 && morts[0].includes('laser'), 'barrière laser fermée tue');
  const m2 = mk(); const t2 = new sandbox.PiegePortes(m2.ctx, [{ pos: [10, 0], dir: [1, 0], mode: 'laser', couleur: 1 }], [{ pos: [0, 0], couleur: 1, porte: 0 }]);
  m2.j.x = 0; m2.j.z = 0; t2.update(1 / 60); m2.j.x = 10; m2.j.z = 0.5; t2.update(1 / 60); ok(m2.morts.length === 0, 'barrière laser coupée par son interrupteur : on peut passer');
}
/* --- avec de vraies données générées : tous les niveaux se construisent et tournent --- */
{
  let total = 0, pb = 0;
  for (let n = 11; n <= 100; n++) {
    const d = gen.genererNiveau(n); const m = mk();
    try {
      const tons = d.pieges.filter(t => t.type === 'tonneaux'); const L = [];
      if (tons.length) L.push(new sandbox.PiegeTonneaux(m.ctx, tons));
      if (d.portes.length || d.interrupteurs.length) L.push(new sandbox.PiegePortes(m.ctx, d.portes, d.interrupteurs));
      m.j.x = d.depart[0]; m.j.z = d.depart[1];
      for (let i = 0; i < 300; i++) L.forEach(p => p.update(1 / 60));
      total++;
      if (m.morts.length) { pb++; console.log('  niveau ' + n + ' : mort au départ ?! ' + m.morts[0]); }
    } catch (e) { erreurs++; console.log('  niveau ' + n + ' : exception ' + e.message); }
  }
  ok(total === 90 && pb === 0, '90 niveaux générés : pièges construits et mis à jour sans erreur, aucun piège ne tue au point de départ');
}
console.log(erreurs ? '\nECHEC : ' + erreurs : '\nTOUT EST BON');
process.exit(erreurs ? 1 : 0);
