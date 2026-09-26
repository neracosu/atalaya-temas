// Tema "Raid" (3D, three.js): arena de mazmorra al estilo de un MMO de fantasia.
//  - cada cuenta es un GRUPO de la banda sobre su alfombra; cada servicio o sitio un HEROE en pixel art
//    con su barra de vida (estado) y de mana (CPU; en los sitios, cuanto trafico recibe). La clase depende de que es.
//  - debajo de cada grupo, su PLACA nombra a todos sus heroes con su dibujo (se ubica sin hacer clic);
//    al acercarse, cada heroe lleva su nombre encima
//  - cada visita es un numero de combate que sube del heroe (+N verde; -502 rojo si es un error)
//  - un servicio caido es un heroe muerto (lapida); al reiniciarse "resucita"
//  - el servidor es el GUARDIAN que protege a la banda; los intentos de acceso son bolas de fuego del jefe,
//    EL INTRUSO: el guardian las absorbe con su escudo, y cada IP bloqueada le quita vida al jefe
//  - cada sesion de Claude Code es un JUGADOR con aura dorada y barra de lanzamiento (lo que hace);
//    si espera su permiso, aparece la comprobacion "?"
// Regla de oro: el color es la clase o el estado, nunca adorno; los numeros de combate cuentan lo que pasa.
import { Stage3D, THREE, color, clamp, billboard, rowsCanvas, groupsOf, layoutKeyOf, packRows, iconURL, plaqueList } from '/js/stage3d.js';
import { esc, fmtBytes } from '/js/hud.js';
import { accountCaption } from '/js/accounts.js';

const P = { k: '#120f0d', z: '#e2b48c', a: '#c7ccd4', A: '#7d838c', w: '#8b5a2b', y: '#e8c55a', Y: '#b8912e', x: '#f4f1e8', r: '#d94a3a', b: '#4a8fe0', g: '#5fbf4a', v: '#8a4fd0', d: '#3b3346', o: '#e68a2e', s: '#9aa0a8' };

