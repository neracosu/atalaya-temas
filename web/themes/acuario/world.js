// Tema "Acuario": un acuario idle visto de costado, en pixel art dibujado en codigo (tendencia 2025-2026:
// juegos idle que viven en una franja del escritorio y acuarios de escritorio).
//  - el agua llega tan alto como el disco usado; la luz se mueve arriba
//  - cada cuenta es una PECERA separada por vidrio, con su placa
//  - cada servicio o sitio es un PEZ unico (forma y colores salen de su nombre): tamano = memoria,
//    velocidad = CPU; parcial = quieto en el fondo; caido = flota panza arriba, gris
//  - cada visita es una bolita de comida que cae y el pez se come; un error 5xx, una nube roja turbia
//  - cada intento de acceso es una medusa que choca contra la tapa (el cortafuegos); si la IP cae, se deshace
//  - cada sesion de Claude Code es un BUZO en el fondo: burbujas cuando trabaja, "?" si espera su permiso
// Regla de oro: calma. Nada de golpes ni destellos fuertes; todo se mueve lento y se lee de un vistazo.
import { Application, Container, Graphics, Sprite, Text, Texture, Rectangle } from '/vendor/pixi.csp.mjs';
import { esc, fmtBytes } from '/js/hud.js';

const FONT = "'Pixelify Sans', ui-monospace, monospace";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexn = h => parseInt(String(h).slice(1), 16);
const C = { deep: '#0b1e2d', mid: '#16475b', teal: '#3a8c8c', light: '#a6e3c8', sand: '#d9c08c', sandD: '#b39a66', ok: '#7be06b', warn: '#ffb347', err: '#ff4d5e', glass: '#cfeee4', k: '#081620' };

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  const px = (x, y, c, ww = 1, hh = 1) => { if (c) { cx.fillStyle = c; cx.fillRect(x, y, ww, hh); } };
  draw(px, cx);
  const t = Texture.from(cv); t.source.scaleMode = 'nearest';
  return t;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255, m = f < 0 ? 0 : 255, t = Math.abs(f);
  const c = v => Math.round(v + (m - v) * t).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
const FISH_COLORS = ['#ff8a3d', '#ffd23f', '#ff5e8a', '#7be0ff', '#b48cff', '#7be06b', '#ff4d5e', '#f4f1e8'];

// pez de 16x10: tres formas; cuerpo, franja, aleta y ojo
function fishTex(seed, dead, small) {
  return canvasTex(16, 10, px => {
    const r = seed, shape = r % 3, col = dead ? '#8a9aa0' : FISH_COLORS[(r >>> 3) % FISH_COLORS.length], stripe = dead ? '#6d7c82' : FISH_COLORS[(r >>> 7) % FISH_COLORS.length];
    const dark = shade(col, -0.35);
    const body = shape === 0 ? [[3, 3, 9, 4], [4, 2, 7, 6], [5, 1, 5, 8]] : shape === 1 ? [[2, 3, 11, 4], [3, 2, 9, 6]] : [[4, 1, 7, 8], [3, 2, 9, 6], [5, 0, 5, 10]];
    for (const [x, y, w, h] of body) { px(x - 1, y, C.k, w + 2, h); px(x, y - 1, C.k, w, h + 2); }
    for (const [x, y, w, h] of body) px(x, y, col, w, h);
    px(4, 6, dark, 8, 1);
    if (!small) for (let x = 6; x < 11; x += 3) px(x, 2, stripe, 1, 6);
    // cola
    px(0, 2, C.k, 3, 6); px(0, 3, dark, 2, 4); px(13, 4, C.k, 3, 2);
    // ojo
    px(11, 3, dead ? C.k : '#ffffff', 2, 2); px(12, 4, C.k, 1, 1);
    if (dead) { px(11, 3, C.k, 1, 1); px(12, 4, C.k, 1, 1); px(12, 3, '#ffffff', 1, 1); px(11, 4, '#ffffff', 1, 1); }
  });
}
const DIVER = ['...kkkkk...', '..kaaaaak..', '.kaBBBBBak.', '.kaBlBBBak.', '.kaBBBBBak.', '..kaaaaak..', '..kyyyyyk..', '.kyyyyyyyk.', 'kyykyyykyyk', '.kyyyyyyyk.', '..kbbkbbk..', '..kbb.kbbk.', '.kkkk.kkkk.'];
const DIVER_PAL = { k: C.k, a: '#9aa7ad', B: '#3a8c8c', l: '#a6e3c8', y: '#ffb347', b: '#16475b' };
const JELLY = ['..kkkkk..', '.kppppPk.', 'kppPppppk', 'kpppppppk', 'kkkkkkkkk', '.p.p.p.p.', '.p..p..p.', 'p..p..p..'];

