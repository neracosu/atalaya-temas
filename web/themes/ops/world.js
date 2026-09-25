// Tema "Ops": radar tactico en pixel art (vista polar desde arriba).
//  - el centro es la BASE (el servidor); cada cuenta es un SECTOR del radar
//  - cada servicio o sitio es un contacto amigo; el barrido lo ilumina al pasar
//  - las visitas son trazas que entran desde el borde; los ataques, contactos hostiles que chocan con el escudo
//  - las sesiones de Claude Code son ESCUADRAS (triangulos) en su sector
// Se dibuja a media resolucion y se escala sin suavizado: todo queda en pixeles gruesos.
// Regla de oro del tema: nada redondeado, el color solo significa algo (amigo, alerta, hostil).
import { Application, Container, Graphics, Text, Rectangle } from '/vendor/pixi.csp.mjs';
import { esc, fmtBytes } from '/js/hud.js';
import { accountCaption } from '/js/accounts.js';

const TAU = Math.PI * 2;
const hexn = h => parseInt(String(h || '#ffffff').slice(1), 16);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const R = 460; // radio del radar en unidades de mundo
const FONT = "'VT323', ui-monospace, monospace";

export default class OpsWorld {
  constructor(el, { manifest } = {}) {
    this.el = el;
    const p = (manifest && manifest.palette) || {};
    this.C = { ok: hexn(p.ok || '#9fd356'), warn: hexn(p.warn || '#f5a524'), crit: hexn(p.crit || '#ff4d3d'), ink: hexn(p.ink || '#d9e3c8'),
      dim: 0x4b5a3a, grid: 0x243020, bg: hexn(p.bg || '#0b0d09'), friendly: hexn(p.friendly || '#9fd356') };
    this.blips = new Map(); this.sectors = new Map(); this.squads = new Map();
    this.fx = []; this.t = 0; this.sweep = 0; this.layoutKey = '';
    this.directorOn = true; this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.cam = { s: 1, x: 0, y: 0 }; this.camTarget = null; this.manualUntil = 0; this.shotT = 0; this.shotIdx = 0;
  }

  async init() {
    this.ac = new AbortController();
    const sig = { signal: this.ac.signal };
    await document.fonts.load(`32px ${FONT}`).catch(() => { });
    this.app = new Application();
    // media resolucion + sin suavizado = pixeles gruesos
    await this.app.init({ resizeTo: this.el, background: this.C.bg, antialias: false, autoDensity: false, resolution: 0.5, roundPixels: true, preference: 'webgl' });
    this.app.canvas.style.imageRendering = 'pixelated';
    this.app.canvas.style.width = '100%'; this.app.canvas.style.height = '100%';
    this.el.appendChild(this.app.canvas);
    this.world = new Container();
    this.bg = new Graphics(); this.bgText = new Container(); this.sectorG = new Graphics(); this.sweepG = new Graphics(); this.selG = new Graphics();
    this.blipL = new Container(); this.squadL = new Container(); this.fxL = new Container(); this.labelL = new Container();
    this.world.addChild(this.bg, this.bgText, this.sectorG, this.sweepG, this.selG, this.blipL, this.squadL, this.fxL, this.labelL);
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.drawGrid();
    this.buildBase();
    this.setupNav(sig);
    this.app.ticker.add(tk => this.tick(Math.min(tk.deltaMS / 1000, 0.1)));
    window.addEventListener('resize', () => this.fit(), sig);
    this.fit(true);
  }

  destroy() { this.ac.abort(); this.app.destroy({ removeView: true }, { children: true }); }

