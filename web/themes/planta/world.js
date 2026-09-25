// Tema "Planta": una fabrica de automatizacion vista desde arriba (tendencia: juegos de fabricas y cintas),
// en pixel art dibujado en codigo con la paleta de 16 colores de PICO-8.
//  - el servidor es la CENTRAL: su chimenea echa humo segun la CPU y dos silos muestran memoria y disco
//  - cada cuenta es una NAVE con su color; cada servicio una MAQUINA (engranaje que gira con la CPU, foco
//    de estado, tanque de memoria); cada sitio una PRENSA
//  - cada visita es una PIEZA que entra por la puerta, viaja por las cintas hasta su maquina y sale;
//    un error 5xx sale roja y cae al contenedor de CHATARRA
//  - cada intento de acceso es un DRON que llega al cerco; la TORRETA lo derriba si la IP queda bloqueada
//  - cada sesion de Claude Code es un ROBOT OBRERO que lleva cajas; si espera su permiso, se detiene en
//    la barrera con luz ambar
// Regla de oro: todo fluye por cintas; los cuellos de botella y la chatarra se ven sin leer un numero.
import { Application, Container, Graphics, Sprite, Text, Texture, Rectangle } from '/vendor/pixi.csp.mjs';
import { signTexture } from '/js/sprites.js';
import { esc, fmtBytes } from '/js/hud.js';

const U = 16;
const FONT = "'Silkscreen', ui-monospace, monospace";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexn = h => parseInt(String(h).slice(1), 16);
// PICO-8
const P8 = { black: 0x000000, navy: 0x1d2b53, plum: 0x7e2553, green: 0x008751, brown: 0xab5236, dgray: 0x5f574f, lgray: 0xc2c3c7, white: 0xfff1e8,
  red: 0xff004d, orange: 0xffa300, yellow: 0xffec27, lime: 0x00e436, blue: 0x29adff, lav: 0x83769c, pink: 0xff77a8, peach: 0xffccaa };
const HALL_ROOFS = [P8.blue, P8.plum, P8.green, P8.brown, P8.lav, P8.pink, P8.peach];

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  const px = (x, y, c, ww = 1, hh = 1) => { cx.fillStyle = c; cx.fillRect(x, y, ww, hh); };
  draw(px, cx);
  const t = Texture.from(cv); t.source.scaleMode = 'nearest';
  return t;
}
const hex = n => '#' + n.toString(16).padStart(6, '0');

