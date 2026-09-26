// Tema "Oficina" (3D, three.js): un piso de oficina abierto visto desde arriba, al final de la tarde.
//  - el servidor es la SALA DE SERVIDORES: racks con luces que parpadean mas rapido con la CPU, detras de vidrio
//  - junto a ella, la RECEPCION con el ascensor y los torniquetes: por ahi entra todo
//  - cada cuenta es un DEPARTAMENTO con su alfombra de color, mamparas de vidrio y su DIRECTORIO al frente,
//    que nombra a todos sus puestos (se ubica cualquier proyecto sin hacer clic); al acercarse, cada puesto
//    lleva su nombre encima
//  - cada servicio es un ESCRITORIO con su empleado: teclea mas rapido con mas CPU; si el servicio cae, el
//    empleado se va y el monitor queda en rojo; a medias, el monitor en ambar
//  - cada sitio es un puesto flexible con una laptop; sobre cada monitor, su cartel en pixel art
//  - cada visita es un AVION DE PAPEL que sale del ascensor y aterriza en su escritorio (gris si es un robot);
//    un error 5xx es un papel rojo arrugado que vuela a la papelera
//  - cada intento de acceso es un INTRUSO que llega a los torniquetes y lo rebotan; si la IP cae, seguridad lo saca
//  - cada sesion de Claude Code es un COMPANERO con laptop que va de escritorio en escritorio en su
//    departamento; si espera su permiso, se queda quieto con la mano levantada
// Regla de oro: una oficina tranquila y ordenada; lo que pasa se ve en la gente, las pantallas y los papeles.
import { Stage3D, THREE, color, clamp, billboard, groupsOf, layoutKeyOf, packRows, iconURL, plaqueList } from '/js/stage3d.js';
import { signCanvas } from '/js/sprites.js';
import { esc, fmtBytes } from '/js/hud.js';
import { accountCaption } from '/js/accounts.js';

const SP = 2.4, COLS = 5, FONT_K = 0.36, EL = 0.85;
const SHIRTS = ['#4f7cc8', '#c86a4f', '#5aa06a', '#8a6fc8', '#d0a040', '#4fa8b8', '#c85a8a', '#7a8a9a'];
const SKIN = ['#f1c9a5', '#d9a47c', '#b07a52', '#8a5a3a', '#e8b890'];
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: color(c), roughness: 0.7, ...o });