  // ------------------------------------------------------------------ fondo: anillos, rumbos y cuadricula
  drawGrid() {
    const g = this.bg, C = this.C;
    g.clear();
    for (let x = -R - 200; x <= R + 200; x += 40) g.moveTo(x, -R - 200).lineTo(x, R + 200);
    for (let y = -R - 200; y <= R + 200; y += 40) g.moveTo(-R - 200, y).lineTo(R + 200, y);
    g.stroke({ width: 1, color: C.grid, alpha: 0.5 });
    for (const f of [0.25, 0.5, 0.75, 1]) g.circle(0, 0, R * f).stroke({ width: f === 1 ? 3 : 2, color: C.dim, alpha: f === 1 ? 0.9 : 0.55 });
    for (let d = 0; d < 360; d += 10) {
      const a = d / 180 * Math.PI - Math.PI / 2, l = d % 30 === 0 ? 18 : 8;
      g.moveTo(Math.cos(a) * R, Math.sin(a) * R).lineTo(Math.cos(a) * (R + l), Math.sin(a) * (R + l));
      if (d % 30 === 0) {
        const t = new Text({ text: String(d).padStart(3, '0'), style: { fontFamily: FONT, fontSize: 24, fill: C.dim } });
        t.anchor.set(0.5); t.x = Math.cos(a) * (R + 40); t.y = Math.sin(a) * (R + 40);
        this.bgText.addChild(t);
      }
    }
    g.stroke({ width: 2, color: C.dim });
  }

  buildBase() {
    const C = this.C;
    const base = new Container();
    const sq = new Graphics().rect(-18, -18, 36, 36).fill({ color: C.bg }).stroke({ width: 3, color: C.ink }).rect(-6, -6, 12, 12).fill(C.ink);
    this.shield = new Graphics();
    const lbl = new Text({ text: 'BASE', style: { fontFamily: FONT, fontSize: 30, fill: C.ink, letterSpacing: 2 } });
    lbl.anchor.set(0.5, 0); lbl.y = 26;
    this.baseTag = new Text({ text: '', style: { fontFamily: FONT, fontSize: 22, fill: C.dim } });
    this.baseTag.anchor.set(0.5, 0); this.baseTag.y = 54;
    base.addChild(this.shield, sq, lbl, this.baseTag);
    base.eventMode = 'static'; base.cursor = 'pointer'; base.hitArea = new Rectangle(-60, -40, 120, 110);
    base.on('pointertap', () => { if (!this.dragMoved) this.pick('system', 'root'); });
    this.tipOn(base, () => ({ title: 'Base', body: 'El <b>servidor</b>. El anillo es el <b>escudo</b>: los contactos hostiles (intentos de acceso) chocan contra él.',
      meta: this.state?.system ? `CPU ${this.state.system.cpu.toFixed(0)}% · RAM ${this.state.system.mem.pct.toFixed(0)}% · carga ${this.state.system.load[0].toFixed(2)}` : '', hint: 'Clic para ver el servidor completo' }));
    this.labelL.addChild(base);
    this.base = base;
    this.shieldFlash = 0;
  }