// clases: colores de armadura (C), detalle (c), casco o pelo (H) y el arma
const CLASSES = {
  guerrero: { C: '#b53a2e', c: '#7a261e', H: '#c7ccd4', weapon: 'espada', name: 'Guerrero' },
  paladin: { C: '#e8c55a', c: '#b8912e', H: '#e8c55a', weapon: 'martillo', name: 'Paladín' },
  ingeniero: { C: '#c9772e', c: '#8a4f1c', H: '#5b4636', weapon: 'llave', name: 'Ingeniero' },
  mago: { C: '#4a6fe0', c: '#2e45a0', H: '#4a6fe0', weapon: 'baston', name: 'Mago' },
  sacerdote: { C: '#f4f1e8', c: '#c9c3b0', H: '#e8c55a', weapon: 'orbe', name: 'Sacerdote' },
  arquero: { C: '#4f8a3a', c: '#355e27', H: '#355e27', weapon: 'arco', name: 'Arquero' },
  picaro: { C: '#3b3346', c: '#221d29', H: '#221d29', weapon: 'dagas', name: 'Pícaro' },
};
function classOf(it) {
  if (it._k === 'site') return it.type === 'wordpress' ? 'arquero' : it.type === 'php' ? 'picaro' : 'arquero';
  return { pm2: 'guerrero', systemd: 'paladin', docker: 'ingeniero', vercel: 'mago', supabase: 'sacerdote' }[it.source] || 'guerrero';
}
function heroRows(cls) {
  const base = [
    '................', '......kkkk......', '.....kHHHHk.....', '.....kzzzzk.....', '.....kzkzkk.....', '......kzzk......',
    '....kkCCCCkk....', '...kCCCCCCCCk...', '...kCCccccCCk...', '...kzCCCCCCzk...', '....kCCCCCCk....', '....kcccccck....',
    '....kCCkkCCk....', '....kCCk.kCCk...', '....kkk..kkk....', '................'].map(r => [...r]);
  const set = (x, y, ch) => { if (base[y] && x >= 0 && x < 16) base[y][x] = ch; };
  const w = CLASSES[cls].weapon;
  if (w === 'espada') { for (let y = 2; y <= 9; y++) set(13, y, 'a'); set(12, 9, 'y'); set(14, 9, 'y'); set(13, 10, 'w'); for (let y = 7; y <= 11; y++) { set(1, y, 'w'); set(2, y, 'w'); } set(1, 8, 'y'); set(2, 9, 'y'); }
  if (w === 'martillo') { for (let y = 4; y <= 11; y++) set(13, y, 'w'); for (let x = 11; x <= 15; x++) { set(x, 3, 'a'); set(x, 4, 'a'); } set(13, 2, 'k'); }
  if (w === 'llave') { for (let y = 6; y <= 11; y++) set(13, y, 'a'); set(12, 5, 'a'); set(14, 5, 'a'); set(12, 4, 'a'); set(14, 4, 'a'); set(6, 4, 'b'); set(8, 4, 'b'); }
  if (w === 'baston') { for (let y = 3; y <= 13; y++) set(13, y, 'w'); set(13, 2, 'b'); set(12, 2, 'b'); set(14, 2, 'b'); set(13, 1, 'x'); set(6, 0, 'k'); set(7, 0, 'C'); set(7, 1, 'C'); set(8, 1, 'C'); }
  if (w === 'orbe') { for (let y = 4; y <= 13; y++) set(13, y, 'y'); set(12, 3, 'y'); set(14, 3, 'y'); set(13, 2, 'x'); set(13, 3, 'x'); }
  if (w === 'arco') { for (let y = 3; y <= 12; y++) set(y < 5 || y > 10 ? 13 : 14, y, 'w'); for (let y = 4; y <= 11; y++) set(12, y, 'x'); set(5, 1, 'k'); }
  if (w === 'dagas') { set(1, 8, 'a'); set(1, 9, 'a'); set(1, 10, 'k'); set(14, 8, 'a'); set(14, 9, 'a'); set(14, 10, 'k'); set(6, 3, 'k'); set(9, 3, 'k'); }
  return base.map(r => r.join(''));
}
const TOMB = ['....kkkk....', '...kssssk...', '..ksssssssk.', '..kssksssk..', '..ksskkkssk.', '..kssksssk..', '..ksssssssk.', '..ksssssssk.', '..ksssssssk.', '.kkkkkkkkkkk', 'kddddddddddk'];

const SP = 1.5;   // separacion entre heroes
const COLS = 9;   // maximo de heroes por fila dentro de un grupo
const FONT_K = 0.36;
const BOSS_Z = -13, GUARD_Z = -5.5;

function barSprite(hex, w, h) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: color(hex), depthWrite: false, depthTest: false }));
  s.center.set(0, 0.5); s.scale.set(w, h, 1); s.renderOrder = 5;
  return s;
}

export default class Raid3D extends Stage3D {
  constructor(el, opts) {
    super(el, opts);
    this.fov = 32; this.fitScale = 1; this.orbitSpeed = 0;
    this.heroes = new Map(); this.groups = new Map(); this.players = new Map();
    this.layoutKey = ''; this.pending = new Map();
    this.boss = { hp: 100, dead: 0, flash: 0 };
    this.view = { az: Math.PI / 2, el: 0.62, dist: 40, tx: 0, ty: 0, tz: 0, zoom: 1 };
    this.orbit = { ...this.view }; this.goal = { ...this.view };
  }