// pantalla del monitor: lineas de codigo que se desplazan (el mismo canvas sirve de brillo)
function screenCanvas(seed) {
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#0d1a2a'; cx.fillRect(0, 0, 32, 64);
  let r = seed || 7;
  for (let y = 2; y < 64; y += 4) { r = (r * 1103515245 + 12345) & 0x7fffffff; const ind = (r % 3) * 3, len = 6 + (r >> 4) % 18; cx.fillStyle = ['#7fb8ff', '#9fe0a0', '#ffd27f', '#c8d2e0'][(r >> 8) % 4]; cx.fillRect(2 + ind, y, Math.min(len, 28 - ind), 2); }
  return cv;
}
function wood() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const cx = cv.getContext('2d');
  for (let y = 0; y < 64; y += 8) { cx.fillStyle = (y / 8) % 2 ? '#8a6a4a' : '#94734f'; cx.fillRect(0, y, 64, 8); cx.fillStyle = '#6f5238'; cx.fillRect(((y * 13) % 48), y, 1, 8); cx.fillRect(0, y + 7, 64, 1); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default class Oficina3D extends Stage3D {
  constructor(el, opts) {
    super(el, opts);
    this.fov = 30; this.fitScale = 1; this.orbitSpeed = 0;
    this.desks = new Map(); this.depts = new Map(); this.mates = new Map();
    this.layoutKey = '';
    this.view = { az: Math.PI / 2, el: EL, dist: 50, tx: 0, ty: 0, tz: 0, zoom: 1 };
    this.orbit = { ...this.view }; this.goal = { ...this.view };
  }

  async build() {
    const S = this.scene;
    S.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3228, 0.85));
    const sun = new THREE.DirectionalLight(0xffe2b8, 0.9); sun.position.set(-14, 26, 16); S.add(sun);
    const t = wood(); t.repeat.set(50, 50);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; S.add(floor);
    this.floor = new THREE.Group(); S.add(this.floor);
  }

  // ------------------------------------------------------------------ el piso
  layout(state) {
    const key = layoutKeyOf(state);
    if (key === this.layoutKey) return;
    if (key !== this.realKey) { this.realKey = key; this.refits = 0; }
    this.layoutKey = key;
    this.floor.clear();
    for (const d of this.depts.values()) d.plaque.remove();
    for (const k of this.desks.values()) k.label.remove();
    if (this.srvLabel) this.srvLabel.remove();
    this.depts.clear(); this.desks.clear();
    this.pickables = this.pickables.filter(p => p.userData.kind === 'session');
    const list = groupsOf(state);
    list.forEach(D => { D.cols = Math.min(D.items.length, clamp(Math.ceil(Math.sqrt(D.items.length * 1.5)), 2, COLS)); D.rows = Math.ceil(D.items.length / D.cols); D.w = D.cols * SP + 1.2; D.d = D.rows * SP + 1.6; });
    const plaqueE = D => (FONT_K * 1.3 * this.plaqueLines(D.items.length, D.w, FONT_K) + 0.5) / Math.sin(EL);
    const plaqueD = D => (D.plaqueU = this.plaqueUnits(D.a.id, plaqueE(D)));
    const CW = 8;
    const best = packRows(list, { w: D => D.w, h: D => D.d + plaqueD(D) + 1, gap: 1.6, lead: CW + 1.6, aspect: this.areaAspect() * Math.sin(EL) });
    let z = 0;
    best.rows.forEach((row, ri) => {
      let x = -best.widths[ri] / 2;
      if (ri === 0) { this.buildCore(x + CW / 2, z + 3.4, CW); x += CW + 1.6; }
      for (const D of row) { D.x = x + D.w / 2; D.z = z + D.d / 2; x += D.w + 1.6; this.buildDept(D); }
      z += best.heights[ri];
    });
    this.extent = { w: best.W, z0: -0.5, z1: z };
    this.fit(true);
  }
  fit(snap) {
    const E = this.extent; if (!E) return;
    const depth = (E.z1 - E.z0) * Math.sin(EL) + 4 * Math.cos(EL);
    this.setView({ dist: this.distToFit(E.w + 2, depth + 1) * 1.02, tz: (E.z0 + E.z1) / 2, ty: 0.6 }, snap);
  }
  setInsets(ins) { super.setInsets(ins); if (this.extent) this.fit(false); }

  // sala de servidores (arriba) y recepcion con ascensor y torniquetes (abajo)
  buildCore(x, z, W) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const tile = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 4), mat('#c8ccd2', { roughness: 0.5 })); tile.position.set(0, 0.03, -1.4);
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false });
    const gw = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, 0.06), glass); gw.position.set(0, 0.8, 0.6);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, 0.15), mat('#5a6270')); back.position.set(0, 0.8, -3.4);
    g.add(tile, gw, back);
    this.racks = [];
    for (let i = 0; i < 4; i++) {
      const rx = -W / 2 + 1.2 + i * 1.5;
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.8), mat('#1e232c', { metalness: 0.5, roughness: 0.4 })); rack.position.set(rx, 1.05, -1.8);
      rack.userData = { kind: 'system', id: 'root' }; this.pickables.push(rack);
      g.add(rack);
      const leds = [];
      for (let k = 0; k < 8; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0x59e08a })); l.position.set(rx - 0.28 + (k % 4) * 0.18, 0.5 + Math.floor(k / 4) * 1.1 + (k % 2) * 0.15, -1.39); g.add(l); leds.push(l); }
      this.racks.push({ rack, leds, ph: Math.random() * 6 });
    }
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.7), mat('#e8eaee')); ac.position.set(W / 2 - 0.9, 0.75, -2.7); g.add(ac);
    // recepcion
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.7), mat('#f2efe8')); desk.position.set(-W / 2 + 2, 0.45, 2.2);
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.08, 0.8), mat('#8a6a4a')); deskTop.position.set(-W / 2 + 2, 0.94, 2.2);
    g.add(desk, deskTop, this.person('#4f7cc8', '#d9a47c', -W / 2 + 2, 1.9, 0.5));
    // ascensor (la entrada) y torniquetes
    const lift = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.2), mat('#9aa3ad', { metalness: 0.7, roughness: 0.3 })); lift.position.set(W / 2 - 1.2, 1.1, 3.6);
    const liftLine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.1, 0.22), mat('#5a6270')); liftLine.position.set(W / 2 - 1.2, 1.1, 3.6);
    g.add(lift, liftLine);
    this.gates = [];
    for (const dx of [-0.6, 0.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.5), mat('#3a414c', { emissive: color('#59e08a'), emissiveIntensity: 0.2 })); post.position.set(W / 2 - 1.2 + dx, 0.45, 2.1);
      g.add(post); this.gates.push(post);
    }
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.5, 12, 1, true), mat('#7a8290', { side: THREE.DoubleSide })); bin.position.set(-W / 2 + 0.5, 0.25, 0.2); g.add(bin);
    this.floor.add(g);
    this.core = { x, z, W, lift: new THREE.Vector3(x + W / 2 - 1.2, 1.2, z + 3.2), gate: new THREE.Vector3(x + W / 2 - 1.2, 0, z + 2.1), bin: new THREE.Vector3(x - W / 2 + 0.5, 0.6, z + 0.2), flash: 0 };
    this.srvLabel = this.label('w3-plaque w3-srv', '<b>Sala de servidores</b><small></small>', new THREE.Vector3(x, 0.05, z + 4.3));
    this.srvLabel.d.dataset.go = 'system:root';
  }

  person(shirt, skin, x, z, sit = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.62, 10), mat(shirt)); body.position.y = 0.72 + sit * 0.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(skin)); head.position.y = 1.2 + sit * 0.05;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.24), mat('#2e3440')); legs.position.y = 0.21;
    g.add(body, head, legs);
    g.userData.parts = { body, head };
    return g;
  }

  buildDept(D) {
    const { a, items } = D;
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(D.w, 0.05, D.d), mat(color(a.color).lerp(color('#6a7280'), 0.6).getStyle(), { roughness: 1 }));
    carpet.position.set(D.x, 0.025, D.z); carpet.userData = { kind: 'district', id: a.id };
    this.floor.add(carpet); this.pickables.push(carpet);
    // mamparas de vidrio atras y a los lados, con un canto del color del departamento
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false });
    const edge = new THREE.MeshBasicMaterial({ color: color(a.color) });
    const pane = (x, z, w, d) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, d), glass); p.position.set(x, 0.65, z); const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d + 0.02), edge); e.position.set(x, 1.32, z); this.floor.add(p, e); };
    pane(D.x, D.z - D.d / 2, D.w, 0.06); pane(D.x - D.w / 2, D.z, 0.06, D.d); pane(D.x + D.w / 2, D.z, 0.06, D.d);
    // plantas en las esquinas del frente
    for (const sx of [-1, 1]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.35, 10), mat('#e8e2d6')); pot.position.set(D.x + sx * (D.w / 2 - 0.35), 0.18, D.z + D.d / 2 - 0.35);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat('#4f8a4a', { flatShading: true })); leaf.position.set(pot.position.x, 0.62, pot.position.z);
      this.floor.add(pot, leaf);
    }
    const nA = items.filter(x => x._k === 'app').length;
    D.caption = accountCaption(a, nA, items.length - nA);
    D.aisle = { x0: D.x - D.w / 2 + 0.8, x1: D.x + D.w / 2 - 0.8, z: D.z + D.d / 2 - 0.55 };
    items.forEach((it, i) => this.addDesk(it, D, D.x - D.w / 2 + 0.6 + SP / 2 + (i % D.cols) * SP, D.z - D.d / 2 + 0.3 + SP / 2 + Math.floor(i / D.cols) * SP));
    D.plaque = this.label('w3-plaque', `<b style="border-color:${a.color}">${esc(a.label)}</b><small>${esc(D.caption)}</small><div class="fishlist"></div>`, new THREE.Vector3(D.x, 0.05, D.z + D.d / 2 + 0.25));
    D.plaque.d.dataset.go = 'district:' + a.id;
    this.depts.set(a.id, D);
    this.fillPlaque(D);
  }
  fillPlaque(D) {
    D.plaque.d.querySelector('.fishlist').innerHTML = plaqueList(D.items.map(it => ({ ...it, ...(this.desks.get(it.id)?.data || {}) })), it => iconURL('sign:' + (it.icon || 'web'), () => signCanvas(it.icon || 'web', 2)));
  }

  addDesk(it, D, x, z) {
    const site = it._k === 'site';
    const h = hash(it.id + it.name);
    const g = new THREE.Group(); g.position.set(x, 0.05, z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.8), mat('#f2efe8', { roughness: 0.5 })); top.position.y = 0.74;
    const legM = mat('#4a505a', { metalness: 0.6 });
    for (const [lx, lz] of [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), legM); l.position.set(lx, 0.36, lz); g.add(l); }
    const scr = new THREE.CanvasTexture(screenCanvas(h)); scr.wrapT = THREE.RepeatWrapping; scr.repeat.set(1, 0.5); scr.magFilter = THREE.NearestFilter; scr.colorSpace = THREE.SRGBColorSpace;
    const screenM = new THREE.MeshStandardMaterial({ color: 0xffffff, map: scr, emissiveMap: scr, emissive: 0xffffff, emissiveIntensity: 0.9 });
    let screen;
    if (site) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.36), mat('#b8bec8', { metalness: 0.6 })); base.position.set(0, 0.79, 0.05);
      screen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.3), screenM); screen.position.set(0, 0.95, -0.12); screen.rotation.x = -0.25;
      g.add(base);
    } else {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), legM); stand.position.set(0, 0.9, -0.25);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 0.05), mat('#1e232c')); frame.position.set(0, 1.25, -0.27);
      screen = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.42), screenM); screen.position.set(0, 1.25, -0.24);
      const kb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.16), mat('#2e3440')); kb.position.set(0, 0.79, 0.05);
      g.add(stand, frame, kb);
    }
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), mat('#2e3440')); chair.position.set(0, 0.45, 0.62);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06), mat('#2e3440')); chairBack.position.set(0, 0.75, 0.86);
    g.add(top, screen, chair, chairBack);
    let worker = null;
    if (!site) { worker = this.person(SHIRTS[h % SHIRTS.length], SKIN[(h >>> 4) % SKIN.length], 0, 0.62, 1); worker.rotation.y = Math.PI; g.add(worker); }
    const sign = billboard(signCanvas(it.icon || 'web', 6), 0.55); sign.position.set(0, site ? 1.45 : 1.8, -0.27);
    g.add(sign);
    g.userData = { kind: site ? 'site' : 'app', id: it.id };
    this.floor.add(g); this.pickables.push(g);
    const k = { g, screen, screenM, scr, worker, data: it, site, D, x, z, typing: 0, lit: 0 };
    k.label = this.label('w3-item', esc(it.name), () => k.named ? new THREE.Vector3(x, 2.3, z) : null);
    this.desks.set(it.id, k);
  }

  // ------------------------------------------------------------------ estado
  update(state) {
    this.state = state;
    this.layout(state);
    const replate = new Set();
    for (const x of [...state.apps, ...(state.sites || [])]) {
      const k = this.desks.get(x.id);
      if (!k) continue;
      const prev = k.data.status;
      k.data = { ...x, _k: k.data._k };
      if (prev && prev !== x.status) { replate.add(k.D); if (x.status === 'down') this.float(new THREE.Vector3(k.x, 2.4, k.z), `${x.name}: fuera de servicio`, 'crit'); else if (prev === 'down') this.float(new THREE.Vector3(k.x, 2.4, k.z), 'Volvió a su puesto', 'ok'); }
    }
    replate.forEach(D => this.fillPlaque(D));
    const s = state.system;
    if (s && this.srvLabel) this.srvLabel.d.querySelector('small').textContent = `CPU ${s.cpu.toFixed(0)}% · memoria ${s.mem.pct.toFixed(0)}% · disco ${Math.round(s.disk?.pct ?? 0)}%`;
    this.failed = (state.keys || []).some(k => k.state === 'failed');
    this.syncMates(state.sessions || []);
  }

  syncMates(sessions) {
    const seen = new Set(), per = {};
    for (const s of sessions) {
      const D = this.depts.get(s.account) || [...this.depts.values()][0];
      if (!D) continue;
      seen.add(s.id);
      let m = this.mates.get(s.id);
      if (!m) {
        const g = this.person('#d97a3a', '#e8b890', D.aisle.x0, D.aisle.z);
        const lap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.24), mat('#b8bec8', { metalness: 0.6 })); lap.position.set(0, 0.95, 0.25);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.07), mat('#d97a3a')); arm.position.set(0.24, 1.3, 0); arm.visible = false;
        g.add(lap, arm);
        g.traverse(o => { o.userData = { ...o.userData, kind: 'session', id: s.id }; });
        this.scene.add(g); this.pickables.push(g);
        m = { g, arm, x: D.aisle.x0, z: D.aisle.z, tx: D.aisle.x0, tz: D.aisle.z, wait: 0 };
        m.label = this.label('w3-agent', '', () => g.position.clone().setY(1.8));
        this.mates.set(s.id, m);
      }
      m.s = s; m.D = D;
      per[D.a.id] = (per[D.a.id] || 0) + 1; m.slot = per[D.a.id] - 1;
      m.label.d.innerHTML = s.waitKind ? 'Compañero <em>ESPERA SU PERMISO</em>' : '';
    }
    for (const [id, m] of this.mates) if (!seen.has(id)) { this.scene.remove(m.g); m.label.remove(); this.pickables = this.pickables.filter(p => p !== m.g); this.mates.delete(id); }
  }

  // ------------------------------------------------------------------ eventos
  onEvent(e, priv) {
    switch (e.kind) {
      case 'http': {
        const k = this.desks.get(e.app || e.site);
        if (!k || this.fx.length > 220) return;
        return this.plane(k, e.bot, e.status >= 500);
      }
      case 'attack': return this.intruder(false);
      case 'block': return this.intruder(true, priv ? e.ip : null);
      case 'login': return this.core && this.float(this.core.lift.clone().setY(2.6), priv && e.user ? `Llegó ${e.user}` : 'Llegó el administrador', 'ok');
      case 'mail': return this.core && this.envelope(e.dir);
      case 'deploy': {
        const k = this.desks.get(e.app);
        const T = { building: ['Instalando equipo nuevo', 'warn'], ready: ['Equipo listo', 'ok'], error: ['Falló la instalación', 'crit'], canceled: ['Cancelado', 'dim'] }[e.action];
        if (k && T) { this.float(new THREE.Vector3(k.x, 2.4, k.z), T[0], T[1]); if (e.action === 'ready') this.sparks(new THREE.Vector3(k.x, 1.4, k.z), 'ok', 10); }
        return;
      }
      case 'pm2': { const k = this.desks.get(e.app); if (k && e.action !== 'down') this.float(new THREE.Vector3(k.x, 2.4, k.z), 'Reinició su equipo', 'warn'); return; }
      case 'domain': { const D = this.depts.get(e.account); if (D) this.float(new THREE.Vector3(D.x, 2, D.z), ({ added: 'Puesto nuevo', removed: 'Se liberó un puesto', changed: 'Cambió un sitio' }[e.action] || '') + (priv && e.domain ? ` · ${e.domain}` : ''), e.action === 'removed' ? 'warn' : 'ok'); return; }
      case 'claude': {
        const m = this.mates.get(e.sid) || [...this.mates.entries()].find(([k]) => e.sid && k.startsWith(e.sid))?.[1];
        if (!m) return;
        const p = m.g.position.clone().setY(2.2);
        if (e.action === 'permission') { this.attention(m.g.position, 3); this.float(p, 'Levanta la mano: necesita su permiso', 'warn'); }
        else if (e.action === 'done') this.float(p, 'Tarea entregada', 'ok');
        else if (e.action === 'prompt') this.float(p, priv && e.text ? e.text.slice(0, 60) : 'Nuevo encargo', 'accent');
        else if (e.action === 'error') this.sparks(m.g.position.clone().setY(1.2), 'crit', 8);
        return;
      }
    }
  }

  // avion de papel: del ascensor al escritorio
  plane(k, bot, bad) {
    if (!this.core) return;
    const g = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 3), new THREE.MeshStandardMaterial({ color: bot ? 0x9aa3ad : 0xffffff, flatShading: true, emissive: 0xffffff, emissiveIntensity: bot ? 0 : 0.15 }));
    g.scale.set(1, 1, 0.3);
    const a = this.core.lift.clone(), b = new THREE.Vector3(k.x, 1.1, k.z);
    const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).setY(4 + Math.random()), b);
    const secs = 1.6 + a.distanceTo(b) / 18;
    this.addFx(g, f => {
      const t = f.age / secs;
      if (t >= 1) {
        k.lit = 1;
        if (bad) this.crumple(k);
        return false;
      }
      const p = curve.getPoint(t), q = curve.getPoint(Math.min(1, t + 0.02));
      g.position.copy(p); g.lookAt(q); g.rotateX(Math.PI / 2);
      return true;
    });
  }
  crumple(k) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ color: 0xd9412b, flatShading: true }));
    const a = new THREE.Vector3(k.x, 1.2, k.z), b = this.core.bin;
    this.travel(ball, new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).setY(5), b), 1.4);
  }
  envelope(dir) {
    const env = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.22), new THREE.MeshStandardMaterial({ color: dir === 'bounce' ? 0xf0a040 : 0xf4efe0 }));
    const lift = this.core.lift, srv = new THREE.Vector3(this.core.x, 1.6, this.core.z - 1.8);
    const [a, b] = dir === 'in' ? [lift, srv] : [srv, lift];
    this.travel(env, new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).setY(3.5), b), 2);
  }
  // intruso: sale del ascensor, choca con los torniquetes y vuelve; si la IP cae, seguridad lo acompana
  intruder(blocked, ip) {
    if (!this.core) return;
    const C = this.core;
    const g = this.person('#3a1a1a', '#8a5a3a', C.lift.x, C.lift.z);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 10), mat('#1a1a1a')); hat.position.y = 1.32; g.add(hat);
    const from = new THREE.Vector3(C.lift.x + (Math.random() - 0.5) * 0.6, 0, C.lift.z), to = new THREE.Vector3(C.gate.x, 0, C.gate.z + 0.45);
    this.addFx(g, (f, dt) => {
      if (!f.hit) {
        const t = Math.min(1, f.age / 1.8);
        g.position.lerpVectors(from, to, t); g.position.y = Math.abs(Math.sin(f.age * 8)) * 0.04;
        if (t >= 1) { f.hit = f.age; C.flash = 1; if (blocked) this.float(to.clone().setY(2.2), ip ? `Acceso denegado · ${ip}` : 'Acceso denegado · IP bloqueada', 'crit'); }
        return true;
      }
      const t = (f.age - f.hit) / 1.8;
      g.position.lerpVectors(to, from, Math.min(1, t)); g.rotation.y = Math.PI;
      return t < 1;
    });
  }

  // ------------------------------------------------------------------ cuadro a cuadro
  frame(dt) {
    if (this.directorOn && !this.manualUntil && !this.urgent) this.goal.az = Math.PI / 2 + Math.sin(this.t * 0.06) * 0.2;
    const s = this.state?.system;
    const blink = Math.floor(this.t * 3) % 2 === 0;
    // racks: luces que titilan mas rapido con la CPU; ambar si falla un servicio clave
    if (this.racks) {
      const speed = 2 + (s ? s.cpu / 8 : 2);
      for (const r of this.racks) r.leds.forEach((l, i) => { const on = Math.sin(this.t * speed + i * 1.7 + r.ph) > -0.2; l.material.color.set(this.failed && i === 0 ? (blink ? '#f0a040' : '#402a10') : on ? '#59e08a' : '#1a3a24'); });
    }
    if (this.core) {
      this.core.flash = Math.max(0, this.core.flash - dt * 1.5);
      for (const p of this.gates) { p.material.emissive.set(this.core.flash > 0.05 ? '#ff3b2e' : '#59e08a'); p.material.emissiveIntensity = 0.2 + this.core.flash * 1.2; }
    }
    let focus = null;
    if (this.orbit.zoom > 1.5) { let best = 1e9; for (const D of this.depts.values()) { const k = Math.hypot(D.x - this.orbit.tx, D.z - this.orbit.tz); if (k < best) { best = k; focus = D; } } }
    this.refitPlaques([...this.depts.values()], Math.sin(EL));
    this.sizePlaques([...this.depts.values()].map(D => [D.plaque, D.w]).concat(this.srvLabel && this.core ? [[this.srvLabel, this.core.W, 150]] : []), FONT_K);
    for (const k of this.desks.values()) {
      const a = k.data, st = a.status;
      k.lit = Math.max(0, k.lit - dt * 1.5);
      const cpu = a.cpu || 0;
      // pantalla: el codigo corre con la CPU (en los sitios, con las visitas)
      k.scr.offset.y -= dt * (st === 'down' ? 0 : k.site ? 0.05 + Math.min(1, (a.reqMin || 0) / 30) * 0.4 : 0.05 + cpu / 60);
      k.screenM.emissive.set(st === 'down' ? (blink ? '#ff3b2e' : '#5a1010') : st === 'degraded' ? '#f0a040' : '#ffffff');
      k.screenM.emissiveIntensity = st === 'down' ? 1 : 0.7 + k.lit * 0.8;
      if (k.worker) {
        k.worker.visible = st !== 'down';
        const p = k.worker.userData.parts;
        p.head.position.y = 1.25 + (st === 'online' ? Math.abs(Math.sin(this.t * (3 + cpu / 6) + k.x)) * 0.03 : 0);
        p.body.rotation.x = st === 'degraded' ? 0.35 : 0; // a medias: se desploma en la silla
      }
      k.named = k.D === focus || st === 'down';
      k.label.d.classList.toggle('down', st === 'down');
    }
    for (const m of this.mates.values()) {
      const s2 = m.s, waiting = !!s2.waitKind, D = m.D;
      if (waiting) { m.tx = clamp(D.aisle.x0 + m.slot * 0.8, D.aisle.x0, D.aisle.x1); m.tz = D.aisle.z; }
      else {
        m.wait -= dt;
        if (m.wait <= 0) { const it = D.items.length ? this.desks.get(D.items[Math.floor(Math.random() * D.items.length)].id) : null; if (it) { m.tx = it.x + 0.95; m.tz = it.z + 0.6; } m.wait = 3 + Math.random() * 4; }
      }
      const dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz), step = 1.2 * dt;
      if (d > step) { m.x += dx / d * step; m.z += dz / d * step; m.g.rotation.y = Math.atan2(dx, dz); }
      m.g.position.set(m.x, d > step ? Math.abs(Math.sin(this.t * 9)) * 0.04 : 0, m.z);
      m.arm.visible = waiting;
    }
  }

  // ------------------------------------------------------------------ camara, avisos y enfoque
  zoomFor(D) { return clamp((this.extent?.w || 20) / (D.w + 6), 1.7, 4); }
  shots() { return [...this.depts.values()].map(D => ({ x: D.x, y: 0.5, z: D.z + 1, zoom: this.zoomFor(D), el: EL })); }
  locate(kind, id) {
    if (kind === 'app' || kind === 'site') { const k = this.desks.get(id); if (k) return { x: k.D.x, y: 0.5, z: k.D.z + 1, zoom: this.zoomFor(k.D) }; }
    if (kind === 'session') { const m = this.mates.get(id); if (m) return { x: m.x, y: 0.5, z: m.z, zoom: 3.4 }; }
    if (kind === 'district') { const D = this.depts.get(id); if (D) return { x: D.x, y: 0.5, z: D.z + 1, zoom: this.zoomFor(D) }; }
    if ((kind === 'system' || kind === 'security') && this.core) return { x: this.core.x, y: 1, z: this.core.z, zoom: 2.8 };
    return null;
  }
  tipFor(u) {
    if (u.kind === 'app' || u.kind === 'site') {
      const k = this.desks.get(u.id); if (!k) return null;
      const a = k.data;
      return { title: a.name, body: `${a.kind && a.kind !== a.name ? `<b>${esc(a.kind)}</b> · ` : ''}${k.site ? 'puesto con laptop (sitio)' : 'escritorio con su empleado (servicio)'} · ${esc(k.D.a.label)}`,
        meta: `${{ online: 'trabajando', degraded: 'a medias (parcial)', down: 'FUERA DE SERVICIO (caído)' }[a.status] || a.status}${!k.site ? ` · CPU ${(a.cpu || 0).toFixed(1)}% · RAM ${fmtBytes(a.mem || 0)}` : ''} · ${a.reqMin || 0} visitas/min`, hint: 'Clic para ver el detalle' };
    }
    if (u.kind === 'session') { const m = this.mates.get(u.id); return m && { title: 'Compañero · agente de Claude Code', body: esc(m.s.activity || ''), meta: m.s.waitKind ? 'Tiene la mano levantada: espera su permiso' : { working: 'Trabajando', thinking: 'Pensando', idle: 'En pausa' }[m.s.state] || '', hint: 'Clic para ver la línea de tiempo' }; }
    if (u.kind === 'district') { const D = this.depts.get(u.id); return D && { title: D.a.label, body: `Un departamento con ${D.items.length} puestos. Su directorio, delante, los nombra a todos.`, meta: D.caption, hint: 'Clic para ver el departamento' }; }
    if (u.kind === 'system') return { title: 'Sala de servidores', body: 'El <b>servidor</b>: las luces de los racks titilan más rápido con más CPU. Por la recepción entra todo: visitas, correo y los intentos de acceso, que se quedan en los torniquetes.', meta: this.state?.system ? `CPU ${this.state.system.cpu.toFixed(0)}% · RAM ${this.state.system.mem.pct.toFixed(0)}% · carga ${this.state.system.load[0].toFixed(2)}` : '', hint: 'Clic para ver el servidor completo' };
    return null;
  }
}
