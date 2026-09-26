// Tema "Ciudad 3D": la ciudad de Atalaya en tres dimensiones (three.js), de noche.
//  - cada cuenta es una PARCELA elevada con el borde de su color y su nombre (y su cuenta de cPanel)
//  - cada servicio es un EDIFICIO: altura = memoria, ventanas encendidas = visitas, techo naranja = CPU alta,
//    baliza de estado (verde, ambar, roja parpadeando); cada sitio, un edificio bajo; encima, su cartel pixel
//  - en el centro, la TORRE DE CONTROL (el servidor) con su escudo; calles hacia cada distrito y el portal
//    "Internet" por donde entran las visitas (puntos de luz que recorren las calles hasta su edificio)
//  - los robots de Claude Code caminan por su distrito (pixel art); los invasores chocan contra el escudo
// Regla de oro: la informacion vive en la ciudad (altura, luces, techos); el pixel art es el acento.
import { Stage3D, THREE, color, clamp, billboard, rowsCanvas } from '/js/stage3d.js';
import { signCanvas, robotCanvas, INVADER, ENVELOPE } from '/js/sprites.js';
import { esc, fmtBytes } from '/js/hud.js';
import { accountCaption } from '/js/accounts.js';
import { healthLine } from '/js/layout.js';

const GAP = 2.1; // distancia entre edificios
const shade = (hex, f) => color(hex).lerp(color(f < 0 ? '#000000' : '#ffffff'), Math.abs(f));

// fachada: ventanas en grilla (el mismo canvas sirve de color y de brillo)
function facadeCanvas(seed) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 32;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#10131c'; cx.fillRect(0, 0, 16, 32);
  let r = seed;
  for (let y = 2; y < 32; y += 4) for (let x = 2; x < 16; x += 4) {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    cx.fillStyle = r % 7 === 0 ? '#3a3f52' : '#ffe9a8';
    cx.fillRect(x, y, 2, 2);
  }
  return cv;
}

export default class Ciudad3D extends Stage3D {
  constructor(el, opts) {
    super(el, opts);
    this.shadows = true; this.fov = 34; this.fitScale = 1.4;
    this.buildings = new Map(); this.districts = new Map(); this.robots = new Map();
    this.layoutKey = '';
    this.view = { az: -0.9, el: 0.78, dist: 58, tx: 0, ty: 0, tz: 0, zoom: 1 };
    this.orbit = { ...this.view }; this.goal = { ...this.view };
  }