  // ------------------------------------------------------------------ sectores y contactos
  layout(state) {
    const accounts = state.accounts.filter(a => a.id !== 'root');
    const by = {};
    for (const a of state.apps) (by[a.account] = by[a.account] || []).push({ ...a, _k: 'app' });
    for (const x of state.sites || []) (by[x.account] = by[x.account] || []).push({ ...x, _k: 'site' });
    const key = accounts.map(a => a.id + ':' + (by[a.id] || []).map(x => x.id).join(',')).join('|');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    for (const b of this.blips.values()) b.c.destroy({ children: true });
    for (const s of this.sectors.values()) { s.label.destroy(); s.sub.destroy(); }
    this.blips.clear(); this.sectors.clear();
    const C = this.C, g = this.sectorG;
    g.clear();
    // cada sector con un minimo de ancho, para que los chicos no queden como una linea
    const weights = accounts.map(a => Math.max(4, (by[a.id] || []).length));
    const total = weights.reduce((n, w) => n + w, 0) || 1;
    let a0 = -Math.PI / 2;
    accounts.forEach((acc, i) => {
      const w = weights[i] / total * TAU, a1 = a0 + w, mid = a0 + w / 2;
      g.moveTo(Math.cos(a0) * 70, Math.sin(a0) * 70).lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
      const short = acc.label.replace(/^Distrito\s+/i, '').replace(/^Servicios del\s+/i, '').toUpperCase().slice(0, 14);
      const label = new Text({ text: 'SECTOR ' + short, style: { fontFamily: FONT, fontSize: 28, fill: C.ink, letterSpacing: 2 } });
      // sectores angostos: nombres escalonados hacia afuera para que no se encimen
      const lr = R + 80 + (w < 0.6 ? (i % 2) * 46 : 0);
      label.anchor.set(0.5); label.x = Math.cos(mid) * lr; label.y = Math.sin(mid) * lr;
      label.eventMode = 'static'; label.cursor = 'pointer';
      label.on('pointertap', () => { if (!this.dragMoved) this.pick('district', acc.id); });
      this.tipOn(label, () => ({ title: acc.label, body: `Sector con ${(by[acc.id] || []).length} contactos: servicios (cuadrados llenos) y sitios (cuadrados vacíos).`, meta: this.sectors.get(acc.id)?.caption || '', hint: 'Clic para ver el sector' }));
      this.labelL.addChild(label);
      const nA = (by[acc.id] || []).filter(x => x._k === 'app').length;
      const caption = accountCaption(acc, nA, (by[acc.id] || []).length - nA);
      const sub = new Text({ text: caption.toUpperCase(), style: { fontFamily: FONT, fontSize: 20, fill: C.dim, letterSpacing: 1 } });
      sub.anchor.set(0.5); sub.x = label.x; sub.y = label.y + 24;
      this.labelL.addChild(sub);
      this.sectors.set(acc.id, { a0, a1, mid, label, sub, acc, caption });
      // contactos en anillos, de adentro hacia afuera
      const items = (by[acc.id] || []).sort((x, y) => (x._k === y._k ? 0 : x._k === 'app' ? -1 : 1));
      let ring = 0, placed = 0;
      for (const it of items) {
        let r = R * (0.36 + ring * 0.105);
        const cap = Math.max(1, Math.floor((w * r) / 46));
        const slot = placed;
        const ang = a0 + (slot + 0.5) * (w / cap);
        placed++;
        if (placed >= cap) { ring++; placed = 0; }
        if (ring > 5) { ring = 5; }
        this.addBlip(it, ang, Math.min(r, R * 0.93), acc);
      }
      a0 = a1;
    });
    g.stroke({ width: 2, color: C.dim, alpha: 0.8 });
    this.fit(true);
  }

  addBlip(it, ang, r, acc) {
    const c = new Container();
    c.x = Math.cos(ang) * r; c.y = Math.sin(ang) * r;
    const g = new Graphics();
    const lbl = new Text({ text: '', style: { fontFamily: FONT, fontSize: 22, fill: this.C.ink } });
    lbl.x = 14; lbl.y = -12;
    c.addChild(g, lbl);
    c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new Rectangle(-18, -18, 36, 36);
    const b = { c, g, lbl, ang: ((ang % TAU) + TAU) % TAU, r, data: it, kind: it._k, acc, lit: 0, flash: 0 };
    c.on('pointertap', () => { if (!this.dragMoved) this.pick(b.kind, it.id); });
    this.tipOn(c, () => {
      const a = b.data;
      const st = { online: 'en línea', degraded: 'parcial', down: 'CAÍDO' }[a.status] || a.status;
      return { title: a.name, body: `${a.kind && a.kind !== a.name ? `<b>${esc(a.kind)}</b> · ` : ''}${b.kind === 'site' ? 'sitio' : 'servicio'} del ${esc(acc.label)}`,
        meta: `${st}${b.kind === 'app' ? ` · CPU ${(a.cpu || 0).toFixed(1)}% · RAM ${fmtBytes(a.mem || 0)}` : ''} · ${a.reqMin || 0} visitas/min`, hint: 'Clic para ver el detalle' };
    });
    this.blipL.addChild(c);
    this.blips.set(it.id, b);
    this.drawBlip(b);
  }

