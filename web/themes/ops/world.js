// Tema "Ops": mesa tactica holografica en 3D (three.js), nitida y a resolucion completa.
//  - la mesa es un disco con anillos y rumbos; cada cuenta es un SECTOR con su nombre (y su cuenta de cPanel)
//  - cada servicio es una COLUMNA que sube con su CPU; cada sitio un PRISMA que sube con sus visitas;
//    verde bien, ambar a medias, rojo parpadeando caido; encima, su cartel en pixel art
//  - el BARRIDO gira y hace brillar cada columna al pasar
//  - en el centro, la BASE (el servidor) con su CUPULA de escudo
//  - cada visita es un punto de luz que cae en arco sobre su columna; cada intento de acceso, un MISIL
//    rojo contra la cupula (si la IP queda bloqueada: NEUTRALIZADO)
//  - cada sesion de Claude Code es un DRON sobre su sector (ambar con "!" si espera su permiso)
// Regla de oro: geometria limpia y textos nitidos; el pixel art va en los carteles; el color solo
// significa amigo, alerta u hostil.
import * as THREE from '/vendor/three.module.min.js';
import { signCanvas } from '/js/sprites.js';
import { esc, fmtBytes } from '/js/hud.js';
import { accountCaption } from '/js/accounts.js';

const R = 10;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const col = h => new THREE.Color(h);

export default class OpsWorld {
  constructor(el, { manifest } = {}) {
    this.el = el;
    const p = (manifest && manifest.palette) || {};
    this.C = { ok: p.ok || '#9fd356', warn: p.warn || '#f5a524', crit: p.crit || '#ff4d3d', ink: p.ink || '#d9e3c8', bg: p.bg || '#0b0d09', grid: '#3a4a2c', dim: '#5d6e48' };
    this.items = new Map(); this.sectors = new Map(); this.drones = new Map();
    this.fx = []; this.t = 0; this.layoutKey = '';
    this.directorOn = true; this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.orbit = { az: -0.6, el: 0.95, dist: 30, tx: 0, tz: 0, zoom: 1 };
    this.goal = { ...this.orbit };
    this.manualUntil = 0; this.shotT = 6; this.shotIdx = 0; this.sweep = 0; this.fitZoom = 1;
  }