  async build() {
    const S = this.scene;
    S.fog = new THREE.Fog(this.C.bg, 70, 150);
    S.add(new THREE.HemisphereLight(0x8fa6ff, 0x0a0a14, 0.55));
    const moon = new THREE.DirectionalLight(0xc8d4ff, 0.9);
    moon.position.set(-30, 50, 20); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 150 });
    S.add(moon);
    // suelo y estrellas
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), new THREE.MeshStandardMaterial({ color: 0x070b16, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; S.add(ground);
    const grid = new THREE.GridHelper(200, 100, 0x16203a, 0x0e1528); grid.position.y = 0.01; S.add(grid);
    const sp = []; for (let i = 0; i < 600; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.1; sp.push(Math.cos(a) * Math.cos(e) * 140, Math.sin(e) * 140, Math.sin(a) * Math.cos(e) * 140); }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)), new THREE.PointsMaterial({ color: 0x9fb4d9, size: 0.6, sizeAttenuation: true }));
    S.add(stars);
    this.city = new THREE.Group(); S.add(this.city);
    this.buildHQ();
  }

  buildHQ() {
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.9, 9, 8), new THREE.MeshStandardMaterial({ color: 0x2a3550, metalness: 0.5, roughness: 0.4, emissive: color(this.C.accent), emissiveIntensity: 0.08 }));
    tower.position.y = 4.5; tower.castShadow = true;
    const bands = new THREE.Group();
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(1.5 + (5 - i) * 0.08, 1.5 + (5 - i) * 0.08, 0.12, 8, 1, true), new THREE.MeshBasicMaterial({ color: color(this.C.accent), transparent: true, opacity: 0.8, side: THREE.DoubleSide })); b.position.y = 1.2 + i * 1.3; bands.add(b); }
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x1c2438, metalness: 0.6, roughness: 0.4 }));
    deck.position.y = 9.2; deck.castShadow = true;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 3), new THREE.MeshStandardMaterial({ color: 0x8a95ad }));
    mast.position.y = 11;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: color(this.C.crit) }));
    beacon.position.y = 12.6;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.4, 32), new THREE.MeshStandardMaterial({ color: 0x141b2e, roughness: 0.8 }));
    pad.position.y = 0.2; pad.receiveShadow = true;
    const shield = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: color(this.C.accent), wireframe: true, transparent: true, opacity: 0.07 }));
    g.add(pad, tower, bands, deck, mast, beacon, shield);
    g.userData = { kind: 'system', id: 'root' };
    this.scene.add(g);
    this.pickables.push(tower, deck, pad);
    [tower, deck, pad].forEach(m => { m.userData = { kind: 'system', id: 'root' }; });
    this.hq = { g, tower, bands, beacon, shield, flash: 0 };
    this.hqLabel = this.label('w3-group', '<b>TORRE DE CONTROL</b><small></small><i class="hl"></i>', new THREE.Vector3(0, 13.8, 0));
    // portal "Internet"
    this.gatePos = new THREE.Vector3(-20, 4, 22); // detras de la ciudad vista desde la camara inicial
    const gate = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 12, 48), new THREE.MeshBasicMaterial({ color: color(this.C.accent) }));
    gate.position.copy(this.gatePos); this.scene.add(gate);
    this.gate = gate;
    this.label('w3-agent', 'INTERNET', this.gatePos.clone().setY(7));
  }

  // ------------------------------------------------------------------ distritos y edificios
  layout(state) {
    const accounts = state.accounts.filter(a => a.id !== 'root');
    const by = {};
    for (const a of state.apps) (by[a.account] = by[a.account] || []).push({ ...a, _k: 'app' });
    for (const x of state.sites || []) (by[x.account] = by[x.account] || []).push({ ...x, _k: 'site' });
    const key = accounts.map(a => a.id + ':' + (a.cpanel || '') + ':' + (by[a.id] || []).map(x => x.id + (x.icon || '')).join(',')).join('|');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    // limpiar
    this.city.clear();
    for (const d of this.districts.values()) d.label.remove();
    for (const b of this.buildings.values()) b.label.remove();
    this.districts.clear(); this.buildings.clear();
    this.pickables = this.pickables.filter(p => p.userData.kind === 'system' || p.userData.kind === 'session');
    const list = accounts.filter(a => (by[a.id] || []).length).map(a => {
      const items = by[a.id].sort((x, y) => (x._k === y._k ? 0 : x._k === 'app' ? -1 : 1));
      const cols = clamp(Math.ceil(Math.sqrt(items.length * 1.3)), 2, 8), rows = Math.ceil(items.length / cols);
      return { a, items, cols, rows, w: cols * GAP + 1.6, d: rows * GAP + 3.2 };
    }).sort((x, y) => y.items.length - x.items.length);
    // posiciones: anillo alrededor de la torre y luego se separan
    const slots = [[1, 0], [-1, 0], [0, 1], [0.7, -0.8], [-0.7, -0.8], [0.8, 0.9], [-0.8, 0.9], [0, -1.2]];
    list.forEach((it, i) => { const s = slots[i % slots.length], k = 1 + Math.floor(i / slots.length) * 0.7; it.x = s[0] * (9 + it.w / 2) * k; it.z = s[1] * (9 + it.d / 2) * k; });
    for (let n = 0; n < 80; n++) for (const A of list) {
      for (const B of list) if (A !== B) {
        const ox = (A.w + B.w) / 2 + 2 - Math.abs(A.x - B.x), oz = (A.d + B.d) / 2 + 2 - Math.abs(A.z - B.z);
        if (ox > 0 && oz > 0) { if (ox < oz) A.x += Math.sign(A.x - B.x || 1) * ox / 2; else A.z += Math.sign(A.z - B.z || 1) * oz / 2; }
      }
      const ox = A.w / 2 + 6 - Math.abs(A.x), oz = A.d / 2 + 6 - Math.abs(A.z);
      if (ox > 0 && oz > 0) { if (ox < oz) A.x += Math.sign(A.x || 1) * ox; else A.z += Math.sign(A.z || 1) * oz; }
    }
    let ext = 12;
    for (const it of list) { this.buildDistrict(it); ext = Math.max(ext, Math.abs(it.x) + it.w / 2, Math.abs(it.z) + it.d / 2); }
    // la vista general abarca toda la ciudad
    this.setView({ dist: 20 + ext * 2.1 }, true);
  }

  buildDistrict(it) {
    const { a, items, cols } = it;
    const g = new THREE.Group(); g.position.set(it.x, 0, it.z);
    // parcela
    const plate = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.35, it.d), new THREE.MeshStandardMaterial({ color: shade(a.color, -0.82), roughness: 0.9 }));
    plate.position.y = 0.175; plate.receiveShadow = true; plate.userData = { kind: 'district', id: a.id };
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry), new THREE.LineBasicMaterial({ color: color(a.color) }));
    edge.position.copy(plate.position);
    g.add(plate, edge);
    this.pickables.push(plate);
    // calle desde la torre
    const len = Math.hypot(it.x, it.z) - Math.min(it.w, it.d) / 2 - 4;
    if (len > 0) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(1.1, len), new THREE.MeshStandardMaterial({ color: 0x131a2c, roughness: 1 }));
      const ang = Math.atan2(it.x, it.z);
      road.rotation.x = -Math.PI / 2; road.rotation.z = -ang + Math.PI;
      const mid = 4 + len / 2;
      road.position.set(Math.sin(ang) * mid, 0.03, Math.cos(ang) * mid);
      road.receiveShadow = true;
      this.city.add(road);
      for (let d = 5; d < 4 + len; d += 1.4) { const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.6), new THREE.MeshBasicMaterial({ color: 0x334a7a })); dash.rotation.x = -Math.PI / 2; dash.rotation.z = -ang; dash.position.set(Math.sin(ang) * d, 0.04, Math.cos(ang) * d); this.city.add(dash); }
    }
    this.city.add(g);
    const nA = items.filter(x => x._k === 'app').length;
    const caption = accountCaption(a, nA, items.length - nA);
    const d = { a, g, x: it.x, z: it.z, w: it.w, dd: it.d, caption, center: new THREE.Vector3(it.x, 0, it.z) };
    d.label = this.label('w3-group', `<b style="color:${a.color}">${esc(a.label)}</b><small>${esc(caption)}</small>`, new THREE.Vector3(it.x, 0.4, it.z + it.d / 2 + 0.8));
    d.label.d.dataset.go = 'district:' + a.id;
    d.label.d.style.translate = '-50% 0';
    // edificios en grilla; la franja del frente queda libre para los robots
    items.forEach((x, i) => {
      const bx = -it.w / 2 + 1.8 + (i % cols) * GAP, bz = -it.d / 2 + 1.6 + Math.floor(i / cols) * GAP;
      this.addBuilding(x, g, bx, bz, a);
    });
    d.plaza = { x0: it.x - it.w / 2 + 1, x1: it.x + it.w / 2 - 1, z: it.z + it.d / 2 - 0.9 };
    this.districts.set(a.id, d);
  }

  addBuilding(it, parent, x, z, acc) {
    const site = it._k === 'site';
    const fac = new THREE.CanvasTexture(facadeCanvas((it.id.charCodeAt(0) || 1) * 97 + (it.id.charCodeAt(1) || 3)));
    fac.magFilter = THREE.NearestFilter; fac.colorSpace = THREE.SRGBColorSpace; fac.wrapT = THREE.RepeatWrapping;
    const w = site ? 1.5 : 1.25;
    const mat = new THREE.MeshStandardMaterial({ color: site ? shade(acc.color, 0.35) : shade(acc.color, -0.15), map: fac, emissiveMap: fac, emissive: new THREE.Color(0xffd98a), emissiveIntensity: 0.05, roughness: 0.6, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 1, w), mat);
    body.geometry.translate(0, 0.5, 0);
    body.castShadow = true; body.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.14, w + 0.1), new THREE.MeshStandardMaterial({ color: 0x2a2f40, emissive: new THREE.Color(0xff8a2a), emissiveIntensity: 0 }));
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: color(this.C.ok) }));
    const sign = billboard(signCanvas(it.icon || 'web', 6), 0.8);
    const g = new THREE.Group(); g.position.set(x, 0.35, z);
    g.add(body, roof, beacon, sign);
    g.userData = { kind: site ? 'site' : 'app', id: it.id };
    parent.add(g);
    this.pickables.push(g);
    const label = this.label('w3-item', '', () => g.getWorldPosition(new THREE.Vector3()).setY(0.35 + b.h + 1.55));
    const b = { g, body, roof, beacon, sign, fac, data: it, site, acc, h: 1, target: 1, lit: 0, flash: 0, label };
    this.buildings.set(it.id, b);
  }

  // ------------------------------------------------------------------ estado
  update(state) {
    this.state = state;
    this.layout(state);
    const top = new Set([...state.apps, ...(state.sites || [])].sort((x, y) => (y.reqMin || 0) - (x.reqMin || 0)).slice(0, 5).filter(x => x.reqMin > 0).map(x => x.id));
    for (const x of [...state.apps, ...(state.sites || [])]) {
      const b = this.buildings.get(x.id);
      if (!b) continue;
      const prev = b.data.status;
      b.data = { ...x, _k: b.site ? 'site' : 'app' };
      b.target = b.site ? 0.8 + clamp(Math.sqrt(x.reqMin || 0) * 0.15, 0, 1.2) : 1.4 + clamp(Math.log2(1 + (x.mem || 0) / 40e6) * 0.9, 0, 6.5);
      b.lit = clamp(Math.sqrt(x.reqMin || 0) / 6, 0, 1);
      b.cpu = x.cpu || 0;
      b.label.d.textContent = x.name; b.star = top.has(x.id) || x.status === 'down';
      if (prev && prev !== x.status && x.status === 'down') this.float(b.g.getWorldPosition(new THREE.Vector3()).setY(b.h + 2.4), 'CAÍDO', 'crit');
    }
    this.failed = (state.keys || []).filter(k => k.state === 'failed').map(k => k.label);
    this.hq.cpu = state.system ? state.system.cpu : 0;
    this.hqLabel.d.querySelector('small').textContent = (state.keys || []).filter(k => k.state === 'active').map(k => k.label).filter(l => !['SSH', 'Cron'].includes(l)).slice(0, 4).join(' · ');
    // salud del servidor junto a su nombre
    const hl = healthLine(state), he = this.hqLabel && this.hqLabel.d.querySelector('.hl');
    if (he && hl) { he.textContent = hl.text; he.style.color = hl.color; }
    this.syncRobots(state.sessions || []);
  }

  syncRobots(sessions) {
    const seen = new Set(), per = {};
    for (const s of sessions) {
      const add = (id, sub, parent) => {
        seen.add(id);
        let r = this.robots.get(id);
        const acc = this.state.accounts.find(a => a.id === s.account);
        if (!r) {
          const spr = billboard(robotCanvas(acc ? acc.color : '#22d3ee', 4), sub ? 0.8 : 1.25);
          spr.userData = { kind: 'session', id: s.id };
          const halo = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), new THREE.MeshBasicMaterial({ color: color(this.C.warn), transparent: true, opacity: 0, side: THREE.DoubleSide }));
          halo.rotation.x = -Math.PI / 2;
          this.scene.add(spr, halo);
          this.pickables.push(spr);
          r = { spr, halo, sub, x: 0, z: 0, tx: 0, tz: 0, wait: 0, label: sub ? null : this.label('w3-agent', '', () => spr.position.clone().setY(spr.position.y + 1.1)) };
          const d = this.districts.get(s.account);
          const p = this.plazaPoint(d);
          r.x = r.tx = p.x; r.z = r.tz = p.z;
          this.robots.set(id, r);
        }
        r.s = s; r.parent = parent;
        return r;
      };
      per[s.account] = (per[s.account] || 0) + 1;
      const main = add(s.id, false, null);
      main.slot = per[s.account] - 1;
      if (main.label) main.label.d.innerHTML = s.waitKind ? 'Agente <em>ESPERA SU PERMISO</em>' : '';
      (s.subagents || []).slice(0, 4).forEach((sa, i) => { const r = add(s.id + '/' + (sa.id || i), true, main); r.slot = i; });
    }
    for (const [id, r] of this.robots) if (!seen.has(id)) { this.scene.remove(r.spr, r.halo); if (r.label) r.label.remove(); this.pickables = this.pickables.filter(p => p !== r.spr); this.robots.delete(id); }
  }
  plazaPoint(d) {
    if (!d) return { x: 3 + Math.random() * 2, z: 5 };
    return { x: d.plaza.x0 + Math.random() * (d.plaza.x1 - d.plaza.x0), z: d.plaza.z };
  }

  // ------------------------------------------------------------------ eventos
  onEvent(e, priv) {
    switch (e.kind) {
      case 'http': return this.visit(e);
      case 'attack': return this.invader(false);
      case 'block': return this.invader(true, priv ? e.ip : null);
      case 'login': this.sparks(new THREE.Vector3(0, 10, 0), 'ok', 14); return this.float(new THREE.Vector3(0, 12, 0), priv && e.user ? `Acceso SSH · ${e.user}` : 'Acceso SSH', 'ok');
      case 'mail': return this.letter(e.dir);
      case 'deploy': {
        const b = this.buildings.get(e.app);
        const T = { building: ['Desplegando', 'warn'], ready: ['Desplegado', 'ok'], error: ['Falló el despliegue', 'crit'], canceled: ['Cancelado', 'dim'] }[e.action];
        if (b && T) { const p = b.g.getWorldPosition(new THREE.Vector3()); this.float(p.clone().setY(b.h + 2.4), T[0], T[1]); this.ring(p, T[1]); if (e.action === 'ready') this.sparks(p.clone().setY(b.h + 1), 'ok', 12); }
        return;
      }
      case 'pm2': { const b = this.buildings.get(e.app); if (b && e.action !== 'down') { const p = b.g.getWorldPosition(new THREE.Vector3()); this.float(p.clone().setY(b.h + 2.4), 'Reinicio', 'warn'); this.ring(p, 'warn'); } return; }
      case 'domain': { const d = this.districts.get(e.account); if (d) { this.float(d.center.clone().setY(3), ({ added: 'Nuevo dominio', removed: 'Dominio eliminado', changed: 'Un sitio cambió' }[e.action] || '') + (priv && e.domain ? ` · ${e.domain}` : ''), e.action === 'removed' ? 'crit' : 'ok'); this.ring(d.center, e.action === 'removed' ? 'crit' : 'ok', 2); } return; }
      case 'claude': {
        const r = this.robots.get(e.sid) || [...this.robots.entries()].find(([k]) => e.sid && k.startsWith(e.sid))?.[1];
        if (!r) return;
        const p = r.spr.position.clone();
        if (e.action === 'permission') { this.attention(p, 2.6); this.float(p.clone().setY(p.y + 1.8), '¿Me da permiso?', 'warn'); }
        else if (e.action === 'done') { this.sparks(p.clone().setY(p.y + 0.8), 'ok', 10); this.float(p.clone().setY(p.y + 1.8), 'Listo', 'ok'); }
        else if (e.action === 'prompt') this.float(p.clone().setY(p.y + 1.8), priv && e.text ? e.text.slice(0, 60) : 'Nueva instrucción', 'accent');
        else if (e.action === 'error') this.sparks(p.clone().setY(p.y + 0.8), 'crit', 8);
        return;
      }
    }
  }

  // visita: del portal a la torre, por la calle al distrito y a su edificio
  visit(e) {
    if (this.fx.length > 220) return;
    const b = this.buildings.get(e.app || e.site);
    const d = b ? this.districts.get(b.acc.id) : this.districts.get(e.account);
    const pts = [this.gatePos.clone(), new THREE.Vector3(0, 10.5, 0)];
    if (d) pts.push(new THREE.Vector3(d.x * 0.55, 3, d.z * 0.55), d.center.clone().setY(1.2));
    if (b) pts.push(b.g.getWorldPosition(new THREE.Vector3()).setY(b.h + 0.5));
    const c = e.status >= 500 ? this.C.crit : e.status >= 400 ? this.C.warn : e.bot ? '#64748b' : '#67e8f9';
    const m = new THREE.Mesh(new THREE.SphereGeometry(e.bot ? 0.1 : 0.14, 8, 6), new THREE.MeshBasicMaterial({ color: color(c) }));
    this.travel(m, new THREE.CatmullRomCurve3(pts), 2.2 + Math.random() * 0.6, () => { if (b) { b.flash = e.status >= 500 ? 1 : 0.4; if (e.status >= 500) this.sparks(b.g.getWorldPosition(new THREE.Vector3()).setY(b.h + 0.6), 'crit', 8); } });
  }

  invader(blocked, ip) {
    const ang = Math.random() * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(ang) * 60, 12 + Math.random() * 8, Math.sin(ang) * 60);
    const hit = new THREE.Vector3(Math.cos(ang) * 5.6, 2.5, Math.sin(ang) * 5.6);
    const spr = billboard(rowsCanvas(INVADER[0].map(r => r.replace(/x/g, 'r')), { r: blocked ? '#fb7185' : '#f87171' }, 4), 1.1);
    this.travel(spr, new THREE.QuadraticBezierCurve3(from, from.clone().lerp(hit, 0.5).setY(18), hit), 3.2, () => {
      this.hq.flash = 1; this.sparks(hit, 'crit', 12, 4);
      if (blocked) this.float(hit.clone().setY(4.5), ip ? `IP bloqueada · ${ip}` : 'IP bloqueada', 'crit');
    });
  }

  letter(dir) {
    const spr = billboard(rowsCanvas(ENVELOPE.map(r => r.replace(/x/g, 'e')), { e: dir === 'bounce' ? '#f87171' : dir === 'in' ? '#c084fc' : '#fbbf24' }, 4), 0.7);
    const top = new THREE.Vector3(0, 10, 0), edge = this.gatePos.clone().setY(8);
    const [a, b] = dir === 'in' ? [edge, top] : [top, edge];
    this.travel(spr, new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).setY(16), b), 2.4);
  }

  // ------------------------------------------------------------------ cuadro a cuadro
  frame(dt) {
    // al acercarse a un distrito se ven los nombres de todos sus edificios; de lejos, solo los 5 con mas visitas y los caidos
    let focus = null;
    if (this.orbit.zoom > 1.5) { let best = 1e9; for (const d of this.districts.values()) { const k = Math.hypot(d.x - this.orbit.tx, d.z - this.orbit.tz); if (k < best) { best = k; focus = d.a.id; } } }
    for (const b of this.buildings.values()) b.label.d.style.display = b.star || b.acc.id === focus ? '' : 'none';
    const blink = Math.floor(this.t * 3) % 2 === 0;
    for (const b of this.buildings.values()) {
      b.h += (b.target - b.h) * Math.min(1, dt * 2.5);
      b.body.scale.y = b.h;
      b.fac.repeat.set(1, Math.max(1, Math.round(b.h / 1.2)));
      b.roof.position.y = b.h + 0.07; b.beacon.position.y = b.h + 0.28; b.sign.position.y = b.h + 0.95;
      b.flash = Math.max(0, b.flash - dt * 2);
      b.body.material.emissiveIntensity = 0.05 + b.lit * 1.1 + b.flash * 1.5;
      b.roof.material.emissiveIntensity = b.site ? 0 : clamp((b.cpu - 30) / 60, 0, 1) * 1.5;
      const st = b.data.status;
      b.beacon.material.color.set(st === 'down' ? (blink ? this.C.crit : '#3b0a0a') : st === 'degraded' ? this.C.warn : this.C.ok);
    }
    // torre: bandas que corren con la CPU, escudo y alarma de servicios clave
    this.hq.flash = Math.max(0, this.hq.flash - dt * 1.5);
    this.hq.bands.children.forEach((b, i) => { b.material.opacity = 0.25 + 0.6 * Math.max(0, Math.sin(this.t * (1 + (this.hq.cpu || 0) / 25) - i * 0.6)); });
    const bad = this.failed && this.failed.length;
    this.hq.shield.material.opacity = 0.06 + this.hq.flash * 0.45 + (bad ? 0.08 * (blink ? 1 : 0) : 0);
    this.hq.shield.material.color.set(this.hq.flash > 0.1 ? this.C.crit : bad ? this.C.warn : this.C.accent);
    this.hq.beacon.visible = Math.floor(this.t * 1.5) % 2 === 0;
    this.gate.rotation.y += dt * 0.6;
    // robots: pasean por el frente de su distrito; quietos con halo si esperan
    for (const r of this.robots.values()) {
      const s = r.s, waiting = !!s.waitKind;
      if (r.sub && r.parent) { r.x = r.parent.x + (r.slot % 2 ? 0.7 : -0.7) * (1 + (r.slot >> 1) * 0.6); r.z = r.parent.z + 0.5; }
      else {
        r.wait -= dt;
        if (!waiting && r.wait <= 0) { const p = this.plazaPoint(this.districts.get(s.account)); r.tx = p.x; r.tz = p.z; r.wait = 3 + Math.random() * 4; }
        const dx = r.tx - r.x, dz = r.tz - r.z, dd = Math.hypot(dx, dz), st = 1.1 * dt;
        if (!waiting && dd > st) { r.x += dx / dd * st; r.z += dz / dd * st; }
      }
      const bob = s.state === 'working' ? Math.abs(Math.sin(this.t * 8)) * 0.08 : 0;
      r.spr.position.set(r.x, 0.35 + (r.sub ? 0.4 : 0.62) + bob, r.z);
      r.spr.material.opacity = s.state === 'idle' ? 0.6 : 1;
      r.halo.position.set(r.x, 0.4, r.z);
      r.halo.material.opacity = waiting && !r.sub ? 0.5 + 0.5 * Math.sin(this.t * 6) : 0;
    }
    // seleccion
    const sel = this.selected, sb = sel && this.buildings.get(sel.id);
    if (sb && !this.selRing) { this.selRing = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.2, 40), new THREE.MeshBasicMaterial({ color: color(this.C.accent), side: THREE.DoubleSide, transparent: true })); this.selRing.rotation.x = -Math.PI / 2; this.scene.add(this.selRing); }
    if (this.selRing) { this.selRing.visible = !!sb; if (sb) { this.selRing.position.copy(sb.g.getWorldPosition(new THREE.Vector3())).setY(0.4); this.selRing.scale.setScalar(1 + 0.08 * Math.sin(this.t * 5)); } }
  }

  // ------------------------------------------------------------------ camara, avisos y enfoque
  shots() { return [...this.districts.values()].map(d => ({ x: d.x, z: d.z, zoom: clamp(46 / (Math.max(d.w, d.dd) + 8), 1.6, 3.2) })); }
  locate(kind, id) {
    if (kind === 'app' || kind === 'site') { const b = this.buildings.get(id); if (b) { const p = b.g.getWorldPosition(new THREE.Vector3()); return { x: p.x, y: b.h / 2, z: p.z, zoom: 3.6 }; } }
    if (kind === 'session') { const r = this.robots.get(id); if (r) return { x: r.x, z: r.z, zoom: 3.8 }; }
    if (kind === 'district') { const d = this.districts.get(id); if (d) return { x: d.x, z: d.z, zoom: clamp(46 / (Math.max(d.w, d.dd) + 8), 1.6, 3.2) }; }
    if (kind === 'system' || kind === 'security') return { x: 0, y: 4, z: 0, zoom: 2.2 };
    return null;
  }
  tipFor(u) {
    if (u.kind === 'app' || u.kind === 'site') {
      const b = this.buildings.get(u.id); if (!b) return null;
      const a = b.data;
      return { title: a.name, body: `${a.kind && a.kind !== a.name ? `<b>${esc(a.kind)}</b> · ` : ''}${b.site ? 'sitio (edificio bajo)' : 'servicio'} · ${esc(b.acc.label)}`,
        meta: `${{ online: 'en línea', degraded: 'parcial', down: 'CAÍDO' }[a.status] || a.status}${!b.site ? ` · CPU ${(a.cpu || 0).toFixed(1)}% · RAM ${fmtBytes(a.mem || 0)}` : ''} · ${a.reqMin || 0} visitas/min`, hint: 'Clic para ver el detalle' };
    }
    if (u.kind === 'session') { const r = this.robots.get(u.id); return r && { title: 'Robot · agente de Claude Code', body: esc(r.s.activity || ''), meta: r.s.waitKind ? 'Espera su permiso o su respuesta' : { working: 'Trabajando', thinking: 'Pensando', idle: 'En pausa' }[r.s.state] || '', hint: 'Clic para ver la línea de tiempo' }; }
    if (u.kind === 'district') { const d = this.districts.get(u.id); return d && { title: d.a.label, body: 'Un distrito: una cuenta con sus servicios (edificios) y sitios (edificios bajos). Sus robots caminan por el frente.', meta: d.caption, hint: 'Clic para ver el distrito' }; }
    if (u.kind === 'system') return { title: 'Torre de control', body: 'El <b>servidor</b>: recibe todas las visitas y las reparte por las calles. Su escudo se enciende cuando repele un ataque.', meta: this.state?.system ? `CPU ${this.state.system.cpu.toFixed(0)}% · RAM ${this.state.system.mem.pct.toFixed(0)}% · carga ${this.state.system.load[0].toFixed(2)}` : '', hint: 'Clic para ver el servidor completo' };
    return null;
  }
}