  drawBlip(b) {
    const a = b.data, C = this.C;
    const col = a.status === 'down' ? C.crit : a.status === 'degraded' ? C.warn : C.friendly;
    const s = clamp(8 + Math.sqrt(a.reqMin || 0) * 2, 8, 18);
    const g = b.g; g.clear();
    if (b.kind === 'app') g.rect(-s / 2, -s / 2, s, s).fill(col);
    else g.rect(-s / 2, -s / 2, s, s).stroke({ width: 3, color: col });
    b.col = col; b.size = s;
  }

  // ------------------------------------------------------------------ estado
  update(state) {
    this.state = state;
    this.layout(state);
    const labeled = new Set([...state.apps, ...(state.sites || [])].sort((x, y) => (y.reqMin || 0) - (x.reqMin || 0)).slice(0, 8).filter(x => x.reqMin > 0).map(x => x.id));
    for (const x of [...state.apps, ...(state.sites || [])]) {
      const b = this.blips.get(x.id);
      if (!b) continue;
      const prev = b.data.status;
      b.data = { ...x, _k: b.kind };
      this.drawBlip(b);
      const show = labeled.has(x.id) || x.status === 'down';
      const txt = show ? String(x.name).toUpperCase().slice(0, 18) : '';
      if (b.lbl.text !== txt) b.lbl.text = txt;
      b.lbl.style.fill = x.status === 'down' ? this.C.crit : this.C.ink;
      if (prev && prev !== x.status && x.status === 'down') this.pulse(b.c.x, b.c.y, this.C.crit, 'CAÍDO');
    }
    const act = (state.keys || []).filter(k => k.state === 'active').map(k => k.label.toUpperCase()).filter(l => !['SSH', 'CRON'].includes(l)).slice(0, 4).join(' · ');
    if (this.baseTag.text !== act) this.baseTag.text = act;
    this.failed = (state.keys || []).filter(k => k.state === 'failed').map(k => k.label);
    this.syncSquads(state.sessions || []);
  }

  syncSquads(sessions) {
    const seen = new Set();
    const per = {};
    for (const s of sessions) {
      seen.add(s.id);
      let q = this.squads.get(s.id);
      if (!q) {
        const c = new Container();
        const g = new Graphics();
        const t = new Text({ text: '', style: { fontFamily: FONT, fontSize: 22, fill: this.C.ink } });
        t.anchor.set(0.5, 0); t.y = 12;
        c.addChild(g, t);
        c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new Rectangle(-20, -20, 40, 44);
        c.on('pointertap', () => { if (!this.dragMoved) this.pick('session', s.id); });
        this.tipOn(c, () => ({ title: 'Escuadra · agente de Claude Code', body: `${esc(q.s.activity || '')}${q.s.subagents && q.s.subagents.length ? ` · ${q.s.subagents.length} subagente(s)` : ''}`,
          meta: q.s.waitKind ? 'Espera su permiso o su respuesta' : { working: 'Trabajando', thinking: 'Pensando', idle: 'En pausa' }[q.s.state] || '', hint: 'Clic para ver la línea de tiempo' }));
        this.squadL.addChild(c);
        q = { c, g, t, s, phase: Math.random() * TAU };
        this.squads.set(s.id, q);
      }
      q.s = s;
      per[s.account] = (per[s.account] || 0) + 1;
      q.slot = per[s.account] - 1;
      q.t.text = 'ESC-' + String(sessions.indexOf(s) + 1).padStart(2, '0') + (s.subagents && s.subagents.length ? ` +${s.subagents.length}` : '');
    }
    for (const [id, q] of this.squads) if (!seen.has(id)) { q.c.destroy({ children: true }); this.squads.delete(id); }
  }

