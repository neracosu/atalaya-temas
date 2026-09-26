// Tema "Villa" (3D, three.js): un reino en miniatura de piezas lisas, como un diorama de juego de mesa.
//  - el servidor es el CASTILLO; cada cuenta es un PUEBLO amurallado con su estandarte
//  - cada servicio es una casa de piedra con chimenea (humo = CPU, fuego = caido, ventanas = visitas);
//    cada sitio es una cabana de paja; sobre la puerta, su cartel pixel
//  - delante de cada pueblo, su TABLON nombra a todas sus casas (se ubica sin hacer clic); al acercarse,
//    cada casa lleva su nombre encima
//  - cada visita es un aldeano que llega por el camino, pasa por el castillo y va a su casa (los robots son pajaros)
//  - cada intento de acceso es un slime que golpea la muralla del castillo; si la IP cae, el slime se deshace
//  - cada sesion de Claude Code es un mago en la plaza de su pueblo ("!" = espera su permiso)
// Regla de oro: nada de numeros sobre el mapa; todo se cuenta con casas, humo, fuego y gente.
import { Stage3D, THREE, color, clamp, billboard, rowsCanvas, groupsOf, layoutKeyOf, packRows, iconURL, plaqueList } from '/js/stage3d.js';
import { signCanvas } from '/js/sprites.js';
import { esc, fmtBytes } from '/js/hud.js';
import { accountCaption } from '/js/accounts.js';

const SP = 2.4, COLS = 6, FONT_K = 0.36, EL = 0.78;
const BIRD = [['.k...k.', 'kk.k.kk', '..kkk..'], ['.......', '.kkkkk.', 'k..k..k']];
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: color(c), roughness: 0.85, flatShading: true, ...o });

export default class Villa3D extends Stage3D {
  constructor(el, opts) {
    super(el, opts);
    this.fov = 30; this.fitScale = 1; this.orbitSpeed = 0;
    this.houses = new Map(); this.towns = new Map(); this.mages = new Map();
    this.layoutKey = '';
    this.view = { az: Math.PI / 2, el: EL, dist: 50, tx: 0, ty: 0, tz: 0, zoom: 1 };
    this.orbit = { ...this.view }; this.goal = { ...this.view };
  }