export default class PlantaWorld {
  constructor(el) {
    this.el = el;
    this.machines = new Map(); this.halls = new Map(); this.bots = new Map();
    this.pieces = []; this.fx = []; this.t = 0; this.layoutKey = ''; this.tex = new Map();
    this.scrap = 0; this.rejected = 0;
    this.directorOn = true; this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.cam = { s: 1, x: 0, y: 0 }; this.camTarget = null; this.manualUntil = 0; this.shotT = 0; this.shotIdx = 0;
  }
  T(k, make) { if (!this.tex.has(k)) this.tex.set(k, make()); return this.tex.get(k); }
  floorTex() {
    return this.T('floor', () => canvasTex(32, 32, px => {
      px(0, 0, '#2a2a33', 32, 32);
      for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16]]) { px(x, y, '#33333d', 15, 15); px(x, y, '#3d3d48', 15, 1); px(x + 2, y + 2, '#5f574f', 1, 1); px(x + 12, y + 12, '#5f574f', 1, 1); }
    }));
  }

  async init() {
    this.ac = new AbortController();
    const sig = { signal: this.ac.signal };
    await document.fonts.load(`16px ${FONT}`).catch(() => { });
    this.app = new Application();
    await this.app.init({ resizeTo: this.el, background: '#15151b', antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), roundPixels: true, preference: 'webgl' });
    this.el.appendChild(this.app.canvas);
    this.world = new Container();
    this.floor = new Container(); this.hallL = new Container(); this.belts = new Graphics(); this.stat = new Container(); this.dyn = new Graphics(); this.items = new Container(); this.fxL = new Container(); this.selG = new Graphics();
    // capas: piso, naves, cintas, maquinas; asi las cintas quedan sobre el piso de cada nave
    this.world.addChild(this.floor, this.hallL, this.belts, this.selG, this.stat, this.dyn, this.items, this.fxL);
    this.screen = new Container();
    this.app.stage.addChild(this.world, this.screen);
    this.app.stage.eventMode = 'static'; this.app.stage.hitArea = this.app.screen;
    this.setupNav(sig);
    this.app.ticker.add(tk => this.tick(Math.min(tk.deltaMS / 1000, 0.1)));
    window.addEventListener('resize', () => this.fit(true), sig);
  }
  destroy() { this.ac.abort(); this.app.destroy({ removeView: true }, { children: true }); }

  // ------------------------------------------------------------------ la planta
  layout(state) {
    const accounts = state.accounts.filter(a => a.id !== 'root');
    const by = {};
    for (const a of state.apps) (by[a.account] = by[a.account] || []).push({ ...a, _k: 'app' });
    for (const x of state.sites || []) (by[x.account] = by[x.account] || []).push({ ...x, _k: 'site' });
    const key = accounts.map(a => a.id + ':' + (by[a.id] || []).map(x => x.id).join(',')).join('|');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    for (const c of [this.floor, this.hallL, this.stat, this.items, this.fxL, this.screen]) c.removeChildren().forEach(o => o.destroy({ children: true }));
    this.machines.clear(); this.halls.clear(); this.bots.clear(); this.pieces = []; this.fx = [];
    // naves: maquinas en filas de hasta 8, cada fila con su cinta; naves en dos columnas si hace falta
    const PER = 8, MW = 44, MH = 52;
    const list = accounts.map((a, i) => ({ a, roof: HALL_ROOFS[i % HALL_ROOFS.length], items: (by[a.id] || []).sort((x, y) => (x._k === y._k ? 0 : x._k === 'app' ? -1 : 1)) }))
      .filter(h => h.items.length).sort((x, y) => y.items.length - x.items.length);
    list.forEach(h => { h.cols = Math.min(PER, h.items.length); h.rows = Math.ceil(h.items.length / PER); h.w = h.cols * MW + 36; h.h = h.rows * MH + 34; });
    const total = list.reduce((n, h) => n + h.h + 26, 0);
    const twoCols = total > 560;
    const colX = [150, twoCols ? 150 + Math.max(...list.map(h => h.w)) + 70 : 0], colY = [40, 40];
    for (const h of list) { const c = twoCols && colY[1] < colY[0] ? 1 : 0; h.x = colX[c]; h.y = colY[c]; h.col = c; colY[c] += h.h + 26; }
    const width = (twoCols ? colX[1] + Math.max(...list.filter(h => h.col === 1).map(h => h.w), 0) : colX[0] + Math.max(...list.map(h => h.w), 200)) + 40;
    const height = Math.max(colY[0], colY[1], 320) + 30;
    this.box = { x0: -20, y0: -120, x1: width, y1: height };
    const B = this.box;
    for (let y = B.y0; y < B.y1; y += 32) for (let x = B.x0; x < B.x1; x += 32) { const s = new Sprite(this.floorTex()); s.x = x; s.y = y; this.floor.addChild(s); }
    // cerco perimetral
    const fence = new Graphics();
    for (let x = B.x0; x < B.x1; x += 6) fence.rect(x, B.y0, 3, 3).fill(P8.lgray).rect(x, B.y1 - 3, 3, 3).fill(P8.lgray);
    for (let y = B.y0; y < B.y1; y += 6) fence.rect(B.x0, y, 3, 3).fill(P8.lgray).rect(B.x1 - 3, y, 3, 3).fill(P8.lgray);
    this.floor.addChild(fence);
    // central (servidor), torreta, chatarra y puerta
    this.plant = { x: 20, y: B.y0 + 20, w: 96, h: 70 };
    const pl = new Graphics();
    const p = this.plant;
    pl.rect(p.x, p.y, p.w, p.h).fill(P8.black).rect(p.x + 2, p.y + 2, p.w - 4, p.h - 4).fill(P8.dgray).rect(p.x + 2, p.y + 2, p.w - 4, 6).fill(P8.yellow);
    for (let x = p.x + 2; x < p.x + p.w - 2; x += 8) pl.rect(x, p.y + 2, 4, 6).fill(P8.black);
    pl.rect(p.x + 60, p.y - 26, 12, 30).fill(P8.black).rect(p.x + 62, p.y - 24, 8, 28).fill(P8.lgray);
    this.silos = [{ x: p.x + 10, y: p.y + 16, label: 'RAM', color: P8.blue }, { x: p.x + 34, y: p.y + 16, label: 'DISCO', color: P8.orange }];
    for (const s of this.silos) pl.rect(s.x, s.y, 18, 46).fill(P8.black).rect(s.x + 2, s.y + 2, 14, 42).fill(P8.navy);
    this.stat.addChild(pl);
    const phit = new Container(); phit.eventMode = 'static'; phit.cursor = 'pointer'; phit.hitArea = new Rectangle(p.x, p.y - 26, p.w, p.h + 26);
    phit.on('pointertap', () => { if (!this.dragMoved) this.pick('system', 'root'); });
    this.tipOn(phit, () => ({ title: 'La central', body: 'El <b>servidor</b>: su chimenea echa humo según la CPU; los silos son la memoria y el disco.', meta: this.state?.system ? `CPU ${this.state.system.cpu.toFixed(0)}% · RAM ${this.state.system.mem.pct.toFixed(0)}% · carga ${this.state.system.load[0].toFixed(2)}` : '', hint: 'Clic para ver el servidor completo' }));
    this.stat.addChild(phit);
    this.turret = { x: B.x1 - 34, y: B.y0 + 30 };
    const tu = new Graphics().rect(this.turret.x - 12, this.turret.y - 12, 24, 24).fill(P8.black).rect(this.turret.x - 10, this.turret.y - 10, 20, 20).fill(P8.lav).rect(this.turret.x - 3, this.turret.y - 3, 6, 6).fill(P8.red);
    tu.eventMode = 'static'; tu.cursor = 'pointer';
    tu.on('pointertap', () => { if (!this.dragMoved) this.pick('security', 'all'); });
    this.tipOn(tu, () => ({ title: 'Torreta', body: 'El cortafuegos: derriba los drones (intentos de acceso) cuando la IP queda bloqueada.', meta: `${this.rejected} derribados desde que se abrió la pantalla`, hint: 'Clic para ver la defensa' }));
    this.stat.addChild(tu);
    this.bin = { x: 60, y: B.y1 - 44 };
    this.stat.addChild(new Graphics().rect(this.bin.x - 20, this.bin.y - 14, 40, 28).fill(P8.black).rect(this.bin.x - 18, this.bin.y - 12, 36, 24).fill(P8.brown).rect(this.bin.x - 18, this.bin.y - 12, 36, 3).fill(P8.orange));
    this.gate = { x: B.x0 + 8, y: B.y0 + 104 };
    this.stat.addChild(new Graphics().rect(B.x0 - 2, this.gate.y - 10, 12, 20).fill(P8.yellow).rect(B.x0 + 1, this.gate.y - 7, 6, 14).fill(P8.black));
    this.binLabel = this.label('CHATARRA 0', 14, hex(P8.orange)); this.rejLabel = this.label('RECHAZADOS 0', 14, hex(P8.red)); this.plantLabel = this.label('CENTRAL', 16, hex(P8.yellow));
    // cintas: bus superior desde la puerta, troncales por columna y una cinta por fila de maquinas
    this.segments = [];
    const busY = this.gate.y, trunkX = [colX[0] - 30, colX[1] - 30];
    this.segments.push([B.x0 + 8, busY, (twoCols ? trunkX[1] : trunkX[0]), busY]);
    for (let c = 0; c < (twoCols ? 2 : 1); c++) this.segments.push([trunkX[c], busY, trunkX[c], Math.max(...list.filter(h => h.col === c).map(h => h.y + h.h), busY + 10)]);
    for (const h of list) {
      const tx = trunkX[h.col];
      // la nave
      const g = new Graphics();
      g.rect(h.x, h.y, h.w, h.h).fill(P8.black).rect(h.x + 2, h.y + 2, h.w - 4, h.h - 4).fill(0x22222b).rect(h.x + 2, h.y + 2, h.w - 4, 10).fill(h.roof);
      this.hallL.addChild(g);
      h.label = this.label(h.a.label.toUpperCase(), 14, '#fff1e8'); h.labelPos = { x: h.x + 8, y: h.y + 7 }; h.label.anchor.set(0, 0.5);
      const hit = new Container(); hit.eventMode = 'static'; hit.cursor = 'pointer'; hit.hitArea = new Rectangle(h.x, h.y, h.w, 12);
      hit.on('pointertap', () => { if (!this.dragMoved) this.pick('district', h.a.id); });
      this.tipOn(hit, () => ({ title: h.a.label, body: `Nave con ${h.items.length} máquinas (servicios) y prensas (sitios).`, hint: 'Clic para ver la nave' }));
      this.stat.addChild(hit);
      h.barrier = { x: h.x - 8, y: h.y + 26 };
      h.rowY = [];
      for (let r = 0; r < h.rows; r++) {
        const y = h.y + 30 + r * MH + 34; // cinta al pie de cada fila
        h.rowY.push(y);
        this.segments.push([tx, y, h.x + h.w - 6, y]);
      }
      h.items.forEach((it, i) => this.addMachine(it, h.x + 22 + (i % PER) * MW, h.y + 30 + Math.floor(i / PER) * MH, h, h.rowY[Math.floor(i / PER)], tx));
      this.halls.set(h.a.id, h);
    }
    this.fit(true);
  }

  addMachine(it, x, y, hall, beltY, trunkX) {
    const site = it._k === 'site';
    const c = new Container(); c.x = x; c.y = y;
    const body = new Graphics();
    if (site) body.rect(0, 4, 30, 24).fill(P8.black).rect(2, 6, 26, 20).fill(P8.navy).rect(2, 6, 26, 3).fill(P8.blue);
    else body.rect(0, 0, 32, 30).fill(P8.black).rect(2, 2, 28, 26).fill(P8.dgray).rect(2, 2, 28, 3).fill(P8.lgray);
    const sign = new Sprite(signTexture(it.icon || 'web')); sign.x = site ? 4 : 3; sign.y = site ? 10 : 6; sign.scale.set(0.9);
    const gear = new Graphics(); gear.x = site ? 20 : 20; gear.y = site ? 18 : 16;
    c.addChild(body, sign, gear);
    c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new Rectangle(-2, -2, 36, 34);
    const m = { c, gear, site, data: it, kind: it._k, hall, x, y, cx: x + 16, cy: y + 15, beltY, trunkX, rot: 0, jam: 0, spark: 0 };
    c.on('pointertap', () => { if (!this.dragMoved) this.pick(m.kind, it.id); });
    this.tipOn(c, () => {
      const a = m.data;
      return { title: a.name, body: `${a.kind && a.kind !== a.name ? `<b>${esc(a.kind)}</b> · ` : ''}${site ? 'prensa (sitio)' : 'máquina (servicio)'} · nave ${esc(hall.a.label)}`,
        meta: `${{ online: 'en marcha', degraded: 'lenta (parcial)', down: 'DETENIDA (caída)' }[a.status] || a.status}${!site ? ` · CPU ${(a.cpu || 0).toFixed(1)}% · RAM ${fmtBytes(a.mem || 0)}` : ''} · ${a.reqMin || 0} piezas/min`, hint: 'Clic para ver el detalle' };
    });
    this.stat.addChild(c);
    this.machines.set(it.id, m);
  }

  label(text, size, color) {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: size, fill: color, stroke: { color: '#000000', width: 4 } } });
    t.anchor.set(0.5); this.screen.addChild(t);
    return t;
  }

  update(state) {
    this.state = state;
    this.layout(state);
    for (const x of [...state.apps, ...(state.sites || [])]) {
      const m = this.machines.get(x.id);
      if (!m) continue;
      const was = m.data.status;
      m.data = { ...x, _k: m.kind };
      if (was && was !== x.status && x.status === 'down') this.note(m.cx, m.y - 8, 'DETENIDA', hex(P8.red));
      if (was === 'down' && x.status !== 'down') this.note(m.cx, m.y - 8, 'EN MARCHA', hex(P8.lime));
    }
    this.syncBots(state.sessions || []);
  }

  syncBots(sessions) {
    const seen = new Set(), per = {};
    for (const s of sessions) {
      seen.add(s.id);
      let b = this.bots.get(s.id);
      const hall = this.halls.get(s.account) || [...this.halls.values()][0];
      if (!b) {
        const g = new Graphics(); g.eventMode = 'static'; g.cursor = 'pointer'; g.hitArea = new Rectangle(-8, -10, 16, 18);
        g.on('pointertap', () => { if (!this.dragMoved) this.pick('session', s.id); });
        this.tipOn(g, () => ({ title: 'Robot obrero · agente de Claude Code', body: esc(b.s.activity || ''), meta: b.s.waitKind ? 'Detenido en la barrera: espera su permiso' : { working: 'Trabajando', thinking: 'Pensando', idle: 'En pausa' }[b.s.state] || '', hint: 'Clic para ver la línea de tiempo' }));
        this.items.addChild(g);
        b = { g, s, x: hall ? hall.x + 20 : 40, y: hall ? hall.y + 20 : 40, tx: 0, ty: 0, wait: 0 };
        this.bots.set(s.id, b);
      }
      b.s = s; b.hall = hall;
      per[s.account] = (per[s.account] || 0) + 1; b.slot = per[s.account] - 1;
    }
    for (const [id, b] of this.bots) if (!seen.has(id)) { b.g.destroy(); this.bots.delete(id); }
  }

  // ------------------------------------------------------------------ eventos
  onEvent(e, priv) {
    switch (e.kind) {
      case 'http': return this.piece(e);
      case 'attack': return this.drone(false);
      case 'block': return this.drone(true, priv ? e.ip : null);
      case 'login': return this.note(this.plant.x + 48, this.plant.y - 36, priv && e.user ? `INGRESO ${e.user.toUpperCase()}` : 'INGRESO SSH', hex(P8.lime));
      case 'mail': return this.note(this.plant.x + 48, this.plant.y + 80, e.dir === 'bounce' ? 'CORREO DEVUELTO' : e.dir === 'in' ? 'CORREO RECIBIDO' : 'CORREO ENVIADO', hex(e.dir === 'bounce' ? P8.orange : P8.lgray));
      case 'deploy': {
        const m = this.machines.get(e.app);
        if (!m) return;
        if (e.action === 'building') { m.spark = 8; this.note(m.cx, m.y - 8, 'MONTANDO…', hex(P8.yellow)); }
        else { m.spark = 0; this.note(m.cx, m.y - 8, { ready: 'OPERATIVA', error: 'FALLA DE MONTAJE', canceled: 'CANCELADO' }[e.action] || '', hex(e.action === 'ready' ? P8.lime : P8.red)); }
        return;
      }
      case 'pm2': { const m = this.machines.get(e.app); if (m && e.action !== 'down') this.note(m.cx, m.y - 8, 'REARRANQUE', hex(P8.orange)); return; }
      case 'domain': { const h = this.halls.get(e.account); if (h) this.note(h.x + h.w / 2, h.y - 6, ({ added: 'LÍNEA NUEVA', removed: 'LÍNEA RETIRADA', changed: 'LÍNEA CAMBIADA' }[e.action] || '') + (priv && e.domain ? `: ${e.domain}` : ''), hex(e.action === 'removed' ? P8.orange : P8.lime)); return; }
      case 'claude': {
        const b = this.bots.get(e.sid) || [...this.bots.entries()].find(([k]) => e.sid && k.startsWith(e.sid))?.[1];
        if (!b) return;
        if (e.action === 'permission') { this.urgent = { x: b.x, y: b.y, until: this.t + 12 }; this.note(b.x, b.y - 14, 'PIDE PERMISO', hex(P8.orange)); }
        else if (e.action === 'done') this.note(b.x, b.y - 14, 'TAREA LISTA', hex(P8.lime));
        return;
      }
    }
  }

  // pieza: puerta -> bus -> troncal -> cinta de su fila -> maquina -> salida (o chatarra si fallo)
  piece(e) {
    if (this.pieces.length > 160) return;
    const m = this.machines.get(e.app || e.site);
    if (!m) return;
    const err = e.status >= 500;
    const pts = [{ x: this.gate.x, y: this.gate.y }, { x: m.trunkX, y: this.gate.y }, { x: m.trunkX, y: m.beltY }, { x: m.cx, y: m.beltY }, { x: m.cx, y: m.cy }];
    const after = err ? [{ x: m.cx, y: m.beltY }, { x: m.trunkX, y: m.beltY }, { x: m.trunkX, y: this.box.y1 - 44 }, { x: this.bin.x, y: this.bin.y }] : [{ x: m.cx, y: m.beltY }, { x: m.hall.x + m.hall.w - 6, y: m.beltY }];
    const g = new Graphics().rect(-2, -2, 5, 5).fill(e.bot ? P8.lav : P8.peach).rect(-2, -2, 5, 1).fill(P8.white);
    g.x = pts[0].x; g.y = pts[0].y;
    this.items.addChild(g);
    this.pieces.push({ g, pts, after, seg: 0, err, m, bot: e.bot, phase: 0, speed: 150 + Math.random() * 40 });
  }

  drone(blocked, ip) {
    const B = this.box, fromTop = Math.random() < 0.5;
    const start = fromTop ? { x: B.x0 + Math.random() * (B.x1 - B.x0), y: B.y0 - 60 } : { x: B.x1 + 60, y: B.y0 + Math.random() * (B.y1 - B.y0) };
    const hit = fromTop ? { x: start.x, y: B.y0 + 2 } : { x: B.x1 - 2, y: start.y };
    const g = new Graphics().rect(-6, -2, 12, 4).fill(P8.lav).rect(-2, -4, 4, 8).fill(P8.black).rect(-7, -3, 2, 2).fill(P8.red).rect(5, -3, 2, 2).fill(P8.red);
    g.x = start.x; g.y = start.y;
    this.fx.push({ obj: g, age: 0, tick: (f, dt) => {
      this.fxL.addChild(g);
      const dx = hit.x - g.x, dy = hit.y - g.y, d = Math.hypot(dx, dy), st = 90 * dt;
      if (d > st) { g.x += dx / d * st; g.y += dy / d * st; return true; }
      if (!f.shot) {
        f.shot = true; f.shotAt = f.age;
        this.laser = { x1: this.turret.x, y1: this.turret.y, x2: g.x, y2: g.y, t: 0.25 };
        if (blocked) { this.rejected++; this.boom(g.x, g.y); if (ip) this.note(g.x, g.y - 12, ip, hex(P8.red)); return false; }
      }
      g.y += 20 * dt; g.x += 30 * dt; g.alpha = 1 - (f.age - f.shotAt);
      return g.alpha > 0;
    } });
  }

  boom(x, y) { for (let i = 0; i < 10; i++) { const g = new Graphics().rect(-1, -1, 3, 3).fill(i % 2 ? P8.orange : P8.yellow); g.x = x; g.y = y; const a = Math.random() * 6.28, sp = 30 + Math.random() * 50; this.fxL.addChild(g); this.fx.push({ obj: g, age: 0, tick: (f, dt) => { g.x += Math.cos(a) * sp * dt; g.y += Math.sin(a) * sp * dt; g.alpha = 1 - f.age * 1.5; return f.age < 0.66; } }); } }
  puff(x, y, color) { const g = new Graphics().rect(-3, -3, 6, 6).fill(color); g.x = x; g.y = y; this.fxL.addChild(g); this.fx.push({ obj: g, age: 0, tick: (f, dt) => { g.y -= 14 * dt; g.x += 4 * dt; g.alpha = 0.8 - f.age / 2; g.scale.set(1 + f.age); return f.age < 1.6; } }); }
  note(x, y, text, color) {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 14, fill: color, stroke: { color: '#000000', width: 4 } } });
    t.anchor.set(0.5, 1); this.screen.addChild(t);
    this.fx.push({ obj: t, age: 0, world: { x, y }, tick: (f, dt) => { f.world.y -= 10 * dt; t.alpha = f.age < 2.2 ? 1 : 1 - (f.age - 2.2) / 0.6; return f.age < 2.8; } });
  }

  // ------------------------------------------------------------------ cuadro a cuadro
  tick(dt) {
    this.t += dt;
    if (!this.box) { this.applyCam(dt); return; }
    // cintas animadas
    const b = this.belts; b.clear();
    const off = (this.t * 24) % 8;
    for (const [x1, y1, x2, y2] of this.segments) {
      const hz = y1 === y2, len = hz ? Math.abs(x2 - x1) : Math.abs(y2 - y1), dir = hz ? Math.sign(x2 - x1) : Math.sign(y2 - y1);
      if (hz) b.rect(Math.min(x1, x2) - 4, y1 - 4, len + 8, 8).fill(P8.black).rect(Math.min(x1, x2) - 3, y1 - 3, len + 6, 6).fill(0x3d3d48);
      else b.rect(x1 - 4, Math.min(y1, y2) - 4, 8, len + 8).fill(P8.black).rect(x1 - 3, Math.min(y1, y2) - 3, 6, len + 6).fill(0x3d3d48);
      for (let d = off; d < len; d += 8) {
        const px = hz ? x1 + dir * d : x1, py = hz ? y1 : y1 + dir * d;
        if (hz) b.rect(px - 1, py - 2, 2, 4).fill(P8.dgray); else b.rect(px - 2, py - 1, 4, 2).fill(P8.dgray);
      }
    }
    // central: humo segun CPU, silos de memoria y disco
    const sys = this.state && this.state.system;
    const d = this.dyn; d.clear();
    if (sys) {
      if (Math.random() < dt * (0.5 + sys.cpu / 18)) this.puff(this.plant.x + 66, this.plant.y - 28, sys.cpu > 70 ? P8.dgray : P8.lgray);
      const lv = [sys.mem ? sys.mem.pct : 0, sys.disk ? sys.disk.pct : 0];
      this.silos.forEach((s, i) => { const h = 42 * clamp(lv[i] / 100, 0, 1); d.rect(s.x + 2, s.y + 44 - h, 14, h).fill(lv[i] > 85 ? P8.red : s.color); });
    }
    // maquinas: engranaje segun CPU, foco, tanque de memoria, atasco si esta caida
    const blink = Math.floor(this.t * 3) % 2;
    for (const m of this.machines.values()) {
      const a = m.data, down = a.status === 'down';
      m.rot += down ? 0 : dt * (0.6 + (m.site ? Math.sqrt(a.reqMin || 0) : (a.cpu || 0) / 12));
      const g = m.gear; g.clear();
      for (let i = 0; i < 8; i++) { const ang = m.rot + i * Math.PI / 4; g.rect(Math.cos(ang) * 7 - 1.5, Math.sin(ang) * 7 - 1.5, 3, 3).fill(m.site ? P8.blue : P8.lgray); }
      g.circle(0, 0, 5).fill(m.site ? P8.navy : P8.dgray).circle(0, 0, 2).fill(P8.black);
      const light = down ? (blink ? P8.red : P8.plum) : a.status === 'degraded' ? P8.orange : P8.lime;
      d.rect(m.x + 26, m.y + (m.site ? 6 : 2), 4, 4).fill(light);
      if (!m.site) { const h = 18 * clamp(Math.log2(1 + (a.mem || 0) / 20e6) / 6, 0, 1); d.rect(m.x + 2, m.y + 26 - h, 3, h).fill(P8.blue); }
      if (down) { d.moveTo(m.cx - 5, m.beltY - 5).lineTo(m.cx + 5, m.beltY + 5).moveTo(m.cx + 5, m.beltY - 5).lineTo(m.cx - 5, m.beltY + 5).stroke({ width: 2, color: P8.red }); }
      if (a.status === 'degraded' && Math.random() < dt) this.puff(m.cx, m.y, P8.dgray);
      if (m.spark > 0) { m.spark -= dt; if (Math.random() < 0.5) this.boom(m.cx + (Math.random() - 0.5) * 20, m.y + 4); }
    }
    // piezas por las cintas
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i], to = p.pts[p.seg + 1];
      if (!to) {
        if (p.phase === 0) { p.phase = 1; p.pts = [{ x: p.g.x, y: p.g.y }, ...p.after]; p.seg = 0; if (p.err) { p.g.clear().rect(-2, -2, 5, 5).fill(P8.red); } continue; }
        if (p.err) { this.scrap++; this.puff(this.bin.x, this.bin.y - 10, P8.brown); }
        p.g.destroy(); this.pieces.splice(i, 1); continue;
      }
      const dx = to.x - p.g.x, dy = to.y - p.g.y, dd = Math.hypot(dx, dy), st = p.speed * dt;
      if (dd <= st) { p.g.x = to.x; p.g.y = to.y; p.seg++; } else { p.g.x += dx / dd * st; p.g.y += dy / dd * st; }
    }
    // robots obreros
    for (const bt of this.bots.values()) {
      const waiting = !!bt.s.waitKind, h = bt.hall;
      if (!h) continue;
      if (waiting) { bt.tx = h.barrier.x; bt.ty = h.barrier.y + bt.slot * 12; }
      else { bt.wait -= dt; if (bt.wait <= 0) { const ms = [...this.machines.values()].filter(m => m.hall === h); const m = ms[Math.floor(Math.random() * ms.length)]; if (m) { bt.tx = m.cx + 12; bt.ty = m.beltY + 10; } bt.wait = 3 + Math.random() * 3; } }
      const dx = bt.tx - bt.x, dy = bt.ty - bt.y, dd = Math.hypot(dx, dy), st = 40 * dt;
      if (dd > st) { bt.x += dx / dd * st; bt.y += dy / dd * st; }
      const g = bt.g; g.clear(); g.x = bt.x; g.y = bt.y;
      g.rect(-5, -5, 10, 9).fill(P8.black).rect(-4, -4, 8, 7).fill(bt.s.state === 'idle' ? P8.dgray : P8.peach).rect(-2, -2, 1, 1).fill(P8.black).rect(1, -2, 1, 1).fill(P8.black).rect(-4, 4, 3, 2).fill(P8.black).rect(1, 4, 3, 2).fill(P8.black);
      if (!waiting && bt.s.state === 'working') g.rect(-3, -9, 6, 4).fill(P8.yellow);
      if (waiting) {
        g.rect(-10, -12, 20, 2).fill(blink ? P8.yellow : P8.black);
        const ang = this.t * 6; g.rect(Math.cos(ang) * 3 - 1, -16 + Math.sin(ang) * 1, 3, 3).fill(P8.orange);
      }
    }
    // laser de la torreta
    if (this.laser && this.laser.t > 0) { this.laser.t -= dt; d.moveTo(this.laser.x1, this.laser.y1).lineTo(this.laser.x2, this.laser.y2).stroke({ width: 2, color: P8.red, alpha: this.laser.t * 4 }); }
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
    if (this.box) {
      for (const h of this.halls.values()) { const p = toS(h.labelPos); h.label.x = p.x; h.label.y = p.y; }
      const pb = toS({ x: this.bin.x, y: this.bin.y + 24 }); this.binLabel.x = pb.x; this.binLabel.y = pb.y; this.binLabel.text = `CHATARRA ${this.scrap}`;
      const pt = toS({ x: this.turret.x - 10, y: this.turret.y + 26 }); this.rejLabel.x = pt.x; this.rejLabel.y = pt.y; this.rejLabel.text = `RECHAZADOS ${this.rejected}`;
      const pp = toS({ x: this.plant.x + this.plant.w / 2, y: this.plant.y + this.plant.h + 10 }); this.plantLabel.x = pp.x; this.plantLabel.y = pp.y;
    }
    for (const f of this.fx) if (f.world) { const p = toS(f.world); f.obj.x = p.x; f.obj.y = p.y; }
    if (this.manualUntil && this.manualUntil < this.t) { this.manualUntil = 0; this.camTarget = this.overview; this.navChanged(); }
    else if (this.manualUntil && Math.floor(this.t) !== this.lastNav) { this.lastNav = Math.floor(this.t); this.navChanged(); }
  }

  drawSelection() {
    const g = this.selG; g.clear();
    const s = this.selected;
    if (!s) return;
    let r = null;
    if (s.kind === 'app' || s.kind === 'site') { const m = this.machines.get(s.id); if (m) r = { x: m.x - 3, y: m.y - 3, w: 38, h: 36 }; }
    else if (s.kind === 'session') { const b = this.bots.get(s.id); if (b) r = { x: b.x - 9, y: b.y - 9, w: 18, h: 18 }; }
    if (!r) return;
    const on = Math.floor(this.t * 4) % 2;
    for (let x = r.x; x < r.x + r.w; x += 4) g.rect(x, r.y, 2, 2).fill(on ? P8.yellow : P8.black).rect(x, r.y + r.h, 2, 2).fill(on ? P8.black : P8.yellow);
    for (let y = r.y; y < r.y + r.h; y += 4) g.rect(r.x, y, 2, 2).fill(on ? P8.yellow : P8.black).rect(r.x + r.w, y, 2, 2).fill(on ? P8.black : P8.yellow);
  }

  // ------------------------------------------------------------------ camara y navegacion
  setInsets(ins) { this.insets = ins; this.fit(true); }
  fit(snap) {
    if (!this.app || !this.box) return;
    const W = this.app.screen.width, H = this.app.screen.height, i = this.insets, B = this.box;
    const aw = Math.max(200, W - i.left - i.right), ah = Math.max(200, H - i.top - i.bottom);
    let s = Math.min(aw / (B.x1 - B.x0 + 30), ah / (B.y1 - B.y0 + 30));
    if (s >= 2) s = Math.floor(s);
    const cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2;
    this.overview = { s, x: (i.left - i.right) / 2 - cx * s, y: (i.top - i.bottom) / 2 - cy * s };
    if (!this.manualUntil) { this.camTarget = this.overview; if (snap) Object.assign(this.cam, this.overview); }
  }
  frameOn(x, y, s) { const i = this.insets; return { s, x: (i.left - i.right) / 2 - x * s, y: (i.top - i.bottom) / 2 - y * s }; }
  director(dt) {
    if (this.manualUntil || !this.overview) return;
    if (this.urgent && this.urgent.until > this.t) { this.camTarget = this.frameOn(this.urgent.x, this.urgent.y, Math.max(3, this.overview.s * 2.5)); return; }
    this.urgent = null;
    if (!this.directorOn) { this.camTarget = this.overview; return; }
    this.shotT -= dt;
    if (this.shotT > 0) return;
    const hs = [...this.halls.values()];
    this.shotIdx = (this.shotIdx + 1) % (hs.length * 2 || 1);
    if (this.shotIdx % 2 === 0 || !hs.length) { this.camTarget = this.overview; this.shotT = 10; return; }
    const h = hs[Math.floor(this.shotIdx / 2) % hs.length];
    const W = this.app.screen.width - this.insets.left - this.insets.right, H = this.app.screen.height - this.insets.top - this.insets.bottom;
    this.camTarget = this.frameOn(h.x + h.w / 2, h.y + h.h / 2, Math.max(this.overview.s, Math.min(W / (h.w + 80), H / (h.h + 80)))); this.shotT = 10;
  }
  setDirector(on) { this.directorOn = on; this.shotT = 0; }
  navState() { return this.manualUntil ? { mode: 'manual', left: Math.max(0, Math.ceil(this.manualUntil - this.t)) } : { mode: this.directorOn ? 'director' : 'fixed' }; }
  navChanged() { if (this.onNav) this.onNav(this.navState()); }
  manual() { this.manualUntil = this.t + 90; this.navChanged(); }
  resetView() { this.manualUntil = 0; this.camTarget = this.overview; this.shotT = 10; this.navChanged(); }
  zoomBy(f) { this.manual(); const c = this.camTarget || this.cam; const ns = clamp(c.s * f, this.overview.s * 0.7, 8); this.camTarget = { s: ns, x: c.x * ns / c.s, y: c.y * ns / c.s }; }
  pick(kind, id) {
    this.selected = { kind, id };
    let p = null;
    if (kind === 'app' || kind === 'site') { const m = this.machines.get(id); if (m) p = { x: m.cx, y: m.cy, s: 4 }; }
    else if (kind === 'session') { const b = this.bots.get(id); if (b) p = { x: b.x, y: b.y, s: 4 }; }
    else if (kind === 'district') { const h = this.halls.get(id); if (h) p = { x: h.x + h.w / 2, y: h.y + h.h / 2, s: 2.5 }; }
    else if (kind === 'system') p = { x: this.plant.x + 48, y: this.plant.y + 30, s: 3 };
    else if (kind === 'security') p = { x: this.turret.x, y: this.turret.y, s: 3 };
    if (p) { this.manual(); this.camTarget = this.frameOn(p.x, p.y, Math.max(p.s, this.overview ? this.overview.s : 1)); }
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