  // ------------------------------------------------------------------ eventos
  onEvent(e, priv) {
    const C = this.C;
    switch (e.kind) {
      case 'http': return this.trace(e);
      case 'attack': return this.hostile(false);
      case 'block': return this.hostile(true, priv ? e.ip : null);
      case 'login': return this.pulse(0, 0, C.ok, priv && e.user ? `ACCESO SSH ${e.user.toUpperCase()}` : 'ACCESO SSH');
      case 'mail': return this.streak(e.dir === 'in', e.dir === 'bounce' ? C.crit : C.dim);
      case 'deploy': {
        const b = this.blips.get(e.app);
        const T = { building: ['DESPLEGANDO', C.warn], ready: ['DESPLEGADO', C.ok], error: ['FALLÓ EL DESPLIEGUE', C.crit], canceled: ['CANCELADO', C.dim] }[e.action];
        if (b && T) this.pulse(b.c.x, b.c.y, T[1], T[0]);
        return;
      }
      case 'pm2': { const b = this.blips.get(e.app); if (b) this.pulse(b.c.x, b.c.y, e.action === 'down' ? C.crit : C.warn, e.action === 'down' ? 'CAÍDA' : 'REINICIO'); return; }
      case 'domain': {
        const s = this.sectors.get(e.account);
        if (s) this.pulse(Math.cos(s.mid) * R * 0.7, Math.sin(s.mid) * R * 0.7, e.action === 'removed' ? C.crit : C.ok, { added: 'NUEVO DOMINIO', removed: 'DOMINIO ELIMINADO', changed: 'SITIO CAMBIÓ' }[e.action] || '');
        return;
      }
      case 'claude': {
        const q = this.squads.get(e.sid) || [...this.squads.entries()].find(([k]) => e.sid && k.startsWith(e.sid))?.[1];
        if (!q) return;
        if (e.action === 'permission') { this.pulse(q.c.x, q.c.y, C.warn, 'SOLICITA PERMISO'); this.urgent = { x: q.c.x, y: q.c.y, until: this.t + 12 }; }
        else if (e.action === 'done') this.pulse(q.c.x, q.c.y, C.ok, 'MISIÓN CUMPLIDA');
        else if (e.action === 'error') this.pulse(q.c.x, q.c.y, C.crit, '');
        return;
      }
    }
  }

  addFx(obj, tick) { this.fxL.addChild(obj); this.fx.push({ obj, tick, age: 0 }); }

  // visita: traza que entra desde el borde hasta su contacto
  trace(e) {
    if (this.fx.length > 220) return;
    const b = this.blips.get(e.app || e.site);
    const ang = b ? b.ang + (Math.random() - 0.5) * 0.06 : Math.random() * TAU;
    const to = b ? { x: b.c.x, y: b.c.y } : { x: Math.cos(ang) * R * 0.3, y: Math.sin(ang) * R * 0.3 };
    const col = e.status >= 500 ? this.C.crit : e.status >= 400 ? this.C.warn : e.bot ? this.C.dim : this.C.ink;
    const g = new Graphics().rect(-2, -2, 4, 4).fill(col);
    g.x = Math.cos(ang) * (R + 20); g.y = Math.sin(ang) * (R + 20);
    const sp = 520 + Math.random() * 200;
    this.addFx(g, (f, dt) => {
      const dx = to.x - g.x, dy = to.y - g.y, d = Math.hypot(dx, dy), st = sp * dt;
      if (d <= st) { if (b) { b.lit = 1; if (e.status >= 500) b.flash = 1; } return false; }
      g.x += dx / d * st; g.y += dy / d * st;
      return true;
    });
  }

  // intento de acceso: contacto hostil que viene desde un rumbo al azar y choca con el escudo
  hostile(blocked, ip) {
    const C = this.C, ang = Math.random() * TAU;
    const c = new Container();
    const g = new Graphics().moveTo(0, -9).lineTo(9, 0).lineTo(0, 9).lineTo(-9, 0).closePath().fill(C.crit);
    c.addChild(g);
    c.x = Math.cos(ang) * (R + 60); c.y = Math.sin(ang) * (R + 60);
    const hit = { x: Math.cos(ang) * 64, y: Math.sin(ang) * 64 };
    this.addFx(c, (f, dt) => {
      const dx = hit.x - c.x, dy = hit.y - c.y, d = Math.hypot(dx, dy), st = 230 * dt;
      g.visible = Math.floor(f.age * 6) % 2 === 0 || d < 120;
      if (d <= st) {
        this.shieldFlash = 1;
        this.cross(hit.x, hit.y);
        if (blocked) this.floatText(hit.x, hit.y - 30, ip ? `NEUTRALIZADO ${ip}` : 'NEUTRALIZADO', C.crit);
        return false;
      }
      c.x += dx / d * st; c.y += dy / d * st;
      return true;
    });
  }