  async build() {
    const S = this.scene;
    S.fog = new THREE.Fog(0x141110, 60, 140);
    S.add(new THREE.HemisphereLight(0xffe2b0, 0x1a1210, 0.55));
    const key = new THREE.DirectionalLight(0xffe8c8, 0.6); key.position.set(10, 30, 20); S.add(key);
    this.fire = [new THREE.PointLight(0xff8a2e, 30, 40, 1.6), new THREE.PointLight(0xff8a2e, 30, 40, 1.6)];
    this.fire[0].position.set(-14, 5, -6); this.fire[1].position.set(14, 5, -6); S.add(...this.fire);
    // suelo de losas
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#2b2522'; cx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) { const k = 38 + ((x * 7 + y * 13) % 11); cx.fillStyle = `rgb(${k + 6},${k},${k - 4})`; cx.fillRect(x + 1, y + 1, 14, 14); }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(40, 40); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; S.add(floor);
    // circulo de runas bajo el jefe
    const rune = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 48), new THREE.MeshBasicMaterial({ color: 0xb04aff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    rune.rotation.x = -Math.PI / 2; rune.position.set(0, 0.02, BOSS_Z); S.add(rune); this.rune = rune;
    this.arena = new THREE.Group(); S.add(this.arena);
    this.buildBoss(); this.buildGuardian();
  }

  buildBoss() {
    const g = new THREE.Group(); g.position.set(0, 0, BOSS_Z);
    const skin = new THREE.MeshStandardMaterial({ color: 0x5a2f86, roughness: 0.7, flatShading: true, emissive: 0x2a0f45, emissiveIntensity: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3d1f5c, roughness: 0.8, flatShading: true });
    const bone = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6, flatShading: true });
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2), skin); body.scale.set(1, 1.25, 0.8); body.position.y = 3.2;
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1), skin); head.position.y = 6.2;
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 6), bone); hornL.position.set(-0.8, 7.2, 0); hornL.rotation.z = 0.5;
    const hornR = hornL.clone(); hornR.position.x = 0.8; hornR.rotation.z = -0.5;
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xff3b2e });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.1), eyeM); eyeL.position.set(-0.38, 6.3, 0.95);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.38;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.8), dark); armL.position.set(-2.6, 3.4, 0.2); armL.rotation.z = 0.25;
    const armR = armL.clone(); armR.position.x = 2.6; armR.rotation.z = -0.25;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.9), dark); legL.position.set(-0.9, 0.8, 0);
    const legR = legL.clone(); legR.position.x = 0.9;
    const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshBasicMaterial({ color: 0xb04aff })); rune.position.set(0, 3.6, 1.8);
    g.add(body, head, hornL, hornR, eyeL, eyeR, armL, armR, legL, legR, rune);
    g.traverse(o => { o.userData = { kind: 'security', id: 'all' }; });
    this.scene.add(g);
    this.pickables.push(g);
    Object.assign(this.boss, { g, skin, eyeM, orb: rune, armL, armR });
    this.boss.label = this.label('w3-boss', '<b>EL INTRUSO</b><i><s></s></i><small></small>', new THREE.Vector3(0, 8.6, BOSS_Z));
    this.boss.label.d.dataset.go = 'security:all';
  }

  buildGuardian() {
    const g = new THREE.Group(); g.position.set(0, 0, GUARD_Z);
    const steel = new THREE.MeshStandardMaterial({ color: 0xc7ccd4, metalness: 0.7, roughness: 0.35, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe8c55a, metalness: 0.8, roughness: 0.3, flatShading: true });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 2.2, 8), steel); body.position.y = 1.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), steel); head.position.y = 3.1;
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0xb53a2e })); plume.position.y = 3.75;
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.14, 6), gold); shield.rotation.x = Math.PI / 2; shield.position.set(0, 1.9, -0.9);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.05), steel); sword.position.set(1.1, 2.2, -0.2);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.6), steel); legs.position.y = 0.3;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8c55a, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
    g.add(body, head, plume, shield, sword, legs, dome);
    g.traverse(o => { o.userData = { kind: 'system', id: 'root' }; });
    this.scene.add(g);
    this.pickables.push(body, head, shield);
    this.guard = { g, dome, flash: 0 };
    this.guard.label = this.label('w3-group', '<b>EL GUARDIÁN</b><small></small>', new THREE.Vector3(0, 0, GUARD_Z + 1.3));
    this.guard.label.d.dataset.go = 'system:root';
    this.guard.label.d.style.translate = '-50% 0';
  }

  // ------------------------------------------------------------------ la banda
  layout(state) {
    const key = layoutKeyOf(state);
    if (key === this.layoutKey) return;
    if (key !== this.realKey) { this.realKey = key; this.refits = 0; }
    this.layoutKey = key;
    this.arena.clear();
    for (const g of this.groups.values()) g.plaque.remove();
    for (const h of this.heroes.values()) h.label.remove();
    this.groups.clear(); this.heroes.clear();
    this.pickables = this.pickables.filter(p => ['system', 'security', 'session'].includes(p.userData.kind));
    const list = groupsOf(state);
    list.forEach(g => { g.cols = Math.min(g.items.length, clamp(Math.ceil(Math.sqrt(g.items.length * 2.2)), 2, COLS)); g.rows = Math.ceil(g.items.length / g.cols); g.w = g.cols * SP + 0.8; g.d = g.rows * SP + 0.6; });
    // la placa ocupa unidades del mundo en profundidad: se ve inclinada segun la elevacion de la camara
    const plaqueE = g => (FONT_K * 1.3 * this.plaqueLines(g.items.length, g.w, FONT_K) + 0.5) / Math.sin(this.view.el);
    const plaqueD = g => (g.plaqueU = this.plaqueUnits(g.a.id, plaqueE(g)));
    const best = packRows(list, { w: g => g.w, h: g => g.d + plaqueD(g) + 1.2, gap: 1.6, aspect: this.areaAspect() * Math.sin(this.view.el), extraH: -(BOSS_Z - 3) + 9 * Math.cos(this.view.el) / Math.sin(this.view.el) });
    let z = 0;
    best.rows.forEach((row, ri) => {
      let x = -best.widths[ri] / 2;
      for (const g of row) { g.x = x + g.w / 2; g.z = z + g.d / 2; x += g.w + 1.6; this.buildGroup(g); }
      z += best.heights[ri];
    });
    this.extent = { w: Math.max(best.W, 12), z0: BOSS_Z - 3, z1: z };
    this.fit(true);
  }
  fit(snap) {
    const E = this.extent; if (!E) return;
    const depth = (E.z1 - E.z0) * Math.sin(this.view.el) + 9 * Math.cos(this.view.el); // alto en pantalla: profundidad inclinada mas el jefe
    const dist = this.distToFit(E.w + 2, depth + 1.5) * 1.02;
    this.setView({ dist, tz: (E.z0 + E.z1) / 2, ty: 1.5 }, snap);
  }
  setInsets(ins) { super.setInsets(ins); if (this.extent) this.fit(false); }

  buildGroup(G) {
    const { a, items } = G;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(G.w, G.d), new THREE.MeshStandardMaterial({ color: color(a.color).lerp(color('#141110'), 0.78), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(G.x, 0.02, G.z);
    rug.userData = { kind: 'district', id: a.id };
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(G.w, G.d)), new THREE.LineBasicMaterial({ color: color(a.color) }));
    edge.rotation.x = -Math.PI / 2; edge.position.set(G.x, 0.03, G.z);
    this.arena.add(rug, edge); this.pickables.push(rug);
    const nA = items.filter(x => x._k === 'app').length;
    G.caption = accountCaption(a, nA, items.length - nA);
    items.forEach((it, i) => this.addHero(it, G, G.x - G.w / 2 + 0.4 + SP / 2 + (i % G.cols) * SP, G.z - G.d / 2 + 0.3 + SP / 2 + Math.floor(i / G.cols) * SP));
    G.plaque = this.label('w3-plaque', `<b style="border-color:${a.color}">${esc(a.label)}</b><small>${esc(G.caption)}</small><div class="fishlist"></div>`, new THREE.Vector3(G.x, 0.05, G.z + G.d / 2 + 0.2));
    G.plaque.d.dataset.go = 'district:' + a.id;
    this.groups.set(a.id, G);
    this.fillPlaque(G);
  }
  fillPlaque(G) {
    G.plaque.d.querySelector('.fishlist').innerHTML = plaqueList(G.items.map(it => ({ ...it, ...(this.heroes.get(it.id)?.data || {}) })), it => {
      const cls = classOf(it), dead = it.status === 'down';
      return iconURL((dead ? 'tomb' : cls), () => rowsCanvas(dead ? TOMB : heroRows(cls), { ...P, ...(CLASSES[cls] || {}) }, 2));
    });
  }

  addHero(it, G, x, z) {
    const cls = classOf(it);
    const spr = billboard(rowsCanvas(heroRows(cls), { ...P, ...CLASSES[cls] }, 4), 1.35);
    spr.center.set(0.5, 0); spr.position.set(x, 0.05, z);
    spr.userData = { kind: it._k === 'site' ? 'site' : 'app', id: it.id };
    const tomb = billboard(rowsCanvas(TOMB, P, 4), 1.1); tomb.center.set(0.5, 0); tomb.position.set(x, 0.05, z); tomb.visible = false; tomb.userData = spr.userData;
    const bg = barSprite('#120f0d', 1.1, 0.2), hp = barSprite('#3fcf4a', 1.02, 0.08), mp = barSprite(it._k === 'site' ? '#e68a2e' : '#4a8fe0', 1.02, 0.06);
    bg.position.set(x - 0.55, 1.62, z); hp.position.set(x - 0.51, 1.66, z); mp.position.set(x - 0.51, 1.57, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.48, 24), new THREE.MeshBasicMaterial({ color: color(G.a.color), transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.04, z);
    this.arena.add(spr, tomb, bg, hp, mp, ring);
    this.pickables.push(spr, tomb);
    const h = { spr, tomb, hp, mp, bg, ring, cls, data: it, G, x, z, dead: false, hpV: 1, mpV: 0, bob: Math.random() * 6 };
    h.label = this.label('w3-item', esc(it.name), () => h.named ? new THREE.Vector3(x, 1.95, z) : null);
    this.heroes.set(it.id, h);
  }

  // ------------------------------------------------------------------ estado
  update(state) {
    this.state = state;
    this.layout(state);
    const replate = new Set();
    for (const x of [...state.apps, ...(state.sites || [])]) {
      const h = this.heroes.get(x.id);
      if (!h) continue;
      h.data = { ...x, _k: h.data._k };
      const dead = x.status === 'down';
      if (dead !== h.dead) {
        const was = h.dead; h.dead = dead; replate.add(h.G);
        if (dead) this.float(new THREE.Vector3(h.x, 2.3, h.z), `${x.name} ha muerto`, 'crit');
        else if (was) { this.float(new THREE.Vector3(h.x, 2.3, h.z), 'Resucitado', 'ok'); this.ring(new THREE.Vector3(h.x, 0, h.z), 'accent', 1); }
      }
      h.hpT = dead ? 0 : x.status === 'degraded' ? 0.5 : 1;
      h.mpT = h.data._k === 'site' ? clamp(Math.sqrt(x.reqMin || 0) / 8, 0, 1) : clamp((x.cpu || 0) / 100, 0, 1);
    }
    replate.forEach(G => this.fillPlaque(G));
    const s = state.system;
    const keys = (state.keys || []).filter(k => k.state === 'active').map(k => k.label).filter(l => !['SSH', 'Cron'].includes(l)).slice(0, 4).join(' · ');
    this.guard.label.d.querySelector('small').textContent = keys + (s ? ` · CPU ${s.cpu.toFixed(0)}%` : '');
    this.failed = (state.keys || []).some(k => k.state === 'failed');
    this.syncPlayers(state.sessions || []);
  }

  syncPlayers(sessions) {
    const seen = new Set(), per = {};
    for (const s of sessions) {
      seen.add(s.id);
      let p = this.players.get(s.id);
      if (!p) {
        const spr = billboard(rowsCanvas(heroRows('mago'), { ...P, C: '#e8c55a', c: '#b8912e', H: '#f4f1e8' }, 4), 1.5);
        spr.center.set(0.5, 0); spr.userData = { kind: 'session', id: s.id };
        const aura = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xe8c55a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
        aura.rotation.x = -Math.PI / 2;
        this.scene.add(spr, aura); this.pickables.push(spr);
        p = { spr, aura };
        p.label = this.label('w3-cast', '', () => spr.position.clone().setY(2.1));
        this.players.set(s.id, p);
      }
      p.s = s;
      const G = this.groups.get(s.account);
      per[s.account] = (per[s.account] || 0) + 1;
      const slot = per[s.account] - 1;
      p.x = G ? G.x - G.w / 2 + 0.8 + slot * 1.4 : -4 + slot * 1.4; p.z = G ? G.z - G.d / 2 - 0.9 : GUARD_Z + 2;
      const act = esc((s.activity || '').slice(0, 42));
      p.label.d.innerHTML = s.waitKind ? '<em>?</em> Espera su permiso' : s.state === 'idle' ? '' : `<span>${act || 'Pensando'}</span><i></i>`;
      p.label.d.classList.toggle('wait', !!s.waitKind);
    }
    for (const [id, p] of this.players) if (!seen.has(id)) { this.scene.remove(p.spr, p.aura); p.label.remove(); this.pickables = this.pickables.filter(o => o !== p.spr); this.players.delete(id); }
  }

  // ------------------------------------------------------------------ eventos
  onEvent(e, priv) {
    switch (e.kind) {
      case 'http': {
        const h = this.heroes.get(e.app || e.site);
        if (!h || h.dead) return;
        if (e.status >= 500) { if (this.labelsList.length < 140) this.float(new THREE.Vector3(h.x + (Math.random() - 0.5) * 0.6, 2.2, h.z), `-${e.status}`, 'crit', 2); this.sparks(new THREE.Vector3(h.x, 1, h.z), 'crit', 6, 2); return; }
        const q = this.pending.get(h) || { n: 0, bot: 0 }; q.n++; if (e.bot) q.bot++; this.pending.set(h, q);
        return;
      }
      case 'attack': return this.fireball(false);
      case 'block': return this.fireball(true, priv ? e.ip : null);
      case 'login': return this.float(new THREE.Vector3(0, 5.2, GUARD_Z), priv && e.user ? `${e.user} entró a la banda` : 'Un aliado entró', 'ok');
      case 'deploy': {
        const h = this.heroes.get(e.app);
        const T = { building: ['Canalizando…', 'warn'], ready: ['¡Subió de nivel!', 'ok'], error: ['Hechizo fallido', 'crit'], canceled: ['Interrumpido', 'dim'] }[e.action];
        if (h && T) { this.float(new THREE.Vector3(h.x, 2.4, h.z), T[0], T[1]); if (e.action === 'ready') this.sparks(new THREE.Vector3(h.x, 1.2, h.z), 'accent', 14); }
        return;
      }
      case 'pm2': { const h = this.heroes.get(e.app); if (h && e.action !== 'down') { this.float(new THREE.Vector3(h.x, 2.4, h.z), 'Resucitado', 'ok'); this.ring(new THREE.Vector3(h.x, 0, h.z), 'accent', 1); } return; }
      case 'domain': { const G = this.groups.get(e.account); if (G) this.float(new THREE.Vector3(G.x, 2.6, G.z), ({ added: 'Un héroe se unió', removed: 'Un héroe dejó el grupo', changed: 'Cambió un sitio' }[e.action] || '') + (priv && e.domain ? ` · ${e.domain}` : ''), e.action === 'removed' ? 'warn' : 'ok'); return; }
      case 'claude': {
        const p = this.players.get(e.sid) || [...this.players.entries()].find(([k]) => e.sid && k.startsWith(e.sid))?.[1];
        if (!p) return;
        const pos = p.spr.position.clone().setY(2.8);
        if (e.action === 'permission') { this.attention(p.spr.position, 2.6); this.float(pos, 'Comprobación: ¿acepta?', 'warn'); }
        else if (e.action === 'done') { this.float(pos, 'Misión cumplida', 'ok'); this.sparks(p.spr.position.clone().setY(1), 'accent', 12); }
        else if (e.action === 'prompt') this.float(pos, priv && e.text ? e.text.slice(0, 60) : 'Nueva misión', 'accent');
        else if (e.action === 'error') this.sparks(p.spr.position.clone().setY(1), 'crit', 8);
        return;
      }
    }
  }

  // bola de fuego del jefe al guardian; si la IP cae, golpe critico al jefe
  fireball(blocked, ip) {
    if (this.boss.dead) return;
    const from = new THREE.Vector3(0, 4, BOSS_Z + 1.5), to = new THREE.Vector3((Math.random() - 0.5) * 1.5, 2, GUARD_Z - 1.6);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshBasicMaterial({ color: 0xb04aff }));
    this.boss.cast = 1;
    this.travel(m, new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).setY(6), to), 1.1, () => {
      this.guard.flash = 1; this.sparks(to, '#b04aff', 12, 3);
      if (blocked) {
        this.boss.hp = Math.max(0, this.boss.hp - 12); this.boss.flash = 1;
        this.float(new THREE.Vector3(0, 7.5, BOSS_Z + 1), ip ? `¡Crítico! IP ${ip} bloqueada` : '¡Crítico! IP bloqueada', 'warn', 2.6);
        if (this.boss.hp <= 0) { this.boss.dead = 60; this.float(new THREE.Vector3(0, 6, BOSS_Z), 'El Intruso ha caído', 'ok', 4); }
      }
    });
  }

  // ------------------------------------------------------------------ cuadro a cuadro
  frame(dt) {
    if (this.directorOn && !this.manualUntil && !this.urgent) this.goal.az = Math.PI / 2 + Math.sin(this.t * 0.06) * 0.25;
    // antorchas que titilan
    this.fire.forEach((f, i) => { f.intensity = 26 + Math.sin(this.t * 9 + i * 2) * 3 + Math.random() * 3; });
    this.rune.rotation.z += dt * 0.2;
    // jefe: respira, levanta los brazos al lanzar, cae y vuelve
    const B = this.boss;
    B.cast = Math.max(0, (B.cast || 0) - dt * 2); B.flash = Math.max(0, B.flash - dt * 2);
    if (B.dead) { B.dead = Math.max(0, B.dead - dt); B.g.position.y += (-9 - B.g.position.y) * dt; if (!B.dead) { B.hp = 100; this.float(new THREE.Vector3(0, 6, BOSS_Z), 'El Intruso ha vuelto', 'crit', 3); } }
    else { B.g.position.y += (0 - B.g.position.y) * dt * 2; B.hp = Math.min(100, B.hp + dt * 0.4); }
    B.g.scale.y = 1 + Math.sin(this.t * 1.6) * 0.02;
    B.armL.rotation.z = 0.25 + B.cast * 1.2; B.armR.rotation.z = -0.25 - B.cast * 1.2;
    B.skin.emissive.set(B.flash > 0.1 ? 0xffffff : 0x2a0f45); B.skin.emissiveIntensity = 0.4 + B.flash;
    B.orb.rotation.y += dt * 2;
    B.label.d.querySelector('s').style.width = B.hp.toFixed(1) + '%';
    B.label.d.querySelector('small').textContent = B.dead ? 'derrotado · vuelve pronto' : `${Math.round(B.hp)}% de vida`;
    // guardian
    this.guard.flash = Math.max(0, this.guard.flash - dt * 2);
    this.guard.dome.material.opacity = 0.05 + this.guard.flash * 0.4 + (this.failed ? 0.06 * (Math.floor(this.t * 2) % 2) : 0);
    this.guard.dome.material.color.set(this.failed ? 0xe68a2e : 0xe8c55a);
    // numeros de combate agrupados: cada heroe muestra sus visitas juntas cada ~0.8 s
    this.combatT = (this.combatT || 0) - dt;
    if (this.combatT <= 0) {
      this.combatT = 0.8;
      for (const [h, q] of this.pending) if (this.labelsList.length < 140) this.float(new THREE.Vector3(h.x + (Math.random() - 0.5) * 0.6, 2.1, h.z), `+${q.n}`, q.bot === q.n ? 'dim' : 'ok', 1.6);
      this.pending.clear();
    }
    // nombres: al acercarse a un grupo, todos; de lejos, solo los caidos
    let focus = null;
    if (this.orbit.zoom > 1.5) { let best = 1e9; for (const G of this.groups.values()) { const k = Math.hypot(G.x - this.orbit.tx, G.z - this.orbit.tz); if (k < best) { best = k; focus = G; } } }
    this.refitPlaques([...this.groups.values()], Math.sin(this.view.el));
    this.sizePlaques([...this.groups.values()].map(G => [G.plaque, G.w]), FONT_K);
    for (const h of this.heroes.values()) {
      h.hpV += ((h.hpT ?? 1) - h.hpV) * Math.min(1, dt * 3); h.mpV += ((h.mpT ?? 0) - h.mpV) * Math.min(1, dt * 3);
      h.hp.scale.x = Math.max(0.001, 1.02 * h.hpV); h.mp.scale.x = Math.max(0.001, 1.02 * h.mpV);
      h.hp.material.color.set(h.hpV > 0.75 ? '#3fcf4a' : h.hpV > 0.3 ? '#e8c55a' : '#d94a3a');
      h.spr.visible = !h.dead; h.tomb.visible = h.dead;
      h.spr.position.y = 0.05 + (h.data.status === 'online' ? Math.abs(Math.sin(this.t * 2 + h.bob)) * 0.05 : 0);
      h.named = h.G === focus || h.dead;
      h.label.d.classList.toggle('down', h.dead);
    }
    for (const p of this.players.values()) {
      p.spr.position.set(p.x, 0.05 + Math.abs(Math.sin(this.t * 3)) * 0.06, p.z);
      p.aura.position.set(p.x, 0.05, p.z);
      p.aura.scale.setScalar(1 + Math.sin(this.t * 4) * 0.08);
      p.aura.material.color.set(p.s.waitKind ? 0xe68a2e : 0xe8c55a);
    }
  }

  // ------------------------------------------------------------------ camara, avisos y enfoque
  zoomFor(G) { return clamp((this.extent?.w || 20) / (G.w + 6), 1.7, 4); }
  shots() { return [...this.groups.values()].map(G => ({ x: G.x, y: 0.5, z: G.z + 1, zoom: this.zoomFor(G), el: this.view.el })).concat([{ x: 0, y: 3, z: (BOSS_Z + GUARD_Z) / 2, zoom: 2.2, el: 0.4 }]); }
  locate(kind, id) {
    if (kind === 'app' || kind === 'site') { const h = this.heroes.get(id); if (h) return { x: h.G.x, y: 0.5, z: h.G.z + 1, zoom: this.zoomFor(h.G) }; }
    if (kind === 'session') { const p = this.players.get(id); if (p) return { x: p.x, y: 1, z: p.z + 1, zoom: 3.4 }; }
    if (kind === 'district') { const G = this.groups.get(id); if (G) return { x: G.x, y: 0.5, z: G.z + 1, zoom: this.zoomFor(G) }; }
    if (kind === 'system') return { x: 0, y: 2, z: GUARD_Z, zoom: 2.6 };
    if (kind === 'security') return { x: 0, y: 3, z: BOSS_Z, zoom: 2.2 };
    return null;
  }
  tipFor(u) {
    if (u.kind === 'app' || u.kind === 'site') {
      const h = this.heroes.get(u.id); if (!h) return null;
      const a = h.data;
      return { title: a.name, body: `<b>${CLASSES[h.cls].name}</b> · ${a.kind && a.kind !== a.name ? esc(a.kind) + ' · ' : ''}${esc(h.G.a.label)}`,
        meta: `${{ online: 'vida completa', degraded: 'herido (parcial)', down: 'muerto (caído)' }[a.status] || a.status}${h.data._k !== 'site' ? ` · CPU ${(a.cpu || 0).toFixed(1)}% · RAM ${fmtBytes(a.mem || 0)}` : ''} · ${a.reqMin || 0} visitas/min`, hint: 'Clic para ver el detalle' };
    }
    if (u.kind === 'session') { const p = this.players.get(u.id); return p && { title: 'Jugador · agente de Claude Code', body: esc(p.s.activity || ''), meta: p.s.waitKind ? 'Espera su permiso o su respuesta' : { working: 'Lanzando', thinking: 'Pensando', idle: 'Descansando' }[p.s.state] || '', hint: 'Clic para ver la línea de tiempo' }; }
    if (u.kind === 'district') { const G = this.groups.get(u.id); return G && { title: G.a.label, body: `Un grupo de la banda con ${G.items.length} héroes. Su placa, delante, los nombra a todos.`, meta: G.caption, hint: 'Clic para ver el grupo' }; }
    if (u.kind === 'system') return { title: 'El Guardián', body: 'El <b>servidor</b>: protege a la banda y absorbe los ataques del jefe con su escudo.', meta: this.state?.system ? `CPU ${this.state.system.cpu.toFixed(0)}% · RAM ${this.state.system.mem.pct.toFixed(0)}% · carga ${this.state.system.load[0].toFixed(2)}` : '', hint: 'Clic para ver el servidor completo' };
    if (u.kind === 'security') return { title: 'El Intruso', body: 'Cada intento de acceso fallido es una bola de fuego; cada IP bloqueada le quita vida.', meta: `${Math.round(this.boss.hp)}% de vida`, hint: 'Clic para ver la defensa' };
    return null;
  }
}