  // ------------------------------------------------------------------ montaje
  async init() {
    this.ac = new AbortController();
    const sig = { signal: this.ac.signal };
    await document.fonts.load("24px 'VT323'").catch(() => { });
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(this.C.bg);
    this.el.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.labels = Object.assign(document.createElement('div'), { className: 'ops3-labels' });
    this.el.appendChild(this.labels);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.C.bg, 38, 70);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(8, 20, 6); this.scene.add(sun);
    this.buildTable();
    this.buildBase();
    this.buildSweep();
    this.itemsG = new THREE.Group(); this.scene.add(this.itemsG);
    this.fxG = new THREE.Group(); this.scene.add(this.fxG);
    this.ray = new THREE.Raycaster();
    this.setupNav(sig);
    window.addEventListener('resize', () => this.resize(), sig);
    this.resize();
    this.clock = new THREE.Clock();
    const loop = () => { this.raf = requestAnimationFrame(loop); this.tick(Math.min(this.clock.getDelta(), 0.1)); };
    loop();
  }
  destroy() {
    this.ac.abort(); cancelAnimationFrame(this.raf);
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
    this.renderer.dispose(); this.renderer.domElement.remove(); this.labels.remove();
  }

  // ------------------------------------------------------------------ mesa, base y barrido
  line(points, color, opacity = 1) {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  }
  buildTable() {
    const table = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 1.12, 96), new THREE.MeshStandardMaterial({ color: 0x10140c, roughness: 0.9, metalness: 0.1 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.02; table.add(disc);
    const pts = [];
    for (const f of [0.25, 0.5, 0.75, 1]) for (let i = 0; i < 128; i++) {
      const a = i / 128 * TAU, b = (i + 1) / 128 * TAU;
      pts.push(new THREE.Vector3(Math.cos(a) * R * f, 0, Math.sin(a) * R * f), new THREE.Vector3(Math.cos(b) * R * f, 0, Math.sin(b) * R * f));
    }
    for (let d = 0; d < 360; d += 10) {
      const a = d / 180 * Math.PI, l = d % 30 === 0 ? 0.6 : 0.25;
      pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R), new THREE.Vector3(Math.cos(a) * (R + l), 0, Math.sin(a) * (R + l)));
    }
    table.add(this.line(pts, this.C.dim, 0.9));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.12, 0.08, 8, 128), new THREE.MeshStandardMaterial({ color: 0x2b3322, metalness: 0.6, roughness: 0.4 }));
    rim.rotation.x = Math.PI / 2; table.add(rim);
    this.scene.add(table);
    this.sectorG = new THREE.Group(); this.scene.add(this.sectorG);
  }
  buildBase() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x1b2214, emissive: col(this.C.ok), emissiveIntensity: 0.15, metalness: 0.5, roughness: 0.4 }));
    core.position.y = 0.7; core.userData = { kind: 'system', id: 'root' };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: col(this.C.ok), wireframe: true, transparent: true, opacity: 0.18 }));
    g.add(core, dome);
    this.scene.add(g);
    this.base = { core, dome, flash: 0 };
    this.pickables = [core];
    this.baseLabel = this.mkLabel('ops3-base', 'BASE');
  }
  buildSweep() {
    this.sweepG = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(R, 32, 0, 0.045), new THREE.MeshBasicMaterial({ color: col(this.C.ok), transparent: true, opacity: 0.32 * (1 - i / 12), side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.01; m.rotation.z = -i * 0.045;
      this.sweepG.add(m);
    }
    this.scene.add(this.sweepG);
  }

  mkLabel(cls, html) {
    const d = document.createElement('div'); d.className = 'ops3-label ' + cls; d.innerHTML = html;
    this.labels.appendChild(d);
    return d;
  }
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * this.W, y: (1 - p.y) / 2 * this.H, behind: p.z > 1 };
  }

  // ------------------------------------------------------------------ sectores y columnas
  layout(state) {
    const accounts = state.accounts.filter(a => a.id !== 'root');
    const by = {};
    for (const a of state.apps) (by[a.account] = by[a.account] || []).push({ ...a, _k: 'app' });
    for (const x of state.sites || []) (by[x.account] = by[x.account] || []).push({ ...x, _k: 'site' });
    const key = accounts.map(a => a.id + ':' + (a.cpanel || '') + ':' + (by[a.id] || []).map(x => x.id).join(',')).join('|');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    for (const it of this.items.values()) { this.itemsG.remove(it.g); it.label.remove(); }
    for (const s of this.sectors.values()) s.label.remove();
    this.sectorG.clear(); this.items.clear(); this.sectors.clear();
    this.pickables = [this.base.core, ...[...this.drones.values()].map(d => d.mesh)];
    const list = accounts.filter(a => (by[a.id] || []).length);
    const weights = list.map(a => Math.max(4, by[a.id].length)), total = weights.reduce((n, w) => n + w, 0) || 1;
    let a0 = -Math.PI / 2;
    list.forEach((acc, i) => {
      const w = weights[i] / total * TAU, a1 = a0 + w, mid = a0 + w / 2;
      const wedge = new THREE.Mesh(new THREE.RingGeometry(2.3, R, 48, 1, -a1, w), new THREE.MeshBasicMaterial({ color: col(acc.color), transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
      wedge.rotation.x = -Math.PI / 2; wedge.position.y = 0.005; wedge.userData = { kind: 'district', id: acc.id };
      this.sectorG.add(wedge);
      this.sectorG.add(this.line([new THREE.Vector3(Math.cos(a0) * 2.3, 0.01, Math.sin(a0) * 2.3), new THREE.Vector3(Math.cos(a0) * R, 0.01, Math.sin(a0) * R)], acc.color, 0.7));
      const items = by[acc.id].sort((x, y) => (x._k === y._k ? 0 : x._k === 'app' ? -1 : 1));
      const nA = items.filter(x => x._k === 'app').length;
      const caption = accountCaption(acc, nA, items.length - nA);
      const label = this.mkLabel('ops3-sector', `<b style="border-color:${acc.color}">${esc(acc.label)}</b><small>${esc(caption)}</small>`);
      label.dataset.go = 'district:' + acc.id;
      this.sectors.set(acc.id, { acc, a0, a1, mid, label, wedge, caption, pos: new THREE.Vector3(Math.cos(mid) * (R + 1.2), 0, Math.sin(mid) * (R + 1.2)) });
      this.pickables.push(wedge);
      // anillos parejos desde la base hasta el borde; cada anillo con tantas columnas como quepan
      let radii = [6.2];
      for (let rows = 1; rows <= 9; rows++) {
        radii = rows === 1 ? [6.2] : Array.from({ length: rows }, (_, k) => 3.4 + k * (R * 0.9 - 3.4) / (rows - 1));
        if (radii.reduce((n, r) => n + Math.max(1, Math.floor(w * r / 0.95)), 0) >= items.length) break;
      }
      const caps = radii.map(r => Math.max(1, Math.floor(w * r / 0.95)));
      const totalCap = caps.reduce((n, c) => n + c, 0);
      // se reparte en proporcion a lo que entra en cada anillo (los de afuera llevan mas)
      const take = caps.map(c => Math.floor(items.length * c / totalCap));
      for (let k = 0, left = items.length - take.reduce((n, x) => n + x, 0); left > 0; k = (k + 1) % take.length) if (take[k] < caps[k]) { take[k]++; left--; }
      let idx = 0;
      radii.forEach((r, k) => { for (let j = 0; j < take[k]; j++) this.addItem(items[idx++], a0 + (j + 0.5) * (w / take[k]), r, acc); });
      a0 = a1;
    });
  }

  addItem(it, ang, r, acc) {
    const site = it._k === 'site';
    const geo = site ? new THREE.CylinderGeometry(0.26, 0.26, 1, 6) : new THREE.BoxGeometry(0.44, 1, 0.44);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: col(this.C.ok), emissive: col(this.C.ok), emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.5, transparent: site, opacity: site ? 0.9 : 1 });
    const mesh = new THREE.Mesh(geo, mat);
    const g = new THREE.Group(); g.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    g.add(mesh);
    // cartel pixel art encima (billboard, sin suavizado)
    const tex = new THREE.CanvasTexture(signCanvas(it.icon || 'web', 6));
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sign.scale.set(0.7, 0.7, 1);
    g.add(sign);
    mesh.userData = { kind: site ? 'site' : 'app', id: it.id };
    this.itemsG.add(g);
    this.pickables.push(mesh);
    const label = this.mkLabel('ops3-item', '');
    this.items.set(it.id, { g, mesh, sign, data: it, site, acc, ang: ((ang % TAU) + TAU) % TAU, r, h: 0.4, target: 0.4, lit: 0, flash: 0, label });
  }

  // ------------------------------------------------------------------ estado
  update(state) {
    this.state = state;
    this.layout(state);
    const top = new Set([...state.apps, ...(state.sites || [])].sort((x, y) => (y.reqMin || 0) - (x.reqMin || 0)).slice(0, 6).filter(x => x.reqMin > 0).map(x => x.id));
    for (const x of [...state.apps, ...(state.sites || [])]) {
      const it = this.items.get(x.id);
      if (!it) continue;
      const prev = it.data.status;
      it.data = { ...x, _k: it.site ? 'site' : 'app' };
      it.target = it.site ? 0.35 + clamp(Math.sqrt(x.reqMin || 0) * 0.35, 0, 3.2) : 0.4 + clamp((x.cpu || 0) / 100, 0, 1) * 3.2 + clamp(Math.log2(1 + (x.mem || 0) / 100e6) * 0.12, 0, 0.6);
      const c = x.status === 'down' ? this.C.crit : x.status === 'degraded' ? this.C.warn : this.C.ok;
      it.mesh.material.color.set(c); it.mesh.material.emissive.set(c);
      it.label.textContent = top.has(x.id) || x.status === 'down' ? x.name : '';
      it.label.classList.toggle('down', x.status === 'down');
      if (prev && prev !== x.status && x.status === 'down') this.float(it.g.position.clone().setY(it.h + 1), 'CAÍDO', 'crit');
    }
    this.failed = (state.keys || []).filter(k => k.state === 'failed').map(k => k.label);
    this.baseLabel.innerHTML = 'BASE<small>' + esc((state.keys || []).filter(k => k.state === 'active').map(k => k.label).filter(l => !['SSH', 'Cron'].includes(l)).slice(0, 4).join(' · ')) + '</small>';
    this.syncDrones(state.sessions || []);
  }

  syncDrones(sessions) {
    const seen = new Set(), per = {};
    sessions.forEach((s, n) => {
      seen.add(s.id);
      let d = this.drones.get(s.id);
      if (!d) {
        const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 3), new THREE.MeshStandardMaterial({ color: col(this.C.ink), emissive: col(this.C.ink), emissiveIntensity: 0.3 }));
        mesh.userData = { kind: 'session', id: s.id };
        this.scene.add(mesh); this.pickables.push(mesh);
        d = { mesh, label: this.mkLabel('ops3-drone', ''), s, ph: Math.random() * TAU };
        this.drones.set(s.id, d);
      }
      d.s = s;
      per[s.account] = (per[s.account] || 0) + 1; d.slot = per[s.account] - 1;
      d.label.innerHTML = `ESC-${String(n + 1).padStart(2, '0')}${s.waitKind ? ' <em>ESPERA PERMISO</em>' : ''}`;
    });
    for (const [id, d] of this.drones) if (!seen.has(id)) { this.scene.remove(d.mesh); d.label.remove(); this.pickables = this.pickables.filter(p => p !== d.mesh); this.drones.delete(id); }
  }

  // ------------------------------------------------------------------ eventos
  onEvent(e, priv) {
    switch (e.kind) {
      case 'http': return this.visit(e);
      case 'attack': return this.missile(false);
      case 'block': return this.missile(true, priv ? e.ip : null);
      case 'login': return this.float(new THREE.Vector3(0, 3, 0), priv && e.user ? `ACCESO SSH · ${e.user}` : 'ACCESO SSH', 'ok');
      case 'deploy': {
        const it = this.items.get(e.app);
        const T = { building: ['DESPLEGANDO', 'warn'], ready: ['DESPLEGADO', 'ok'], error: ['FALLÓ EL DESPLIEGUE', 'crit'], canceled: ['CANCELADO', 'dim'] }[e.action];
        if (it && T) { this.float(it.g.position.clone().setY(it.h + 1), T[0], T[1]); this.ring(it.g.position, T[1]); }
        return;
      }
      case 'pm2': { const it = this.items.get(e.app); if (it && e.action !== 'down') { this.float(it.g.position.clone().setY(it.h + 1), 'REINICIO', 'warn'); this.ring(it.g.position, 'warn'); } return; }
      case 'domain': { const s = this.sectors.get(e.account); if (s) this.float(new THREE.Vector3(Math.cos(s.mid) * R * 0.7, 1, Math.sin(s.mid) * R * 0.7), ({ added: 'NUEVO DOMINIO', removed: 'DOMINIO ELIMINADO', changed: 'SITIO CAMBIÓ' }[e.action] || '') + (priv && e.domain ? ` · ${e.domain}` : ''), e.action === 'removed' ? 'crit' : 'ok'); return; }
      case 'claude': {
        const d = this.drones.get(e.sid) || [...this.drones.entries()].find(([k]) => e.sid && k.startsWith(e.sid))?.[1];
        if (!d) return;
        if (e.action === 'permission') { this.urgent = { x: d.mesh.position.x, z: d.mesh.position.z, until: this.t + 12 }; this.float(d.mesh.position.clone().setY(d.mesh.position.y + 1), 'SOLICITA PERMISO', 'warn'); }
        else if (e.action === 'done') this.float(d.mesh.position.clone().setY(d.mesh.position.y + 1), 'MISIÓN CUMPLIDA', 'ok');
        return;
      }
    }
  }

  // visita: punto de luz que cae en arco desde el borde hasta su columna
  visit(e) {
    if (this.fx.length > 180) return;
    const it = this.items.get(e.app || e.site);
    const ang = it ? it.ang + (Math.random() - 0.5) * 0.1 : Math.random() * TAU;
    const from = new THREE.Vector3(Math.cos(ang) * (R + 1.5), 2.5, Math.sin(ang) * (R + 1.5));
    const to = it ? it.g.position.clone().setY(it.h + 0.05) : new THREE.Vector3(Math.cos(ang) * 3, 0, Math.sin(ang) * 3);
    const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).setY(Math.max(from.y, to.y) + 2), to);
    const c = e.status >= 500 ? this.C.crit : e.status >= 400 ? this.C.warn : e.bot ? this.C.dim : this.C.ink;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: col(c) }));
    this.fxG.add(m);
    const dur = 1 + Math.random() * 0.4;
    this.fx.push({ obj: m, age: 0, tick: f => { const k = f.age / dur; if (k >= 1) { if (it) { it.lit = 1; if (e.status >= 500) it.flash = 1; } return false; } m.position.copy(curve.getPoint(k)); return true; } });
  }

  // intento de acceso: misil rojo desde afuera que se estrella contra la cupula
  missile(blocked, ip) {
    const ang = Math.random() * TAU;
    const from = new THREE.Vector3(Math.cos(ang) * R * 1.8, 6, Math.sin(ang) * R * 1.8);
    const hit = new THREE.Vector3(Math.cos(ang) * 1.5, 1.1, Math.sin(ang) * 1.5);
    const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(hit, 0.5).setY(8), hit);
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), new THREE.MeshBasicMaterial({ color: col(this.C.crit) }));
    this.fxG.add(m);
    this.fx.push({ obj: m, age: 0, tick: f => {
      const k = f.age / 2.2;
      if (k >= 1) {
        this.base.flash = 1; this.ring(hit.clone().setY(0), 'crit', 2.6);
        if (blocked) this.float(hit.clone().setY(2.6), ip ? `NEUTRALIZADO · ${ip}` : 'NEUTRALIZADO', 'crit');
        return false;
      }
      const p = curve.getPoint(k), q = curve.getPoint(Math.min(1, k + 0.02));
      m.position.copy(p); m.lookAt(q); m.rotateX(Math.PI / 2);
      if (Math.random() < 0.5) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: col(this.C.crit), transparent: true, opacity: 0.6 }));
        s.position.copy(p); this.fxG.add(s);
        this.fx.push({ obj: s, age: 0, tick: g => { s.material.opacity = 0.6 * (1 - g.age / 0.8); return g.age < 0.8; } });
      }
      return true;
    } });
  }

  ring(pos, tone, size = 1.2) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 32), new THREE.MeshBasicMaterial({ color: col(this.C[tone] || this.C.ok), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.03, pos.z);
    this.fxG.add(m);
    this.fx.push({ obj: m, age: 0, tick: f => { const k = f.age / 1.1; m.scale.setScalar(1 + k * size * 3); m.material.opacity = 1 - k; return k < 1; } });
  }
  float(pos, text, tone) {
    const d = this.mkLabel('ops3-float ' + tone, esc(text));
    this.fx.push({ obj: null, dom: d, age: 0, pos: pos.clone(), tick: f => { f.pos.y += 0.012; d.style.opacity = f.age < 2.2 ? 1 : 1 - (f.age - 2.2) / 0.8; return f.age < 3; } });
  }

  // ------------------------------------------------------------------ cuadro a cuadro
  tick(dt) {
    this.t += dt;
    const prev = this.sweep;
    this.sweep = (this.sweep + dt * TAU / 6) % TAU;
    this.sweepG.rotation.y = -this.sweep;
    const passed = a => { const p = prev, c = this.sweep; return p <= c ? a > p && a <= c : a > p || a <= c; };
    const blink = Math.floor(this.t * 3) % 2 === 0;
    for (const it of this.items.values()) {
      it.h += (it.target - it.h) * Math.min(1, dt * 3);
      it.mesh.scale.y = it.h;
      it.sign.position.y = it.h + 0.45;
      if (passed(it.ang)) it.lit = 1;
      it.lit = Math.max(0, it.lit - dt * 0.5); it.flash = Math.max(0, it.flash - dt * 2);
      const down = it.data.status === 'down';
      it.mesh.material.emissiveIntensity = (down ? (blink ? 0.9 : 0.1) : 0.15) + it.lit * 0.9 + it.flash;
    }
    this.base.flash = Math.max(0, this.base.flash - dt * 1.5);
    const bad = this.failed && this.failed.length;
    this.base.dome.material.color.set(bad ? this.C.warn : this.base.flash > 0.1 ? this.C.crit : this.C.ok);
    this.base.dome.material.opacity = 0.14 + this.base.flash * 0.5 + (bad ? 0.1 * Math.sin(this.t * 4) : 0);
    this.base.dome.rotation.y += dt * 0.15;
    for (const d of this.drones.values()) {
      const s = this.sectors.get(d.s.account);
      const mid = s ? s.mid : -Math.PI / 2, r = R * 0.45 + (d.slot % 3) * 1.1;
      const a = mid + Math.sin(this.t * 0.35 + d.ph) * 0.15 + d.slot * 0.12;
      d.mesh.position.set(Math.cos(a) * r, 3.2 + Math.sin(this.t * 1.5 + d.ph) * 0.2, Math.sin(a) * r);
      d.mesh.rotation.set(Math.PI, 0, 0); d.mesh.rotation.y = this.t;
      const waiting = !!d.s.waitKind;
      const c = waiting ? this.C.warn : d.s.state === 'idle' ? this.C.dim : this.C.ink;
      d.mesh.material.color.set(c); d.mesh.material.emissive.set(c);
      d.mesh.material.emissiveIntensity = waiting ? (blink ? 1 : 0.2) : 0.3;
      d.label.classList.toggle('wait', waiting);
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.age += dt;
      if (!f.tick(f, dt)) { if (f.obj) { this.fxG.remove(f.obj); f.obj.geometry.dispose(); f.obj.material.dispose(); } if (f.dom) f.dom.remove(); this.fx.splice(i, 1); }
    }
    this.director(dt);
    const k = 1 - Math.pow(0.03, dt), o = this.orbit, g = this.goal;
    for (const key of ['el', 'dist', 'tx', 'tz', 'zoom']) o[key] += (g[key] - o[key]) * k;
    const dAz = ((g.az - o.az + Math.PI) % TAU + TAU) % TAU - Math.PI; o.az += dAz * k;
    this.camera.position.set(o.tx + Math.cos(o.az) * Math.cos(o.el) * o.dist, Math.sin(o.el) * o.dist, o.tz + Math.sin(o.az) * Math.cos(o.el) * o.dist);
    this.camera.lookAt(o.tx, 0, o.tz);
    this.camera.zoom = this.fitZoom * o.zoom; this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    if (this.manualUntil && this.manualUntil < this.t) { this.manualUntil = 0; this.resetGoal(); this.navChanged(); }
    else if (this.manualUntil && Math.floor(this.t) !== this.lastNav) { this.lastNav = Math.floor(this.t); this.navChanged(); }
  }

  placeLabels() {
    const put = (d, v) => { const p = this.toScreen(v); d.style.transform = `translate(${p.x | 0}px, ${p.y | 0}px)`; d.style.visibility = p.behind ? 'hidden' : ''; };
    put(this.baseLabel, new THREE.Vector3(0, -0.2, 2.4));
    for (const s of this.sectors.values()) put(s.label, s.pos);
    for (const it of this.items.values()) if (it.label.textContent) put(it.label, it.g.position.clone().setY(it.h + 0.9));
    for (const d of this.drones.values()) put(d.label, d.mesh.position.clone().setY(d.mesh.position.y + 0.6));
    for (const f of this.fx) if (f.dom) put(f.dom, f.pos);
    const s = this.selected;
    const it = s && this.items.get(s.id), d = s && this.drones.get(s.id);
    const pos = it ? it.g.position : d ? d.mesh.position : null;
    if (pos && !this.selRing) { this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: col(this.C.warn), side: THREE.DoubleSide, transparent: true })); this.selRing.rotation.x = -Math.PI / 2; this.scene.add(this.selRing); }
    if (this.selRing) {
      this.selRing.visible = !!pos;
      if (pos) { this.selRing.position.set(pos.x, it ? 0.04 : pos.y - 0.4, pos.z); this.selRing.scale.setScalar(1 + 0.15 * Math.sin(this.t * 6)); }
    }
  }

  // ------------------------------------------------------------------ camara y navegacion
  resize() {
    const r = this.el.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    this.renderer.setSize(this.W, this.H, false);
    this.renderer.domElement.style.width = this.W + 'px'; this.renderer.domElement.style.height = this.H + 'px';
    this.camera.aspect = this.W / this.H;
    this.setInsets(this.insets);
  }
  setInsets(ins) {
    this.insets = ins;
    if (!this.camera || !this.W) return;
    const aw = Math.max(200, this.W - ins.left - ins.right), ah = Math.max(200, this.H - ins.top - ins.bottom);
    // la mesa se ve en el area libre: se corre el centro de la vista y se ajusta el zoom
    const cx = ins.left + aw / 2, cy = ins.top + ah / 2;
    this.camera.setViewOffset(this.W, this.H, this.W / 2 - cx, this.H / 2 - cy, this.W, this.H);
    this.fitZoom = Math.min(aw / this.W, ah / this.H) * 1.22;
    this.camera.updateProjectionMatrix();
  }
  resetGoal() { Object.assign(this.goal, { el: 0.95, dist: 30, tx: 0, tz: 0, zoom: 1 }); }
  director(dt) {
    if (this.manualUntil) return;
    if (this.urgent && this.urgent.until > this.t) { Object.assign(this.goal, { tx: this.urgent.x, tz: this.urgent.z, zoom: 1.9, el: 0.8 }); return; }
    this.urgent = null;
    if (!this.directorOn) { this.resetGoal(); return; }
    this.goal.az += dt * 0.06; // orbita lenta
    this.shotT -= dt;
    if (this.shotT > 0) return;
    const secs = [...this.sectors.values()];
    this.shotIdx = (this.shotIdx + 1) % (secs.length * 2 || 1);
    if (this.shotIdx % 2 === 0 || !secs.length) { this.resetGoal(); this.shotT = 12; return; }
    const s = secs[Math.floor(this.shotIdx / 2) % secs.length];
    Object.assign(this.goal, { tx: Math.cos(s.mid) * R * 0.55, tz: Math.sin(s.mid) * R * 0.55, zoom: 1.7, el: 0.75, az: s.mid + Math.PI * 0.15 });
    this.shotT = 12;
  }
  setDirector(on) { this.directorOn = on; this.shotT = 0; }
  navState() { return this.manualUntil ? { mode: 'manual', left: Math.max(0, Math.ceil(this.manualUntil - this.t)) } : { mode: this.directorOn ? 'director' : 'fixed' }; }
  navChanged() { if (this.onNav) this.onNav(this.navState()); }
  manual() { this.manualUntil = this.t + 90; this.navChanged(); }
  resetView() { this.manualUntil = 0; this.resetGoal(); this.shotT = 12; this.navChanged(); }
  zoomBy(f) { this.manual(); this.goal.zoom = clamp(this.goal.zoom * f, 0.6, 5); }
  pick(kind, id) {
    this.selected = { kind, id };
    let p = null;
    if (kind === 'app' || kind === 'site') { const it = this.items.get(id); if (it) p = { x: it.g.position.x, z: it.g.position.z, zoom: 2.8 }; }
    else if (kind === 'session') { const d = this.drones.get(id); if (d) p = { x: d.mesh.position.x, z: d.mesh.position.z, zoom: 2.5 }; }
    else if (kind === 'district') { const s = this.sectors.get(id); if (s) p = { x: Math.cos(s.mid) * R * 0.55, z: Math.sin(s.mid) * R * 0.55, zoom: 1.8 }; }
    else if (kind === 'system' || kind === 'security') p = { x: 0, z: 0, zoom: 2.2 };
    if (p) { this.manual(); Object.assign(this.goal, { tx: p.x, tz: p.z, zoom: p.zoom, el: 0.8 }); }
    if (this.onSelect) this.onSelect(kind, id);
  }
  clearSelection() { this.selected = null; }

  hitTest(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hits = this.ray.intersectObjects(this.pickables, false);
    // prioridad: columnas, drones y base antes que la cuna del sector
    return (hits.find(h => h.object.userData.kind !== 'district') || hits[0] || {}).object?.userData || null;
  }
  tipFor(u) {
    if (!u) return null;
    if (u.kind === 'app' || u.kind === 'site') {
      const it = this.items.get(u.id); if (!it) return null;
      const a = it.data;
      return { title: a.name, body: `${a.kind && a.kind !== a.name ? `<b>${esc(a.kind)}</b> · ` : ''}${it.site ? 'sitio (prisma)' : 'servicio (columna)'} · ${esc(it.acc.label)}`,
        meta: `${{ online: 'en línea', degraded: 'parcial', down: 'CAÍDO' }[a.status] || a.status}${!it.site ? ` · CPU ${(a.cpu || 0).toFixed(1)}% · RAM ${fmtBytes(a.mem || 0)}` : ''} · ${a.reqMin || 0} visitas/min`, hint: 'Clic para ver el detalle' };
    }
    if (u.kind === 'session') { const d = this.drones.get(u.id); return d && { title: 'Dron · agente de Claude Code', body: esc(d.s.activity || ''), meta: d.s.waitKind ? 'Espera su permiso o su respuesta' : { working: 'Trabajando', thinking: 'Pensando', idle: 'En pausa' }[d.s.state] || '', hint: 'Clic para ver la línea de tiempo' }; }
    if (u.kind === 'district') { const s = this.sectors.get(u.id); return s && { title: s.acc.label, body: 'Sector: una cuenta con sus servicios (columnas) y sitios (prismas).', meta: s.caption, hint: 'Clic para ver el sector' }; }
    if (u.kind === 'system') return { title: 'Base', body: 'El <b>servidor</b>. La cúpula es el escudo: los misiles (intentos de acceso) se estrellan contra ella.', meta: this.state?.system ? `CPU ${this.state.system.cpu.toFixed(0)}% · RAM ${this.state.system.mem.pct.toFixed(0)}% · carga ${this.state.system.load[0].toFixed(2)}` : '', hint: 'Clic para ver el servidor completo' };
    return null;
  }
  setupNav(sig) {
    const cv = this.renderer.domElement;
    let start = null, last = null;
    cv.style.touchAction = 'none';
    window.addEventListener('pointerdown', e => { if (e.target !== cv) return; start = last = { x: e.clientX, y: e.clientY }; this.dragMoved = false; }, { capture: true, signal: sig.signal });
    window.addEventListener('pointermove', e => {
      if (start) {
        if (!this.dragMoved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) this.dragMoved = true;
        if (this.dragMoved) {
          if (!this.manualUntil) this.manual(); else this.manualUntil = this.t + 90;
          this.goal.az += (e.clientX - last.x) * 0.006; this.orbit.az = this.goal.az;
          this.goal.el = clamp(this.goal.el + (e.clientY - last.y) * 0.004, 0.35, 1.45); this.orbit.el = this.goal.el;
          if (this.onTip) this.onTip(null);
        }
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.target !== cv) return;
      const u = this.hitTest(e.clientX, e.clientY);
      cv.style.cursor = u ? 'pointer' : 'grab';
      if (this.onTip) this.onTip(this.tipFor(u), e.clientX, e.clientY);
    }, sig);
    window.addEventListener('pointerup', e => {
      if (start && !this.dragMoved && e.target === cv) { const u = this.hitTest(e.clientX, e.clientY); if (u) this.pick(u.kind, u.id); }
      start = null;
    }, sig);
    cv.addEventListener('pointerleave', () => this.onTip && this.onTip(null), sig);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false, signal: sig.signal });
    cv.addEventListener('dblclick', () => this.resetView(), sig);
    // nombres de sector: clic para abrir su detalle
    this.labels.addEventListener('click', e => { const el = e.target.closest('[data-go]'); if (el) { const [k, ...r] = el.dataset.go.split(':'); this.pick(k, r.join(':')); } }, sig);
  }
}