export default class AcuarioWorld {
  constructor(el) {
    this.el = el;
    this.fish = new Map(); this.tanks = new Map(); this.divers = new Map();
    this.fx = []; this.t = 0; this.layoutKey = ''; this.tex = new Map();
    this.directorOn = true; this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.cam = { s: 1, x: 0, y: 0 }; this.camTarget = null; this.manualUntil = 0; this.shotT = 0; this.shotIdx = 0;
    this.water = 0.75;
  }
  T(k, make) { if (!this.tex.has(k)) this.tex.set(k, make()); return this.tex.get(k); }

  async init() {
    this.ac = new AbortController();
    const sig = { signal: this.ac.signal };
    await document.fonts.load(`20px ${FONT}`).catch(() => { });
    this.app = new Application();
    await this.app.init({ resizeTo: this.el, background: '#06121b', antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), roundPixels: true, preference: 'webgl' });
    this.el.appendChild(this.app.canvas);
    this.world = new Container();
    this.back = new Graphics(); this.light = new Graphics(); this.decor = new Container(); this.swim = new Container(); this.swim.sortableChildren = true; this.fxL = new Container(); this.front = new Graphics(); this.selG = new Graphics();
    this.world.addChild(this.back, this.light, this.decor, this.selG, this.swim, this.fxL, this.front);
    this.screen = new Container();
    this.app.stage.addChild(this.world, this.screen);
    this.app.stage.eventMode = 'static'; this.app.stage.hitArea = this.app.screen;
    this.setupNav(sig);
    this.app.ticker.add(tk => this.tick(Math.min(tk.deltaMS / 1000, 0.1)));
    window.addEventListener('resize', () => this.fit(true), sig);
  }
  destroy() { this.ac.abort(); this.app.destroy({ removeView: true }, { children: true }); }

  // ------------------------------------------------------------------ el acuario
  layout(state) {
    const accounts = state.accounts.filter(a => a.id !== 'root');
    const by = {};
    for (const a of state.apps) (by[a.account] = by[a.account] || []).push({ ...a, _k: 'app' });
    for (const x of state.sites || []) (by[x.account] = by[x.account] || []).push({ ...x, _k: 'site' });
    const key = accounts.map(a => a.id + ':' + (by[a.id] || []).map(x => x.id).join(',')).join('|');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    for (const c of [this.decor, this.swim, this.fxL, this.screen]) c.removeChildren().forEach(o => o.destroy({ children: true }));
    this.fx = []; this.fish.clear(); this.tanks.clear(); this.divers.clear();
    const H = 300, SAND = 26;
    const list = accounts.map(a => ({ a, items: by[a.id] || [] })).filter(g => g.items.length).sort((x, y) => y.items.length - x.items.length);
    let x = 0;
    for (const g of list) {
      const w = clamp(70 + g.items.length * 22, 150, 420);
      g.x0 = x; g.x1 = x + w; x += w + 10;
    }
    this.box = { x0: -12, x1: x + 2, y0: 0, y1: H, sand: H - SAND };
    const B = this.box;
    // decoracion del fondo: arena, rocas y plantas por pecera
    for (const g of list) {
      let r = hash(g.a.id);
      const rnd = () => { r = Math.imul(r ^ r >>> 13, 1274126177) >>> 0; return (r % 1000) / 1000; };
      const d = new Graphics();
      for (let i = 0; i < 3; i++) { const rx = g.x0 + 10 + rnd() * (g.x1 - g.x0 - 30), rw = 10 + rnd() * 18; d.rect(rx, B.sand - 6, rw, 8).fill(0x5b6a70).rect(rx + 2, B.sand - 10, rw - 4, 5).fill(0x6f8087).rect(rx + 3, B.sand - 10, rw - 8, 1).fill(0x8fa2a8); }
      const plants = [];
      for (let i = 0; i < 4 + (g.items.length > 10 ? 3 : 0); i++) plants.push({ x: g.x0 + 8 + rnd() * (g.x1 - g.x0 - 16), h: 20 + rnd() * 50, ph: rnd() * 6, c: rnd() < 0.5 ? 0x3f9a4a : 0x2e7a5a });
      g.plants = plants; g.decor = d;
      this.decor.addChild(d);
      // el nombre no puede ser mas ancho que su pecera
      const maxCh = Math.max(6, Math.floor((g.x1 - g.x0) / 9));
      const plate = this.label(g.a.label.length > maxCh ? g.a.label.slice(0, maxCh - 1) + '…' : g.a.label, 20, '#f4e7c5');
      g.label = plate; g.labelPos = { x: (g.x0 + g.x1) / 2, y: B.y1 + 20 };
      const hit = new Container(); hit.eventMode = 'static'; hit.cursor = 'pointer'; hit.hitArea = new Rectangle(g.x0, B.sand, g.x1 - g.x0, B.y1 - B.sand + 26);
      hit.on('pointertap', () => { if (!this.dragMoved) this.pick('district', g.a.id); });
      this.tipOn(hit, () => ({ title: g.a.label, body: `Pecera con ${g.items.length} peces: los servicios y sitios de esta cuenta.`, hint: 'Clic para ver la pecera' }));
      this.decor.addChild(hit);
      g.items.forEach(it => this.addFish(it, g));
      this.tanks.set(g.a.id, g);
    }
    this.fit(true);
  }

  addFish(it, g) {
    const seed = hash(it.id + it.name);
    const small = it._k === 'site';
    const s = new Sprite(this.T('f' + seed + small, () => fishTex(seed, false, small))); s.anchor.set(0.5);
    s.eventMode = 'static'; s.cursor = 'pointer';
    const f = { s, seed, small, data: it, kind: it._k, g, x: g.x0 + 20 + Math.random() * (g.x1 - g.x0 - 40), y: 60 + Math.random() * 150, dir: Math.random() < 0.5 ? -1 : 1, tx: 0, ty: 0, retarget: 0, dead: false };
    f.tx = f.x; f.ty = f.y;
    s.on('pointertap', () => { if (!this.dragMoved) this.pick(f.kind, it.id); });
    this.tipOn(s, () => {
      const a = f.data;
      return { title: a.name, body: `${a.kind && a.kind !== a.name ? `<b>${esc(a.kind)}</b> · ` : ''}${small ? 'pez de un sitio' : 'pez de un servicio'} · pecera ${esc(g.a.label)}`,
        meta: `${{ online: 'nada tranquilo', degraded: 'quieto en el fondo (parcial)', down: 'panza arriba (caído)' }[a.status] || a.status}${!small ? ` · CPU ${(a.cpu || 0).toFixed(1)}% · RAM ${fmtBytes(a.mem || 0)}` : ''} · ${a.reqMin || 0} visitas/min`, hint: 'Clic para ver el detalle' };
    });
    this.swim.addChild(s);
    this.fish.set(it.id, f);
  }

  label(text, size, color) {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: size, fill: color, stroke: { color: '#06121b', width: 5 }, fontWeight: '600' } });
    t.anchor.set(0.5, 0); this.screen.addChild(t);
    return t;
  }

  update(state) {
    this.state = state;
    this.layout(state);
    const disk = state.system && state.system.disk ? state.system.disk.pct : 60;
    this.water = clamp(0.35 + (disk / 100) * 0.62, 0.35, 0.97);
    for (const x of [...state.apps, ...(state.sites || [])]) {
      const f = this.fish.get(x.id);
      if (!f) continue;
      f.data = { ...x, _k: f.kind };
      const dead = x.status === 'down';
      if (dead !== f.dead) { f.dead = dead; f.s.texture = this.T('f' + f.seed + f.small + dead, () => fishTex(f.seed, dead, f.small)); if (dead) this.note(f.x, f.y - 16, 'Panza arriba', C.err); else this.note(f.x, f.y - 16, 'Volvió a nadar', C.ok); }
      const mem = x.mem || 0;
      f.scale = f.small ? 1.3 : clamp(1.4 + Math.log2(1 + mem / 50e6) * 0.35, 1.4, 3.2);
    }
    this.syncDivers(state.sessions || []);
  }

  syncDivers(sessions) {
    const seen = new Set(), per = {};
    for (const s of sessions) {
      seen.add(s.id);
      let d = this.divers.get(s.id);
      if (!d) {
        const sp = new Sprite(this.T('diver', () => canvasTex(11, 13, px => DIVER.forEach((r, y) => [...r].forEach((ch, x) => px(x, y, DIVER_PAL[ch])))))); sp.anchor.set(0.5, 1); sp.scale.set(2.2);
        sp.eventMode = 'static'; sp.cursor = 'pointer';
        sp.on('pointertap', () => { if (!this.dragMoved) this.pick('session', s.id); });
        this.tipOn(sp, () => ({ title: 'Buzo · agente de Claude Code', body: esc(d.s.activity || ''), meta: d.s.waitKind ? 'Espera su permiso o su respuesta' : { working: 'Trabajando', thinking: 'Pensando', idle: 'Descansando' }[d.s.state] || '', hint: 'Clic para ver la línea de tiempo' }));
        const hose = new Graphics();
        this.swim.addChild(sp); this.fxL.addChild(hose);
        d = { sp, hose, s, bub: 0, walk: Math.random() * 6 };
        this.divers.set(s.id, d);
      }
      d.s = s;
      per[s.account] = (per[s.account] || 0) + 1;
      const g = this.tanks.get(s.account) || [...this.tanks.values()][0];
      d.base = g ? g.x0 + 24 + ((per[s.account] - 1) * 34) % Math.max(34, g.x1 - g.x0 - 48) : 20;
    }
    for (const [id, d] of this.divers) if (!seen.has(id)) { d.sp.destroy(); d.hose.destroy(); this.divers.delete(id); }
  }

  // ------------------------------------------------------------------ eventos
  onEvent(e, priv) {
    switch (e.kind) {
      case 'http': {
        const f = this.fish.get(e.app || e.site);
        if (!f || f.dead || this.fx.length > 200) return;
        if (e.status >= 500) return this.murk(f);
        return this.pellet(f, e.bot);
      }
      case 'attack': return this.jelly(false);
      case 'block': return this.jelly(true, priv ? e.ip : null);
      case 'login': return this.note(this.box.x1 / 2, this.surface() - 14, priv && e.user ? `Entró ${e.user}` : 'Entró el acuarista', C.ok);
      case 'mail': return this.bubbleBurst(this.box.x1 - 20, this.box.sand, e.dir === 'bounce' ? 0xff4d5e : 0xa6e3c8, 4);
      case 'deploy': {
        const f = this.fish.get(e.app);
        if (!f) return;
        const T = { building: ['Nace un pez nuevo…', C.warn], ready: ['¡Nació!', C.ok], error: ['El huevo no prosperó', C.err], canceled: ['Cancelado', C.light] }[e.action];
        if (T) { this.note(f.x, f.y - 18, T[0], T[1]); if (e.action === 'ready') this.bubbleBurst(f.x, f.y, 0xa6e3c8, 10); if (e.action === 'error') this.murk(f); }
        return;
      }
      case 'pm2': { const f = this.fish.get(e.app); if (f && e.action !== 'down') this.note(f.x, f.y - 18, 'Se reanimó', C.warn); return; }
      case 'domain': { const g = this.tanks.get(e.account); if (g) this.note((g.x0 + g.x1) / 2, this.surface() + 10, { added: 'Pez nuevo en la pecera', removed: 'Un pez se fue', changed: 'Cambió un sitio' }[e.action] + (priv && e.domain ? `: ${e.domain}` : ''), e.action === 'removed' ? C.warn : C.ok); return; }
      case 'claude': {
        const d = this.divers.get(e.sid) || [...this.divers.entries()].find(([k]) => e.sid && k.startsWith(e.sid))?.[1];
        if (!d) return;
        if (e.action === 'permission') { this.urgent = { x: d.sp.x, y: d.sp.y - 20, until: this.t + 12 }; this.note(d.sp.x, d.sp.y - 40, 'Pide su permiso', C.warn); }
        else if (e.action === 'done') { this.bubbleBurst(d.sp.x, d.sp.y - 20, 0xffb347, 8); this.note(d.sp.x, d.sp.y - 40, 'Tarea hecha', C.ok); }
        return;
      }
    }
  }

  surface() { const B = this.box; return B.sand - (B.sand - 8) * this.water; }
  addFx(obj, tick) { this.fxL.addChild(obj); this.fx.push({ obj, tick, age: 0 }); }

  pellet(f, bot) {
    const g = new Graphics().rect(-1, -1, 3, 3).fill(bot ? 0x9aa7ad : 0xd9c08c).rect(-1, -1, 1, 1).fill(0xfff1c8);
    g.x = f.x + (Math.random() - 0.5) * 30; g.y = this.surface() + 2;
    this.addFx(g, (fx, dt) => {
      g.y += 22 * dt; g.x += Math.sin(fx.age * 3) * 6 * dt;
      if (Math.hypot(f.x - g.x, f.y - g.y) < 10 + (f.scale || 1.5) * 4) { f.ate = 1; return false; }
      if (fx.age < 5 && g.y < this.box.sand - 2) { if (fx.age > 0.6) { f.tx = g.x; f.ty = g.y + 4; f.retarget = 1.5; } return true; }
      return false;
    });
  }
  murk(f) {
    for (let i = 0; i < 8; i++) {
      const g = new Graphics().rect(-2, -2, 4, 4).fill(0xff4d5e);
      g.x = f.x; g.y = f.y; const vx = (Math.random() - 0.5) * 18, vy = (Math.random() - 0.5) * 10;
      this.addFx(g, (fx, dt) => { g.x += vx * dt; g.y += vy * dt; g.alpha = 0.7 * (1 - fx.age / 2.4); g.scale.set(1 + fx.age); return fx.age < 2.4; });
    }
  }
  jelly(blocked, ip) {
    const B = this.box, x = B.x0 + 20 + Math.random() * (B.x1 - B.x0 - 40);
    const s = new Sprite(this.T('jelly', () => canvasTex(9, 8, px => JELLY.forEach((r, y) => [...r].forEach((ch, xx) => px(xx, y, { k: '#3a1030', p: '#e07ad8', P: '#ffc4f4' }[ch])))))); s.anchor.set(0.5, 1); s.scale.set(2);
    s.x = x; s.y = -40;
    this.addFx(s, (fx, dt) => {
      const top = -4;
      if (s.y < top) { s.y += 30 * dt; s.scale.y = 2 + Math.sin(fx.age * 5) * 0.2; return true; }
      if (!fx.hit) { fx.hit = true; this.lidFlash = 1; if (blocked) this.note(s.x, 18, ip ? `IP bloqueada ${ip}` : 'IP bloqueada', C.warn); }
      s.y -= 16 * dt; s.alpha = Math.max(0, 1 - (fx.age - (fx.hitAt || (fx.hitAt = fx.age))) * (blocked ? 1.5 : 0.5));
      return s.alpha > 0;
    });
  }
  bubbleBurst(x, y, color, n) { for (let i = 0; i < n; i++) this.bubble(x + (Math.random() - 0.5) * 12, y, color); }
  bubble(x, y, color = 0xa6e3c8) {
    const g = new Graphics().rect(-1, -2, 3, 1).fill(color).rect(-2, -1, 1, 3).fill(color).rect(2, -1, 1, 3).fill(color).rect(-1, 2, 3, 1).fill(color);
    g.x = x; g.y = y; const sw = Math.random() * 6;
    this.addFx(g, (fx, dt) => { g.y -= 26 * dt; g.x += Math.sin(fx.age * 4 + sw) * 8 * dt; return g.y > this.surface(); });
  }
  note(x, y, text, color) {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 20, fill: color, stroke: { color: '#06121b', width: 5 }, fontWeight: '700' } });
    t.anchor.set(0.5, 1); this.screen.addChild(t);
    this.fx.push({ obj: t, age: 0, world: { x, y }, tick: (f, dt) => { f.world.y -= 6 * dt; t.alpha = f.age < 2.6 ? 1 : 1 - (f.age - 2.6) / 0.8; return f.age < 3.4; } });
  }

  // ------------------------------------------------------------------ cuadro a cuadro
  tick(dt) {
    this.t += dt;
    const B = this.box;
    if (!B) { this.applyCam(dt); return; }
    const surf = this.surface();
    // agua con bandas y tramado (4 tonos), vidrio y tapa
    const g = this.back; g.clear();
    g.rect(B.x0 - 8, B.y0 - 10, B.x1 - B.x0 + 16, B.y1 - B.y0 + 18).fill(0x0a1a24);
    g.rect(B.x0, B.y0, B.x1 - B.x0, surf - B.y0).fill(0x0d2433);
    const bands = [0x3a8c8c, 0x16475b, 0x0b1e2d];
    const depth = B.sand - surf;
    for (let i = 0; i < 3; i++) g.rect(B.x0, surf + depth * i / 3, B.x1 - B.x0, depth / 3 + 1).fill(bands[i]);
    for (let i = 1; i < 3; i++) { const y = Math.round(surf + depth * i / 3); for (let x = B.x0; x < B.x1; x += 4) g.rect(x + (i % 2) * 2, y - 1, 2, 1).fill(bands[i - 1]); }
    g.rect(B.x0, B.sand, B.x1 - B.x0, B.y1 - B.sand).fill(0xd9c08c);
    for (let x = B.x0; x < B.x1; x += 6) g.rect(x + ((x / 6) % 2) * 3, B.sand + 3, 2, 1).fill(0xb39a66).rect(x, B.sand + 10, 1, 1).fill(0xb39a66);
    // plantas que se mecen
    for (const tk of this.tanks.values()) for (const p of tk.plants) for (let y = 0; y < p.h; y += 3) { const sw = Math.sin(this.t * 1.2 + p.ph + y * 0.08) * (y / p.h) * 5; g.rect(p.x + sw, B.sand - y - 3, 3, 3).fill(p.c); }
    // luz que se mueve en la superficie
    const l = this.light; l.clear();
    for (let x = B.x0; x < B.x1; x += 8) { const a = 0.18 + 0.14 * Math.sin(this.t * 1.4 + x * 0.05); l.rect(x, surf, 5, 2).fill({ color: 0xa6e3c8, alpha: a }); }
    for (let i = 0; i < 5; i++) { const x = B.x0 + ((this.t * 12 + i * 170) % (B.x1 - B.x0)); l.moveTo(x, surf).lineTo(x - 30, B.sand).stroke({ width: 6, color: 0xa6e3c8, alpha: 0.05 }); }
    // vidrios entre peceras, marco y tapa (cortafuegos)
    const fr = this.front; fr.clear();
    for (const tk of this.tanks.values()) fr.rect(tk.x1 + 3, B.y0 + 2, 4, B.sand - B.y0 - 2).fill({ color: 0xcfeee4, alpha: 0.35 });
    this.lidFlash = Math.max(0, (this.lidFlash || 0) - dt * 1.5);
    fr.rect(B.x0 - 8, B.y0 - 10, B.x1 - B.x0 + 16, 8).fill(this.lidFlash > 0.05 ? 0xffb347 : 0x2e4450).rect(B.x0 - 8, B.y0 - 10, B.x1 - B.x0 + 16, 2).fill(0x5a7a86);
    fr.rect(B.x0 - 8, B.y0 - 2, 6, B.y1 - B.y0 + 10).fill(0x2e4450).rect(B.x1 + 2, B.y0 - 2, 6, B.y1 - B.y0 + 10).fill(0x2e4450).rect(B.x0 - 8, B.y1, B.x1 - B.x0 + 16, 10).fill(0x2e4450);
    // filtro: burbujas segun la carga
    const load = this.state && this.state.system ? this.state.system.load[0] / Math.max(1, this.state.system.cores) : 0.2;
    if (Math.random() < dt * (1 + load * 8)) this.bubble(B.x0 + 6, B.sand - 2);
    // peces
    for (const f of this.fish.values()) {
      const a = f.data, g2 = f.g;
      const lo = Math.max(surf + 14, B.y0 + 14), hi = B.sand - 12;
      if (f.dead) { f.x += Math.sin(this.t * 0.6 + f.seed) * 4 * dt; f.y += (surf + 6 - f.y) * dt; f.s.rotation = Math.PI; f.s.scale.set(f.scale || 1.5, f.scale || 1.5); }
      else {
        f.s.rotation = 0;
        const speed = a.status === 'degraded' ? 4 : 10 + Math.min(a.cpu || 0, 100) * 0.9;
        f.retarget -= dt;
        if (f.retarget <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < 4) {
          f.retarget = 2 + Math.random() * 4;
          f.tx = g2.x0 + 14 + Math.random() * (g2.x1 - g2.x0 - 28);
          f.ty = a.status === 'degraded' ? hi - Math.random() * 10 : lo + Math.random() * (hi - lo);
        }
        const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy) || 1;
        f.x += dx / d * speed * dt; f.y += dy / d * speed * 0.6 * dt;
        if (Math.abs(dx) > 1) f.dir = dx < 0 ? -1 : 1;
        f.y = clamp(f.y, lo, hi);
        const sc = f.scale || 1.5;
        f.s.scale.set(sc * f.dir, sc * (1 + Math.sin(this.t * 6 + f.seed) * 0.04));
        if (f.ate) { f.ate = Math.max(0, f.ate - dt * 3); if (Math.random() < 0.3) this.bubble(f.x + f.dir * 8, f.y - 2); }
        if ((a.reqMin || 0) > 0 && Math.random() < dt * Math.min(2, a.reqMin / 20)) this.bubble(f.x + f.dir * 8, f.y - 2);
      }
      f.x = clamp(f.x, g2.x0 + 8, g2.x1 - 8);
      f.s.x = f.x; f.s.y = f.y; f.s.zIndex = f.y;
    }
    // buzos: caminan despacio por la arena; burbujas si trabajan; "?" si esperan
    const frame = Math.floor(this.t * 2) % 2;
    for (const d of this.divers.values()) {
      const waiting = !!d.s.waitKind;
      const x = (d.base || 20) + (waiting ? 0 : Math.sin(this.t * 0.3 + d.walk) * 14);
      d.sp.x = x; d.sp.y = B.sand + 2; d.sp.zIndex = 9999;
      d.sp.alpha = d.s.state === 'idle' ? 0.7 : 1;
      d.hose.clear().moveTo(x + 4, d.sp.y - 18).bezierCurveTo(x + 20, d.sp.y - 60, x - 10, surf + 40, x + 6, surf).stroke({ width: 2, color: 0xffb347, alpha: 0.6 });
      if (d.s.state === 'working' && Math.random() < dt * 3) this.bubble(x + 2, d.sp.y - 20, 0xffe0a8);
      if (waiting && frame) d.hose.rect(x - 7, d.sp.y - 44, 14, 14).fill(0xffb347).stroke({ width: 1, color: 0x06121b }).rect(x - 1, d.sp.y - 42, 3, 6).fill(0x06121b).rect(x - 1, d.sp.y - 34, 3, 2).fill(0x06121b);
    }
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.age += dt; if (!f.tick(f, dt)) { f.obj.destroy(); this.fx.splice(i, 1); } }
    this.drawSelection();
    this.director(dt);
    this.applyCam(dt);
  }

  applyCam(dt) {
    if (this.camTarget) { const k = 1 - Math.pow(0.02, dt); this.cam.s += (this.camTarget.s - this.cam.s) * k; this.cam.x += (this.camTarget.x - this.cam.x) * k; this.cam.y += (this.camTarget.y - this.cam.y) * k; }
    const W = this.app.screen.width, H = this.app.screen.height;
    this.world.scale.set(this.cam.s);
    this.world.x = Math.round(W / 2 + this.cam.x); this.world.y = Math.round(H / 2 + this.cam.y);
    const toS = p => ({ x: this.world.x + p.x * this.cam.s, y: this.world.y + p.y * this.cam.s });
    for (const tk of this.tanks.values()) { const p = toS(tk.labelPos); tk.label.x = p.x; tk.label.y = p.y - 16; }
    for (const f of this.fx) if (f.world) { const p = toS(f.world); f.obj.x = p.x; f.obj.y = p.y; }
    if (this.manualUntil && this.manualUntil < this.t) { this.manualUntil = 0; this.camTarget = this.overview; this.navChanged(); }
    else if (this.manualUntil && Math.floor(this.t) !== this.lastNav) { this.lastNav = Math.floor(this.t); this.navChanged(); }
  }

  drawSelection() {
    const g = this.selG; g.clear();
    const s = this.selected;
    if (!s) return;
    let p = null;
    if (s.kind === 'app' || s.kind === 'site') { const f = this.fish.get(s.id); if (f) p = { x: f.x, y: f.y, r: 10 + (f.scale || 1.5) * 5 }; }
    else if (s.kind === 'session') { const d = this.divers.get(s.id); if (d) p = { x: d.sp.x, y: d.sp.y - 10, r: 16 }; }
    if (p) g.circle(p.x, p.y, p.r + Math.sin(this.t * 4) * 2).stroke({ width: 1.5, color: 0xffb347, alpha: 0.9 });
  }

  // ------------------------------------------------------------------ camara y navegacion
  setInsets(ins) { this.insets = ins; this.fit(true); }
  fit(snap) {
    if (!this.app || !this.box) return;
    const W = this.app.screen.width, H = this.app.screen.height, i = this.insets, B = this.box;
    const aw = Math.max(200, W - i.left - i.right), ah = Math.max(200, H - i.top - i.bottom);
    const s = Math.min(aw / (B.x1 - B.x0 + 30), ah / (B.y1 - B.y0 + 60));
    const cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2 + 10;
    this.overview = { s, x: (i.left - i.right) / 2 - cx * s, y: (i.top - i.bottom) / 2 - cy * s };
    if (!this.manualUntil) { this.camTarget = this.overview; if (snap) Object.assign(this.cam, this.overview); }
  }
  frameOn(x, y, s) { const i = this.insets; return { s, x: (i.left - i.right) / 2 - x * s, y: (i.top - i.bottom) / 2 - y * s }; }
  director(dt) {
    if (this.manualUntil || !this.overview) return;
    if (this.urgent && this.urgent.until > this.t) { this.camTarget = this.frameOn(this.urgent.x, this.urgent.y, this.overview.s * 2.4); return; }
    this.urgent = null;
    if (!this.directorOn) { this.camTarget = this.overview; return; }
    this.shotT -= dt;
    if (this.shotT > 0) return;
    const ts = [...this.tanks.values()];
    this.shotIdx = (this.shotIdx + 1) % (ts.length * 2 || 1);
    if (this.shotIdx % 2 === 0 || !ts.length) { this.camTarget = this.overview; this.shotT = 12; return; }
    const tk = ts[Math.floor(this.shotIdx / 2) % ts.length];
    const W = this.app.screen.width - this.insets.left - this.insets.right, H = this.app.screen.height - this.insets.top - this.insets.bottom;
    this.camTarget = this.frameOn((tk.x0 + tk.x1) / 2, this.box.y1 / 2, Math.max(this.overview.s, Math.min(W / (tk.x1 - tk.x0 + 60), H / (this.box.y1 + 60))));
    this.shotT = 12;
  }
  setDirector(on) { this.directorOn = on; this.shotT = 0; }
  navState() { return this.manualUntil ? { mode: 'manual', left: Math.max(0, Math.ceil(this.manualUntil - this.t)) } : { mode: this.directorOn ? 'director' : 'fixed' }; }
  navChanged() { if (this.onNav) this.onNav(this.navState()); }
  manual() { this.manualUntil = this.t + 90; this.navChanged(); }
  resetView() { this.manualUntil = 0; this.camTarget = this.overview; this.shotT = 12; this.navChanged(); }
  zoomBy(f) { this.manual(); const c = this.camTarget || this.cam; const ns = clamp(c.s * f, this.overview.s * 0.7, this.overview.s * 6); this.camTarget = { s: ns, x: c.x * ns / c.s, y: c.y * ns / c.s }; }
  pick(kind, id) {
    this.selected = { kind, id };
    let p = null;
    if (kind === 'app' || kind === 'site') { const f = this.fish.get(id); if (f) p = { x: f.x, y: f.y, z: 3 }; }
    else if (kind === 'session') { const d = this.divers.get(id); if (d) p = { x: d.sp.x, y: d.sp.y - 20, z: 3 }; }
    else if (kind === 'district') { const tk = this.tanks.get(id); if (tk) p = { x: (tk.x0 + tk.x1) / 2, y: this.box.y1 / 2, z: 2 }; }
    else if (kind === 'system' || kind === 'security') p = { x: (this.box.x0 + this.box.x1) / 2, y: 30, z: 1.6 };
    if (p && this.overview) { this.manual(); this.camTarget = this.frameOn(p.x, p.y, this.overview.s * p.z); }
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