  async build() {
    const S = this.scene;
    S.background = color('#2b4a26');
    S.add(new THREE.HemisphereLight(0xfff4d6, 0x2b4a26, 0.8));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(-15, 30, 12); S.add(sun);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), std('#4f7a3a', { roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; S.add(grass);
    // arboles sueltos alrededor (fijos por semilla)
    let r = 12345; const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    this.trees = new THREE.Group(); S.add(this.trees);
    const trunkM = std('#6b4a2b'), leafM = [std('#3f6b2e'), std('#2f5a26'), std('#5a8a3a')];
    for (let i = 0; i < 260; i++) {
      const t = new THREE.Group(); t.position.set((rnd() - 0.5) * 120, 0, (rnd() - 0.5) * 90);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6), trunkM); tr.position.y = 0.4;
      const lf = new THREE.Mesh(new THREE.ConeGeometry(0.7 + rnd() * 0.4, 1.6 + rnd(), 7), leafM[i % 3]); lf.position.y = 1.5;
      t.add(tr, lf); this.trees.add(t);
    }
    this.world = new THREE.Group(); S.add(this.world);
  }

  // ------------------------------------------------------------------ el reino
  layout(state) {
    const key = layoutKeyOf(state);
    if (key === this.layoutKey) return;
    if (key !== this.realKey) { this.realKey = key; this.refits = 0; }
    this.layoutKey = key;
    this.world.clear();
    for (const t of this.towns.values()) t.plaque.remove();
    for (const h of this.houses.values()) h.label.remove();
    if (this.castleLabel) this.castleLabel.remove();
    this.towns.clear(); this.houses.clear();
    this.pickables = this.pickables.filter(p => p.userData.kind === 'session');
    const list = groupsOf(state);
    list.forEach(T => { T.cols = Math.min(T.items.length, clamp(Math.ceil(Math.sqrt(T.items.length * 1.6)), 2, COLS)); T.rows = Math.ceil(T.items.length / T.cols); T.w = T.cols * SP + 1.4; T.d = T.rows * SP + 2; });
    const plaqueE = T => (FONT_K * 1.3 * this.plaqueLines(T.items.length, T.w, FONT_K) + 0.5) / Math.sin(EL);
    const plaqueD = T => (T.plaqueU = this.plaqueUnits(T.a.id, plaqueE(T)));
    const CW = 7;
    const best = packRows(list, { w: T => T.w, h: T => T.d + plaqueD(T) + 1.2, gap: 2, lead: CW + 2, aspect: this.areaAspect() * Math.sin(EL) });
    let z = 0;
    best.rows.forEach((row, ri) => {
      let x = -best.widths[ri] / 2;
      if (ri === 0) { this.buildCastle(x + CW / 2, z + 3.2); x += CW + 2; }
      for (const T of row) { T.x = x + T.w / 2; T.z = z + T.d / 2; x += T.w + 2; this.buildTown(T); }
      z += best.heights[ri];
    });
    // camino de tierra por el sur, de donde llegan los aldeanos
    this.road = { x0: -best.W / 2 - 6, z: -1.2 };
    const road = new THREE.Mesh(new THREE.PlaneGeometry(best.W + 12, 1.1), std('#a88a5a', { roughness: 1 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, this.road.z); this.world.add(road);
    this.extent = { w: best.W, z0: -2, z1: z };
    // los arboles no crecen dentro del reino
    for (const t of this.trees.children) t.visible = !(Math.abs(t.position.x) < best.W / 2 + 7 && t.position.z > -4 && t.position.z < z + 1.5);
    this.fit(true);
  }
  fit(snap) {
    const E = this.extent; if (!E) return;
    const depth = (E.z1 - E.z0) * Math.sin(EL) + 6 * Math.cos(EL);
    this.setView({ dist: this.distToFit(E.w + 2, depth + 1) * 1.02, tz: (E.z0 + E.z1) / 2, ty: 0.8 }, snap);
  }
  setInsets(ins) { super.setInsets(ins); if (this.extent) this.fit(false); }

  buildCastle(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const stone = std('#b8b0a0'), dark = std('#8a8274'), roofM = std('#5a6fb0');
    const keep = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 2.6), stone); keep.position.y = 1.7;
    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.6, 4), roofM); keepRoof.position.y = 4.2; keepRoof.rotation.y = Math.PI / 4;
    g.add(keep, keepRoof);
    const towers = [];
    for (const [tx, tz] of [[-2.6, -2.2], [2.6, -2.2], [-2.6, 2.2], [2.6, 2.2]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 2.8, 10), stone); t.position.set(tx, 1.4, tz);
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 10), roofM); c.position.set(tx, 3.4, tz);
      g.add(t, c); towers.push(t);
    }
    // murallas con almenas
    const walls = [];
    for (const [wx, wz, w, d] of [[0, -2.2, 4.4, 0.4], [0, 2.2, 4.4, 0.4], [-2.6, 0, 0.4, 3.6], [2.6, 0, 0.4, 3.6]]) {
      const wl = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), dark); wl.position.set(wx, 0.7, wz); g.add(wl); walls.push(wl);
      const n = Math.round(Math.max(w, d) / 0.6);
      for (let i = 0; i < n; i += 2) { const m = new THREE.Mesh(new THREE.BoxGeometry(w > d ? 0.3 : 0.4, 0.3, w > d ? 0.4 : 0.3), dark); m.position.set(wx + (w > d ? -w / 2 + 0.3 + i * 0.6 : 0), 1.55, wz + (w > d ? 0 : -d / 2 + 0.3 + i * 0.6)); g.add(m); }
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.1), std('#5a3a22')); gate.position.set(0, 0.55, 2.42); g.add(gate);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), std('#6b4a2b')); pole.position.set(0, 5.6, 0);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ color: color('#e0b04a'), side: THREE.DoubleSide })); flag.position.set(0.45, 6.1, 0);
    g.add(pole, flag);
    [keep, ...towers, ...walls].forEach(m => { m.userData = { kind: 'system', id: 'root' }; this.pickables.push(m); });
    this.world.add(g);
    this.castle = { g, x, z, walls, flag, flash: 0, gate: new THREE.Vector3(x, 0.3, z + 3) };
    this.castleLabel = this.label('w3-plaque w3-castle', '<b>Castillo · servidor</b><small></small>', new THREE.Vector3(x, 0.05, z + 3.6));
    this.castleLabel.d.dataset.go = 'system:root';
  }

  buildTown(T) {
    const { a, items } = T;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(T.w, 0.1, T.d), std(color('#6f9a4a').lerp(color(a.color), 0.12).getStyle(), { roughness: 1 }));
    ground.position.set(T.x, 0.05, T.z); ground.userData = { kind: 'district', id: a.id };
    this.world.add(ground); this.pickables.push(ground);
    // muralla baja con un hueco al frente para la puerta
    const wm = std('#a39a88');
    const seg = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), wm); m.position.set(x, 0.35, z); this.world.add(m); };
    seg(T.x, T.z - T.d / 2, T.w, 0.25); seg(T.x - T.w / 2, T.z, 0.25, T.d); seg(T.x + T.w / 2, T.z, 0.25, T.d);
    seg(T.x - T.w / 4 - 0.6, T.z + T.d / 2, T.w / 2 - 1.2, 0.25); seg(T.x + T.w / 4 + 0.6, T.z + T.d / 2, T.w / 2 - 1.2, 0.25);
    // estandarte de la cuenta junto a la puerta
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2), std('#6b4a2b')); pole.position.set(T.x - 1.2, 1, T.z + T.d / 2);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), new THREE.MeshStandardMaterial({ color: color(a.color), side: THREE.DoubleSide })); banner.position.set(T.x - 0.93, 1.55, T.z + T.d / 2);
    // plaza de tierra al frente, donde estan los magos
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(T.w - 1, 1.2), std('#b89a66', { roughness: 1 })); plaza.rotation.x = -Math.PI / 2; plaza.position.set(T.x, 0.11, T.z + T.d / 2 - 0.9);
    this.world.add(pole, banner, plaza);
    T.banner = banner;
    T.gate = new THREE.Vector3(T.x, 0.3, T.z + T.d / 2 + 0.4);
    T.plaza = { x0: T.x - T.w / 2 + 1, x1: T.x + T.w / 2 - 1, z: T.z + T.d / 2 - 0.9 };
    const nA = items.filter(x => x._k === 'app').length;
    T.caption = accountCaption(a, nA, items.length - nA);
    items.forEach((it, i) => this.addHouse(it, T, T.x - T.w / 2 + 0.7 + SP / 2 + (i % T.cols) * SP, T.z - T.d / 2 + 0.3 + SP / 2 + Math.floor(i / T.cols) * SP));
    T.plaque = this.label('w3-plaque', `<b style="border-color:${a.color}">${esc(a.label)}</b><small>${esc(T.caption)}</small><div class="fishlist"></div>`, new THREE.Vector3(T.x, 0.05, T.z + T.d / 2 + 0.3));
    T.plaque.d.dataset.go = 'district:' + a.id;
    this.towns.set(a.id, T);
    this.fillPlaque(T);
  }
  fillPlaque(T) {
    T.plaque.d.querySelector('.fishlist').innerHTML = plaqueList(T.items.map(it => ({ ...it, ...(this.houses.get(it.id)?.data || {}) })), it => iconURL('sign:' + (it.icon || 'web'), () => signCanvas(it.icon || 'web', 2)));
  }

  addHouse(it, T, x, z) {
    const site = it._k === 'site';
    const g = new THREE.Group(); g.position.set(x, 0.1, z);
    let body, roof, chimney = null, win;
    if (site) {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.9, 10), std('#c9a66b')); body.position.y = 0.45;
      roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1, 10), std('#e0c060')); roof.position.y = 1.4;
    } else {
      body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.2), std('#b8b0a0')); body.position.y = 0.55;
      roof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.9, 4), std(color(T.a.color).lerp(color('#7a3a2a'), 0.55).getStyle())); roof.position.y = 1.55; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.9);
      chimney = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), std('#8a8274')); chimney.position.set(0.42, 1.7, -0.2);
      g.add(chimney);
    }
    win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a2018, emissive: 0xffc860, emissiveIntensity: 0 }));
    win.position.set(0.35, site ? 0.55 : 0.65, site ? 0.8 : 0.61);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.55), std('#5a3a22')); door.position.set(-0.25, 0.28, site ? 0.8 : 0.61);
    const sign = billboard(signCanvas(it.icon || 'web', 6), 0.62); sign.position.set(0, site ? 2.3 : 2.35, 0.2);
    g.add(body, roof, win, door, sign);
    g.userData = { kind: site ? 'site' : 'app', id: it.id };
    this.world.add(g); this.pickables.push(g);
    const h = { g, body, roof, chimney, win, sign, data: it, site, T, x, z, fire: null };
    h.label = this.label('w3-item', esc(it.name), () => h.named ? new THREE.Vector3(x, 3, z) : null);
    this.houses.set(it.id, h);
  }

  // ------------------------------------------------------------------ estado
  update(state) {
    this.state = state;
    this.layout(state);
    const replate = new Set();
    for (const x of [...state.apps, ...(state.sites || [])]) {
      const h = this.houses.get(x.id);
      if (!h) continue;
      const prev = h.data.status;
      h.data = { ...x, _k: h.data._k };
      if (prev && prev !== x.status) { replate.add(h.T); if (x.status === 'down') this.float(new THREE.Vector3(h.x, 2.8, h.z), `¡${x.name} arde!`, 'crit'); else if (prev === 'down') this.float(new THREE.Vector3(h.x, 2.8, h.z), 'Apagaron el fuego', 'ok'); }
    }
    replate.forEach(T => this.fillPlaque(T));
    const s = state.system;
    if (s && this.castleLabel) this.castleLabel.d.querySelector('small').textContent = (state.keys || []).filter(k => k.state === 'active').map(k => k.label).filter(l => !['SSH', 'Cron'].includes(l)).slice(0, 4).join(' · ') + ` · CPU ${s.cpu.toFixed(0)}%`;
    this.failed = (state.keys || []).some(k => k.state === 'failed');
    this.syncMages(state.sessions || []);
  }

  syncMages(sessions) {
    const seen = new Set(), per = {};
    for (const s of sessions) {
      const T = this.towns.get(s.account) || [...this.towns.values()][0];
      if (!T) continue;
      const add = (id, sub) => {
        seen.add(id);
        let m = this.mages.get(id);
        if (!m) {
          const g = new THREE.Group();
          const robe = new THREE.Mesh(new THREE.ConeGeometry(sub ? 0.22 : 0.32, sub ? 0.6 : 0.9, 8), std(sub ? '#8a6fd0' : '#5a3fb0'));
          robe.position.y = sub ? 0.3 : 0.45;
          const head = new THREE.Mesh(new THREE.SphereGeometry(sub ? 0.12 : 0.16, 10, 8), std('#e2b48c')); head.position.y = sub ? 0.68 : 1;
          const hat = new THREE.Mesh(new THREE.ConeGeometry(sub ? 0.14 : 0.2, sub ? 0.35 : 0.55, 8), std(sub ? '#8a6fd0' : '#3a2a80')); hat.position.y = sub ? 0.92 : 1.35; hat.rotation.z = 0.15;
          const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2), std('#6b4a2b')); staff.position.set(0.3, 0.6, 0); if (sub) staff.visible = false;
          const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9fd8ff })); orb.position.set(0.3, 1.25, 0); if (sub) orb.visible = false;
          g.add(robe, head, hat, staff, orb);
          g.traverse(o => { o.userData = { kind: 'session', id: s.id }; });
          this.scene.add(g); this.pickables.push(g);
          m = { g, orb, sub, x: T.plaza.x0, z: T.plaza.z, tx: T.plaza.x0, tz: T.plaza.z, wait: 0 };
          if (!sub) m.label = this.label('w3-agent', '', () => g.position.clone().setY(2));
          this.mages.set(id, m);
        }
        m.s = s; m.T = T;
        return m;
      };
      per[T.a.id] = (per[T.a.id] || 0) + 1;
      const main = add(s.id, false); main.slot = per[T.a.id] - 1;
      main.label.d.innerHTML = s.waitKind ? '<em>!</em> Espera su permiso' : '';
      (s.subagents || []).slice(0, 3).forEach((sa, i) => { const ap = add(s.id + '/' + (sa.id || i), true); ap.parent = main; ap.slot = i; });
    }
    for (const [id, m] of this.mages) if (!seen.has(id)) { this.scene.remove(m.g); if (m.label) m.label.remove(); this.pickables = this.pickables.filter(p => p !== m.g); this.mages.delete(id); }
  }

  // ------------------------------------------------------------------ eventos
  onEvent(e, priv) {
    switch (e.kind) {
      case 'http': {
        const h = this.houses.get(e.app || e.site);
        if (!h || this.fx.length > 220) return;
        return e.bot ? this.bird(h) : this.villager(h, e.status >= 500);
      }
      case 'attack': return this.slime(false);
      case 'block': return this.slime(true, priv ? e.ip : null);
      case 'login': return this.castle && this.float(new THREE.Vector3(this.castle.x, 5, this.castle.z), priv && e.user ? `Llegó ${e.user} al castillo` : 'Llegó el señor del castillo', 'ok');
      case 'mail': return this.castle && this.dove(e.dir);
      case 'deploy': {
        const h = this.houses.get(e.app);
        const T = { building: ['Obras en la casa', 'warn'], ready: ['Casa terminada', 'ok'], error: ['Se cayó el andamio', 'crit'], canceled: ['Obra cancelada', 'dim'] }[e.action];
        if (h && T) { this.float(new THREE.Vector3(h.x, 2.8, h.z), T[0], T[1]); if (e.action === 'ready') this.sparks(new THREE.Vector3(h.x, 1.5, h.z), 'accent', 12); }
        return;
      }
      case 'pm2': { const h = this.houses.get(e.app); if (h && e.action !== 'down') this.float(new THREE.Vector3(h.x, 2.8, h.z), 'Volvieron a encender el fogón', 'warn'); return; }
      case 'domain': { const T = this.towns.get(e.account); if (T) this.float(new THREE.Vector3(T.x, 2.4, T.z), ({ added: 'Casa nueva en el pueblo', removed: 'Una casa quedó vacía', changed: 'Cambió un sitio' }[e.action] || '') + (priv && e.domain ? ` · ${e.domain}` : ''), e.action === 'removed' ? 'warn' : 'ok'); return; }
      case 'claude': {
        const m = this.mages.get(e.sid) || [...this.mages.entries()].find(([k]) => e.sid && k.startsWith(e.sid))?.[1];
        if (!m) return;
        const p = m.g.position.clone().setY(2.4);
        if (e.action === 'permission') { this.attention(m.g.position, 3); this.float(p, '¡Necesita su permiso!', 'warn'); }
        else if (e.action === 'done') { this.float(p, 'Hechizo completado', 'ok'); this.sparks(m.g.position.clone().setY(1.2), '#9fd8ff', 12); }
        else if (e.action === 'prompt') this.float(p, priv && e.text ? e.text.slice(0, 60) : 'Nueva misión', 'accent');
        else if (e.action === 'error') this.sparks(m.g.position.clone().setY(1.2), 'crit', 8);
        return;
      }
    }
  }

  // aldeano: por el camino al porton del castillo, y de ahi a la puerta de su pueblo y a la casa
  villager(h, bad) {
    if (!this.castle) return;
    const g = new THREE.Group();
    const shirt = std(bad ? '#d9412b' : ['#4a78c0', '#c0884a', '#6fa04a', '#b05a8a'][Math.floor(Math.random() * 4)]);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.34, 6), shirt); b.position.y = 0.17;
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), std('#e2b48c')); hd.position.y = 0.42;
    g.add(b, hd);
    const C = this.castle, T = h.T, R = this.road;
    const pts = [new THREE.Vector3(R.x0, 0.1, R.z), new THREE.Vector3(C.x, 0.1, R.z), C.gate.clone().setY(0.1), new THREE.Vector3(T.gate.x, 0.1, T.gate.z + 0.6), T.gate.clone().setY(0.1), new THREE.Vector3(h.x - 0.25, 0.1, h.z + 0.9)];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const secs = 5 + curve.getLength() / 14;
    this.addFx(g, f => {
      const k = f.age / secs; if (k >= 1) { h.lit = Math.min(1.5, (h.lit || 0) + 0.4); if (bad) this.sparks(new THREE.Vector3(h.x, 1, h.z), 'crit', 6, 2); return false; }
      g.position.copy(curve.getPoint(k)); g.position.y = 0.1 + Math.abs(Math.sin(f.age * 10)) * 0.05; return true;
    });
  }
  bird(h) {
    const spr = billboard(rowsCanvas(BIRD[0], { k: '#2a2a2a' }, 4), 0.35);
    const a = new THREE.Vector3(this.road.x0, 6, -8), b = new THREE.Vector3(h.x, 2.6, h.z);
    this.travel(spr, new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).setY(9), b), 3.5);
  }
  dove(dir) {
    const C = this.castle;
    const spr = billboard(rowsCanvas(BIRD[0], { k: dir === 'bounce' ? '#f0b43c' : '#f4f1e8' }, 4), 0.4);
    const top = new THREE.Vector3(C.x, 5, C.z), far = new THREE.Vector3(C.x + (Math.random() - 0.5) * 30, 10, C.z - 20);
    const [a, b] = dir === 'in' ? [far, top] : [top, far];
    this.travel(spr, new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).setY(12), b), 3);
  }
  slime(blocked, ip) {
    if (!this.castle) return;
    const C = this.castle;
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshStandardMaterial({ color: 0x6fcf4a, transparent: true, opacity: 0.9, roughness: 0.3, emissive: 0x2a6a1a, emissiveIntensity: 0.3 }));
    const from = new THREE.Vector3(C.x - 8 - Math.random() * 6, 0.3, C.z - 4 + Math.random() * 6), to = new THREE.Vector3(C.x - 3.1, 0.3, C.z + (Math.random() - 0.5) * 3);
    this.addFx(g, (f, dt) => {
      if (!f.hit) {
        const k = Math.min(1, f.age / 3.2);
        g.position.lerpVectors(from, to, k); g.position.y = 0.3 + Math.abs(Math.sin(f.age * 5)) * 0.6;
        g.scale.set(1 + Math.sin(f.age * 10) * 0.1, 0.8 - Math.sin(f.age * 10) * 0.1, 1);
        if (k >= 1) { f.hit = f.age; C.flash = 1; this.sparks(to.clone().setY(0.8), '#6fcf4a', 8, 2); if (blocked) this.float(to.clone().setY(2.6), ip ? `Guardia derrotó al slime · ${ip}` : 'Un guardia derrotó al slime', 'warn'); }
        return true;
      }
      const k = (f.age - f.hit) / (blocked ? 0.6 : 1.6);
      if (blocked) { g.scale.setScalar(Math.max(0.01, 1 - k)); }
      else { g.position.x -= dt * 1.5; g.material.opacity = 0.9 * (1 - k); }
      return k < 1;
    });
  }

  // ------------------------------------------------------------------ cuadro a cuadro
  frame(dt) {
    if (this.directorOn && !this.manualUntil && !this.urgent) this.goal.az = Math.PI / 2 + Math.sin(this.t * 0.06) * 0.22;
    if (this.castle) {
      this.castle.flag.rotation.y = Math.sin(this.t * 2) * 0.2;
      this.castle.flash = Math.max(0, this.castle.flash - dt * 2);
      for (const w of this.castle.walls) { w.material.emissive.set(this.castle.flash > 0.05 ? 0x6fcf4a : this.failed && Math.floor(this.t * 2) % 2 ? 0xf0b43c : 0x000000); w.material.emissiveIntensity = Math.max(this.castle.flash * 0.6, this.failed ? 0.25 : 0); }
    }
    let focus = null;
    if (this.orbit.zoom > 1.5) { let best = 1e9; for (const T of this.towns.values()) { const k = Math.hypot(T.x - this.orbit.tx, T.z - this.orbit.tz); if (k < best) { best = k; focus = T; } } }
    this.refitPlaques([...this.towns.values()], Math.sin(EL));
    this.sizePlaques([...this.towns.values()].map(T => [T.plaque, T.w]).concat(this.castleLabel ? [[this.castleLabel, 7, 150]] : []), FONT_K);
    for (const T of this.towns.values()) T.banner.rotation.y = Math.sin(this.t * 2 + T.x) * 0.25;
    for (const h of this.houses.values()) {
      const a = h.data, down = a.status === 'down';
      h.lit = Math.max(0, (h.lit || 0) - dt * 0.25);
      h.win.material.emissiveIntensity = clamp(Math.sqrt(a.reqMin || 0) / 5, 0, 1) * 1.2 + h.lit;
      // humo de la chimenea con la CPU (oscuro si es alta)
      if (h.chimney && !down && Math.random() < dt * (0.4 + (a.cpu || 0) / 15)) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshStandardMaterial({ color: (a.cpu || 0) > 50 ? 0x4a4a4a : 0xd8d8d8, transparent: true, opacity: 0.7, flatShading: true }));
        p.position.set(h.x + 0.42, 2.2, h.z - 0.2);
        this.addFx(p, (f, d) => { p.position.y += d * 0.7; p.position.x += d * 0.2; p.scale.setScalar(1 + f.age); p.material.opacity = 0.7 * (1 - f.age / 2.4); return f.age < 2.4; });
      }
      // fuego si esta caida
      if (down && Math.random() < dt * 8) {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 5), new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xff7a1a : 0xffc83a, transparent: true }));
        fl.position.set(h.x + (Math.random() - 0.5) * 1, 1.3 + Math.random() * 0.5, h.z + (Math.random() - 0.5) * 0.8);
        this.addFx(fl, (f, d) => { fl.position.y += d * 1.2; fl.material.opacity = 1 - f.age / 0.8; return f.age < 0.8; });
      }
      h.body.material.color.set(down ? '#5a4a40' : h.site ? '#c9a66b' : '#b8b0a0');
      h.named = h.T === focus || down;
      h.label.d.classList.toggle('down', down);
    }
    for (const m of this.mages.values()) {
      const s = m.s, waiting = !!s.waitKind, T = m.T;
      if (m.sub && m.parent) { m.x = m.parent.x + (m.slot % 2 ? 0.55 : -0.55) * (1 + (m.slot >> 1) * 0.6); m.z = m.parent.z + 0.4; }
      else {
        m.wait -= dt;
        if (!waiting && m.wait <= 0) { m.tx = T.plaza.x0 + Math.random() * (T.plaza.x1 - T.plaza.x0); m.tz = T.plaza.z; m.wait = 3 + Math.random() * 4; }
        if (waiting) { m.tx = clamp(T.gate.x + 1 + m.slot * 0.8, T.plaza.x0, T.plaza.x1); m.tz = T.plaza.z; }
        const dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz), st = 0.9 * dt;
        if (d > st) { m.x += dx / d * st; m.z += dz / d * st; }
      }
      m.g.position.set(m.x, 0.12 + (s.state === 'working' ? Math.abs(Math.sin(this.t * 6)) * 0.05 : 0), m.z);
      if (m.orb) m.orb.material.color.set(waiting ? 0xf0b43c : s.state === 'working' ? 0x9fd8ff : 0x5a6a8a);
    }
  }

  // ------------------------------------------------------------------ camara, avisos y enfoque
  zoomFor(T) { return clamp((this.extent?.w || 20) / (T.w + 6), 1.7, 4); }
  shots() { return [...this.towns.values()].map(T => ({ x: T.x, y: 0.5, z: T.z + 1, zoom: this.zoomFor(T), el: EL })); }
  locate(kind, id) {
    if (kind === 'app' || kind === 'site') { const h = this.houses.get(id); if (h) return { x: h.T.x, y: 0.5, z: h.T.z + 1, zoom: this.zoomFor(h.T) }; }
    if (kind === 'session') { const m = this.mages.get(id); if (m) return { x: m.x, y: 0.5, z: m.z, zoom: 3.4 }; }
    if (kind === 'district') { const T = this.towns.get(id); if (T) return { x: T.x, y: 0.5, z: T.z + 1, zoom: this.zoomFor(T) }; }
    if ((kind === 'system' || kind === 'security') && this.castle) return { x: this.castle.x, y: 1, z: this.castle.z + 1, zoom: 2.8 };
    return null;
  }
  tipFor(u) {
    if (u.kind === 'app' || u.kind === 'site') {
      const h = this.houses.get(u.id); if (!h) return null;
      const a = h.data;
      return { title: a.name, body: `${a.kind && a.kind !== a.name ? `<b>${esc(a.kind)}</b> · ` : ''}${h.site ? 'cabaña de paja (sitio)' : 'casa de piedra (servicio)'} · ${esc(h.T.a.label)}`,
        meta: `${{ online: 'todo en orden', degraded: 'a medias (parcial)', down: 'EN LLAMAS (caído)' }[a.status] || a.status}${!h.site ? ` · CPU ${(a.cpu || 0).toFixed(1)}% · RAM ${fmtBytes(a.mem || 0)}` : ''} · ${a.reqMin || 0} visitas/min`, hint: 'Clic para ver el detalle' };
    }
    if (u.kind === 'session') { const m = this.mages.get(u.id); return m && { title: m.sub ? 'Aprendiz · subagente' : 'Mago · agente de Claude Code', body: esc(m.s.activity || ''), meta: m.s.waitKind ? 'Espera su permiso o su respuesta' : { working: 'Lanzando hechizos', thinking: 'Pensando', idle: 'Descansando' }[m.s.state] || '', hint: 'Clic para ver la línea de tiempo' }; }
    if (u.kind === 'district') { const T = this.towns.get(u.id); return T && { title: T.a.label, body: `Un pueblo con ${T.items.length} casas. Su tablón, delante, las nombra a todas.`, meta: T.caption, hint: 'Clic para ver el pueblo' }; }
    if (u.kind === 'system') return { title: 'Castillo', body: 'El <b>servidor</b>: todas las visitas pasan por su portón. Los slimes golpean su muralla.', meta: this.state?.system ? `CPU ${this.state.system.cpu.toFixed(0)}% · RAM ${this.state.system.mem.pct.toFixed(0)}% · carga ${this.state.system.load[0].toFixed(2)}` : '', hint: 'Clic para ver el servidor completo' };
    return null;
  }
}