  cross(x, y) {
    const g = new Graphics().moveTo(-10, -10).lineTo(10, 10).moveTo(10, -10).lineTo(-10, 10).stroke({ width: 4, color: this.C.crit });
    g.x = x; g.y = y;
    this.addFx(g, f => { g.alpha = 1 - f.age / 1.6; return f.age < 1.6; });
  }

  streak(inbound, col) {
    const ang = Math.random() * TAU;
    const g = new Graphics().rect(-3, -3, 6, 6).fill(col);
    const from = inbound ? R + 20 : 20, to = inbound ? 20 : R + 20;
    this.addFx(g, f => {
      const k = Math.min(1, f.age / 1.4), r = from + (to - from) * k;
      g.x = Math.cos(ang) * r; g.y = Math.sin(ang) * r;
      return k < 1;
    });
  }

  pulse(x, y, col, text) {
    const g = new Graphics(); g.x = x; g.y = y;
    this.addFx(g, f => {
      const k = f.age / 1.2;
      g.clear().rect(-10 - k * 40, -10 - k * 40, 20 + k * 80, 20 + k * 80).stroke({ width: 3, color: col, alpha: 1 - k });
      return k < 1;
    });
    if (text) this.floatText(x, y - 34, text, col);
  }

  floatText(x, y, text, col) {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 28, fill: col, letterSpacing: 2 } });
    t.anchor.set(0.5); t.x = x; t.y = y;
    const bg = new Graphics().rect(-t.width / 2 - 6, -t.height / 2 - 2, t.width + 12, t.height + 4).fill({ color: this.C.bg, alpha: 0.85 }).stroke({ width: 2, color: col });
    const c = new Container(); c.addChild(bg, t); c.x = x; c.y = y; t.x = 0; t.y = 0;
    this.addFx(c, f => { c.y = y - f.age * 18; c.alpha = f.age < 2.4 ? 1 : 1 - (f.age - 2.4) / 0.6; return f.age < 3; });
  }

  // ------------------------------------------------------------------ cuadro a cuadro
  tick(dt) {
    this.t += dt;
    const C = this.C;
    // barrido: ~6 s por vuelta, con estela
    const prev = this.sweep;
    this.sweep = (this.sweep + dt * TAU / 6) % TAU;
    const sw = this.sweepG; sw.clear();
    for (let i = 0; i < 14; i++) {
      const a = this.sweep - Math.PI / 2 - i * 0.035;
      sw.moveTo(0, 0).lineTo(Math.cos(a) * R, Math.sin(a) * R).stroke({ width: i === 0 ? 4 : 6, color: C.friendly, alpha: i === 0 ? 0.9 : 0.16 * (1 - i / 14) });
    }
    const cur = (this.sweep - Math.PI / 2 + TAU) % TAU, pre = (prev - Math.PI / 2 + TAU) % TAU;
    const passed = a => (pre <= cur ? a > pre && a <= cur : a > pre || a <= cur);
    for (const b of this.blips.values()) {
      if (passed(b.ang)) b.lit = 1;
      b.lit = Math.max(0, b.lit - dt * 0.4);
      b.flash = Math.max(0, b.flash - dt * 1.5);
      const blink = b.data.status === 'down' ? (Math.floor(this.t * 3) % 2 ? 1 : 0.3) : 1;
      b.g.alpha = (0.35 + 0.65 * b.lit) * blink;
      b.g.scale.set(1 + b.flash * 0.6);
    }
    // escudo: se enciende al chocar un hostil; ambar si un servicio clave fallo
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 1.4);
    const bad = this.failed && this.failed.length;
    this.shield.clear();
    for (let i = 0; i < 24; i++) {
      const a0 = i / 24 * TAU + this.t * 0.2, a1 = a0 + TAU / 48;
      this.shield.moveTo(Math.cos(a0) * 64, Math.sin(a0) * 64).lineTo(Math.cos(a1) * 64, Math.sin(a1) * 64);
    }
    this.shield.stroke({ width: 3 + this.shieldFlash * 3, color: bad ? C.warn : this.shieldFlash > 0.1 ? C.crit : C.friendly, alpha: 0.5 + this.shieldFlash * 0.5 });
    // escuadras: orbitan su sector
    for (const q of this.squads.values()) {
      const s = this.sectors.get(q.s.account);
      const mid = s ? s.mid : -Math.PI / 2;
      const r = R * (0.2 + (q.slot % 3) * 0.05);
      const a = mid + Math.sin(this.t * 0.4 + q.phase) * 0.12 + q.slot * 0.14;
      q.c.x = Math.cos(a) * r; q.c.y = Math.sin(a) * r;
      const waiting = !!q.s.waitKind;
      const col = waiting ? C.warn : q.s.state === 'idle' ? C.dim : C.ink;
      const on = waiting ? Math.floor(this.t * 3) % 2 === 0 : true;
      q.g.clear().moveTo(0, -12).lineTo(11, 9).lineTo(-11, 9).closePath().fill({ color: col, alpha: on ? 1 : 0.3 });
      if (waiting) q.g.rect(-2, -26, 4, 8).fill(C.warn).rect(-2, -16, 4, 3).fill(C.warn);
      q.t.style.fill = col;
    }
    // efectos
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.age += dt;
      if (!f.tick(f, dt)) { f.obj.destroy({ children: true }); this.fx.splice(i, 1); }
    }
    this.drawSelection();
    this.director(dt);
    // camara suave
    if (this.camTarget) {
      const k = 1 - Math.pow(0.02, dt);
      this.cam.s += (this.camTarget.s - this.cam.s) * k; this.cam.x += (this.camTarget.x - this.cam.x) * k; this.cam.y += (this.camTarget.y - this.cam.y) * k;
    }
    const W = this.app.screen.width, H = this.app.screen.height;
    this.world.scale.set(this.cam.s);
    this.world.x = W / 2 + this.cam.x; this.world.y = H / 2 + this.cam.y;
    if (this.manualUntil && this.manualUntil < this.t) { this.manualUntil = 0; this.camTarget = this.overview; this.navChanged(); }
    else if (this.manualUntil && Math.floor(this.t) !== this.lastNav) { this.lastNav = Math.floor(this.t); this.navChanged(); }
  }

  drawSelection() {
    const g = this.selG; g.clear();
    const s = this.selected;
    if (!s) return;
    let p = null;
    if (s.kind === 'app' || s.kind === 'site') { const b = this.blips.get(s.id); if (b) p = { x: b.c.x, y: b.c.y, r: 20 }; }
    else if (s.kind === 'session') { const q = this.squads.get(s.id); if (q) p = { x: q.c.x, y: q.c.y, r: 22 }; }
    if (!p) return;
    const k = 4 + Math.sin(this.t * 6) * 2, r = p.r + k;
    // esquinas de mira
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.moveTo(p.x + sx * r, p.y + sy * (r - 8)).lineTo(p.x + sx * r, p.y + sy * r).lineTo(p.x + sx * (r - 8), p.y + sy * r);
    g.stroke({ width: 3, color: this.C.warn });
  }

  // ------------------------------------------------------------------ camara y navegacion
  setInsets(ins) { this.insets = ins; this.fit(true); }
  fit(snap) {
    if (!this.app) return;
    const W = this.app.screen.width, H = this.app.screen.height, i = this.insets;
    const aw = Math.max(200, W - i.left - i.right), ah = Math.max(200, H - i.top - i.bottom);
    const s = Math.min(aw, ah) / ((R + 140) * 2);
    this.overview = { s, x: (i.left - i.right) / 2, y: (i.top - i.bottom) / 2 };
    if (snap || !this.camTarget) { if (!this.manualUntil) { this.camTarget = this.overview; if (snap) Object.assign(this.cam, this.overview); } }
  }
  frameOn(x, y, zoom) {
    const o = this.overview, s = o.s * zoom;
    return { s, x: o.x - x * s, y: o.y - y * s };
  }
  director(dt) {
    if (this.manualUntil) return;
    if (this.urgent && this.urgent.until > this.t) { this.camTarget = this.frameOn(this.urgent.x, this.urgent.y, 1.8); return; }
    this.urgent = null;
    if (!this.directorOn) { this.camTarget = this.overview; return; }
    this.shotT -= dt;
    if (this.shotT > 0) return;
    const secs = [...this.sectors.values()];
    // alterna: vista general y cada sector de cerca
    this.shotIdx = (this.shotIdx + 1) % (secs.length * 2 || 1);
    if (this.shotIdx % 2 === 0 || !secs.length) { this.camTarget = this.overview; this.shotT = 10; }
    else { const s = secs[Math.floor(this.shotIdx / 2) % secs.length]; this.camTarget = this.frameOn(Math.cos(s.mid) * R * 0.55, Math.sin(s.mid) * R * 0.55, 1.6); this.shotT = 12; }
  }
  setDirector(on) { this.directorOn = on; this.shotT = 0; }
  navState() { return this.manualUntil ? { mode: 'manual', left: Math.max(0, Math.ceil(this.manualUntil - this.t)) } : { mode: this.directorOn ? 'director' : 'fixed' }; }
  navChanged() { if (this.onNav) this.onNav(this.navState()); }
  manual() { this.manualUntil = this.t + 90; this.navChanged(); }
  resetView() { this.manualUntil = 0; this.camTarget = this.overview; this.shotT = 10; this.navChanged(); }
  zoomBy(f) { this.manual(); const c = this.camTarget || this.cam; this.camTarget = { s: clamp(c.s * f, this.overview.s * 0.6, this.overview.s * 4), x: c.x * f, y: c.y * f }; }

  pick(kind, id) {
    this.selected = { kind, id };
    let p = null;
    if (kind === 'app' || kind === 'site') { const b = this.blips.get(id); if (b) p = { x: b.c.x, y: b.c.y, z: 2.2 }; }
    else if (kind === 'session') { const q = this.squads.get(id); if (q) p = { x: q.c.x, y: q.c.y, z: 2.2 }; }
    else if (kind === 'district') { const s = this.sectors.get(id); if (s) p = { x: Math.cos(s.mid) * R * 0.6, y: Math.sin(s.mid) * R * 0.6, z: 1.7 }; }
    else if (kind === 'system' || kind === 'security') p = { x: 0, y: 0, z: 1.8 };
    if (p) { this.manual(); this.camTarget = this.frameOn(p.x, p.y, p.z); }
    if (this.onSelect) this.onSelect(kind, id);
  }
  clearSelection() { this.selected = null; }

  tipOn(obj, fn) {
    obj.on('pointerover', e => { if (this.onTip && !this.dragMoved) this.onTip(fn(), e.client.x, e.client.y); });
    obj.on('pointerout', () => this.onTip && this.onTip(null));
  }

  setupNav(sig) {
    const cv = this.app.canvas;
    let start = null, last = null;
    cv.style.touchAction = 'none';
    window.addEventListener('pointerdown', e => { if (e.target !== cv) return; start = last = { x: e.clientX, y: e.clientY }; this.dragMoved = false; }, { capture: true, signal: sig.signal });
    window.addEventListener('pointermove', e => {
      if (!start) return;
      if (!this.dragMoved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) this.dragMoved = true;
      if (this.dragMoved) {
        if (!this.manualUntil) this.manual(); else this.manualUntil = this.t + 90;
        const c = this.camTarget || this.cam;
        this.camTarget = { ...c, x: c.x + (e.clientX - last.x), y: c.y + (e.clientY - last.y) };
        Object.assign(this.cam, this.camTarget);
        if (this.onTip) this.onTip(null);
      }
      last = { x: e.clientX, y: e.clientY };
    }, sig);
    window.addEventListener('pointerup', () => { start = null; }, sig);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false, signal: sig.signal });
    cv.addEventListener('dblclick', () => this.resetView(), sig);
  }
}
