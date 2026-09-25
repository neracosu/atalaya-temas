// Mundo isometrico de Atalaya (PixiJS v8)
import { Application, Container, Graphics, Text, Sprite, Rectangle, Polygon } from '/vendor/pixi.csp.mjs';
import { px } from './pixicons.js';
import { robotTextures, monoTextures, iconTexture, signTexture, INVADER, ENVELOPE } from './sprites.js';
import { STATION_TIPS } from './tips.js';
import { esc, fmtBytes } from './hud.js';

const TW = 64, TH = 32; // tile isometrico
const iso = (gx, gy) => ({ x: (gx - gy) * TW / 2, y: (gx + gy) * TH / 2 });
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = s => parseInt(String(s).replace('#', ''), 16);
function mix(c1, c2, t) {
  const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t), g = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t), b = lerp(c1 & 255, c2 & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
const STATIONS = ['desk', 'library', 'workshop', 'terminal', 'antenna', 'portal'];
const STATUS_COLOR = { online: 0x22c55e, degraded: 0xf59e0b, down: 0xef4444 };
const PIXEL_FONT = { fontFamily: 'Silkscreen, monospace' };
const UI_FONT = { fontFamily: 'Space Grotesk, system-ui, sans-serif' };

function label(text, size, color = 0xe6edf7, font = PIXEL_FONT) {
  const t = new Text({ text, style: { ...font, fontSize: size, fill: color, align: 'center' }, resolution: 3 });
  t.anchor.set(0.5, 0.5);
  return t;
}

// ------------------------------------------------------------ edificio (app PM2)
class Building extends Container {
  constructor(app, color, isSite = false) {
    super();
    this.isSite = isSite;
    this.fp = isSite ? 0.62 : 1; // huella relativa
    this.appId = app.id;
    this.color = hex(color);
    this.h = 30; this.targetH = 30; this.heat = 0; this.targetHeat = 0;
    this.status = 'online'; this.flash = 0; this.lit = new Set(); this.activity = 0;
    this.glow = new Graphics(); this.g = new Graphics(); this.beacon = new Graphics();
    // letrero: icono de categoria + que es (y el nombre real en modo privado)
    this.sign = new Container();
    this.signBg = new Graphics();
    this.signIcon = new Sprite(signTexture('web')); this.signIcon.anchor.set(0, 0.5); this.signIcon.scale.set(2.2);
    this.signMain = new Text({ text: '', style: { ...UI_FONT, fontSize: 15, fill: 0xe6edf7, fontWeight: '600' }, resolution: 3 });
    this.signSub = new Text({ text: '', style: { ...UI_FONT, fontSize: 11, fill: 0x8a9ab3 }, resolution: 3 });
    this.signMain.anchor.set(0, 0.5); this.signSub.anchor.set(0, 0.5);
    this.sign.addChild(this.signBg, this.signIcon, this.signMain, this.signSub);
    this.addChild(this.glow, this.g, this.beacon); // el letrero va en la capa de etiquetas del mundo
    this.update(app);
  }
  update(app) {
    this.app = app;
    const mb = (app.mem || 0) / 1048576;
    this.targetH = this.isSite ? 14 + clamp(Math.log2(1 + (app.reqMin || 0)) * 7, 0, 36)
      : 26 + clamp(Math.log2(Math.max(mb, 16) / 16) * 13, 0, 90);
    this.targetHeat = clamp((app.cpu || 0) / 80, 0, 1);
    this.status = app.status;
    this.activity = app.reqMin || 0;
    const main = app.name || app.kind || '';
    const sub = app.kind && app.kind !== main ? app.kind : '';
    if (this.signMain.text !== main || this.signSub.text !== sub || this.signIconName !== app.icon) this.setSign(main, sub, app.icon);
    this.redraw();
  }
  setSign(main, sub, icon) {
    this.signIconName = icon;
    if (this.full === false) { this.signMain.text = main; this.signSub.text = sub; this.signIcon.texture = signTexture(icon || 'web'); return; }
    this.signIcon.texture = signTexture(icon || 'web');
    this.signMain.text = main; this.signSub.text = sub;
    const iw = 22, gap = 7, padX = 9;
    const tw = Math.max(this.signMain.width, this.signSub.width);
    const w = padX * 2 + iw + gap + tw, h = sub ? 40 : 30;
    const x0 = -w / 2;
    this.signIcon.x = x0 + padX; this.signIcon.y = 0;
    this.signMain.x = this.signSub.x = x0 + padX + iw + gap;
    this.signMain.y = sub ? -7 : 0; this.signSub.y = 10;
    this.signBg.clear().roundRect(x0, -h / 2, w, h, 8).fill({ color: 0x0a1122, alpha: 0.88 })
      .stroke({ width: 1.5, color: this.color, alpha: 0.55 });
  }
  // detalle completo de cerca; de lejos solo el icono, con tamano constante en pantalla
  setDetail(full, camScale) {
    if (full !== this.full) {
      this.full = full;
      this.signMain.visible = this.signSub.visible = full;
      if (full) this.setSign(this.signMain.text, this.signSub.text, this.signIconName);
      else {
        this.signIcon.x = -11; this.signIcon.y = 0;
        this.signBg.clear().roundRect(-17, -16, 34, 32, 8).fill({ color: 0x0a1122, alpha: 0.9 }).stroke({ width: 1.5, color: this.color, alpha: 0.6 });
      }
    }
    this.sign.scale.set(full ? 1 : clamp(0.62 / camScale, 1, 2.2));
  }
  pulse() { this.flash = 1; }
  redraw() {
    const g = this.g; g.clear();
    const hw = TW * this.fp, hh = TH * this.fp, h = this.h; // huella 2x2 tiles (sitios: menor)
    const down = this.status === 'down';
    const base = down ? 0x374151 : mix(this.color, 0x0b1222, 0.55);
    const hot = mix(base, 0xf97316, this.heat * 0.8);
    const top = mix(down ? 0x4b5563 : mix(this.color, 0xffffff, this.isSite ? 0.45 : 0.1), 0xfb923c, this.heat);
    const left = mix(hot, 0x000000, 0.35), right = mix(hot, 0x000000, 0.12);
    // base / sombra
    g.poly([0, -hh + 6, hw + 6, 6, 0, hh + 6, -hw - 6, 6]).fill({ color: 0x000000, alpha: 0.35 });
    // caras
    g.poly([-hw, 0, 0, hh, 0, hh - h, -hw, -h]).fill(left);
    g.poly([0, hh, hw, 0, hw, -h, 0, hh - h]).fill(right);
    g.poly([0, -hh - h, hw, -h, 0, hh - h, -hw, -h]).fill(top).stroke({ width: 1, color: mix(top, 0xffffff, 0.3), alpha: 0.6 });
    // ventanas: filas en ambas caras
    const rows = Math.floor((h - 10) / 9);
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const yy = -h + 8 + r * 9;
      for (let c = 0; c < 4; c++) {
        for (const side of [-1, 1]) {
          const t0 = 0.12 + c * 0.21, t1 = t0 + 0.12;
          const x0 = side * hw * (1 - t0), x1 = side * hw * (1 - t1);
          const y0 = yy + hh * t0, y1 = yy + hh * t1;
          const on = !down && this.lit.has(idx);
          g.poly([x0, y0, x1, y1, x1, y1 + 4, x0, y0 + 4]).fill({ color: on ? 0xfff3c4 : 0x0b1222, alpha: on ? 0.95 : 0.55 });
          idx++;
        }
      }
    }
    this.windows = idx;
    this.hitArea = new Polygon([-hw, 0, 0, hh, hw, 0, hw, -h - 30, 0, -hh - h - 30, -hw, -h - 30]);
    // brillo por calor/actividad
    this.glow.clear();
    const ga = this.flash * 0.6 + this.heat * 0.25;
    if (ga > 0.02) this.glow.ellipse(0, hh - h / 2, hw * 1.5, h / 1.4 + hh).fill({ color: this.flash > 0.05 ? 0xffffff : 0xf97316, alpha: ga * 0.35 });
  }
  tick(dt, t) {
    let dirty = false;
    if (Math.abs(this.h - this.targetH) > 0.3) { this.h = lerp(this.h, this.targetH, 1 - Math.pow(0.02, dt)); dirty = true; }
    if (Math.abs(this.heat - this.targetHeat) > 0.01) { this.heat = lerp(this.heat, this.targetHeat, 1 - Math.pow(0.05, dt)); dirty = true; }
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 1.5); dirty = true; }
    // parpadeo de ventanas segun trafico
    this.winT = (this.winT || 0) + dt;
    if (this.winT > 0.6) {
      this.winT = 0;
      const want = clamp(Math.round((this.windows || 8) * (0.15 + Math.min(this.activity, 60) / 80)), 1, this.windows || 8);
      const s = new Set([...this.lit].filter(() => Math.random() > 0.25));
      while (s.size < want) s.add(Math.floor(Math.random() * (this.windows || 8)));
      while (s.size > want) s.delete([...s][0]);
      this.lit = s; dirty = true;
    }
    if (dirty) this.redraw();
    // baliza de estado en el techo
    const b = this.beacon; b.clear();
    const on = this.status === 'online' ? 0.5 + 0.5 * Math.sin(t * 2) : (Math.sin(t * 8) > 0 ? 1 : 0.15);
    b.rect(-1, -this.h - TH - 10, 2, 10).fill(0x94a3b8);
    b.circle(0, -this.h - TH - 12, 3).fill({ color: STATUS_COLOR[this.status] || 0x94a3b8, alpha: 0.4 + 0.6 * on });
    b.circle(0, -this.h - TH - 12, 7).fill({ color: STATUS_COLOR[this.status] || 0x94a3b8, alpha: 0.18 * on });
  }
  roof() { return { x: this.x, y: this.y - this.h }; }
}

// ------------------------------------------------------------ robot (sesion de Claude)
class Robot extends Container {
  constructor(color, small = false) {
    super();
    this.tex = robotTextures(color);
    this.shadow = new Graphics().ellipse(0, 0, 18, 7).fill({ color: 0x000000, alpha: 0.4 });
    this.sprite = new Sprite(this.tex.idle[0]);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(small ? 2.8 : 4);
    this.bubble = new Container();
    this.bubbleBg = new Graphics();
    this.bubbleText = new Text({ text: '', style: { ...UI_FONT, fontSize: 19, fill: 0x0b1020, fontWeight: '600' }, resolution: 3 });
    this.bubbleText.anchor.set(0.5, 0.5);
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.y = -this.sprite.height - 30;
    this.bubble.alpha = 0;
    this.mark = label('', small ? 16 : 22, 0xfbbf24);
    this.mark.y = -this.sprite.height - 4;
    this.addChild(this.shadow, this.sprite, this.mark, this.bubble);
    this.target = null; this.anim = 'idle'; this.frame = 0; this.ft = 0; this.state = 'idle';
    this.bubbleTTL = 0; this.bob = Math.random() * 6; this.beam = 0;
  }
  say(text, secs = 5, bg = 0xf8fafc) {
    if (!text) return;
    const s = text.length > 42 ? text.slice(0, 41) + '…' : text;
    this.bubbleText.text = s;
    const w = this.bubbleText.width + 24, h = 32;
    this.bubbleBg.clear().roundRect(-w / 2, -h / 2, w, h, 10).fill({ color: bg, alpha: 0.95 })
      .poly([-7, h / 2 - 1, 7, h / 2 - 1, 0, h / 2 + 9]).fill({ color: bg, alpha: 0.95 });
    this.bubbleTTL = secs;
  }
  moveTo(p) { this.target = p; }
  tick(dt, t) {
    this.ft += dt;
    let anim = 'idle';
    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y, d = Math.hypot(dx, dy);
      if (d < 2) { this.target = null; }
      else {
        const sp = Math.min(d, 140 * dt);
        this.x += dx / d * sp; this.y += dy / d * sp; anim = 'walk';
        if (Math.abs(dx) > 1) this.sprite.scale.x = Math.abs(this.sprite.scale.x) * (dx < 0 ? -1 : 1);
      }
    }
    if (anim !== 'walk') anim = this.state === 'working' ? 'work' : this.state === 'waiting' ? 'wave' : this.state === 'idle' ? 'sit' : 'idle';
    const rate = anim === 'walk' ? 0.18 : anim === 'work' ? 0.14 : anim === 'wave' ? 0.35 : 1.8;
    if (anim !== this.anim) { this.anim = anim; this.frame = 0; this.ft = 0; }
    if (this.ft > rate) { this.ft = 0; this.frame = (this.frame + 1) % this.tex[anim].length; }
    // parpadeo: el frame 1 de idle/sit dura poco
    const f = (anim === 'idle' || anim === 'sit') && this.frame === 1 && this.ft > 0.15 ? 0 : this.frame;
    this.sprite.texture = this.tex[anim][f];
    this.sprite.y = anim === 'idle' || anim === 'sit' ? Math.sin(t * 2 + this.bob) * 1.2 : 0;
    // marca de estado sobre la cabeza
    const m = this.state === 'thinking' ? '.'.repeat(1 + Math.floor(t * 3) % 3) : this.state === 'waiting' ? '!' : this.state === 'idle' ? 'z' : '';
    if (this.mark.text !== m) this.mark.text = m;
    this.mark.alpha = this.state === 'waiting' ? 0.5 + 0.5 * Math.sin(t * 8) : 1;
    this.mark.y = -this.sprite.height - 4 + (this.state === 'idle' ? -Math.abs(Math.sin(t)) * 6 : 0);
    if (this.bubbleTTL > 0) { this.bubbleTTL -= dt; this.bubble.alpha = Math.min(1, this.bubble.alpha + dt * 5); }
    else this.bubble.alpha = Math.max(0, this.bubble.alpha - dt * 2);
    if (this.beam > 0) { this.beam -= dt; this.sprite.alpha = 1 - this.beam; }
    if (!this.halo) { this.halo = new Graphics(); this.addChildAt(this.halo, 0); }
    this.halo.clear();
    if (this.state === 'waiting') {
      const a = 0.5 + 0.5 * Math.sin(t * 5);
      this.halo.ellipse(0, 0, 30 + a * 6, 12 + a * 3).stroke({ width: 3, color: 0xfbbf24, alpha: 0.4 + 0.5 * a })
        .rect(-3, -170, 6, 110).fill({ color: 0xfbbf24, alpha: 0.12 + 0.18 * a });
    }
    this.zIndex = this.y;
  }
}

// ------------------------------------------------------------ mundo
export class World {
  // interfaz de un mundo de tema: init, update(state), onEvent(e, priv), pick, clearSelection, setDirector,
  // resetView, zoomBy, setInsets, destroy; avisa por onSelect, onTip y onNav
  constructor(el) {
    this.el = el;
    this.districts = new Map(); // cuenta -> distrito
    this.buildings = new Map(); // app id -> Building
    this.robots = new Map(); // sid o sid/agent -> Robot
    this.fx = []; // efectos con tick propio
    this.t = 0;
    this.layoutKey = '';
    this.directorOn = true;
    this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
  }

  async init() {
    // escuchas globales atadas a este mundo: al cambiar de tema se quitan todas juntas
    this.ac = new AbortController();
    const sig = { signal: this.ac.signal };
    this.sig = sig;
    this.app = new Application();
    await this.app.init({ resizeTo: this.el, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), preference: 'webgl' });
    this.el.appendChild(this.app.canvas);
    this.cam = new Container();
    this.stars = new Graphics();
    this.ground = new Container();
    this.roads = new Graphics();
    this.scene = new Container(); this.scene.sortableChildren = true;
    this.fxLayer = new Container();
    this.labels = new Container();
    this.signs = new Container(); // letreros encima de todos los edificios
    this.cam.addChild(this.ground, this.roads, this.scene, this.signs, this.fxLayer, this.labels);
    this.app.stage.addChild(this.stars, this.cam);
    this.makeStars();
    this.buildHQ();
    // Pixi v8: el escenario debe ser interactivo para que los clics lleguen a sus hijos
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.selG = new Graphics();
    this.ground.addChild(this.selG);
    this.setupNav();
    this.app.ticker.add(tk => this.tick(tk.deltaMS / 1000));
    window.addEventListener('resize', () => { this.makeStars(); this.fit(); }, sig);
  }

  // al cambiar de tema: quita escuchas, canvas y objetos (las texturas compartidas quedan en cache)
  destroy() {
    this.ac.abort();
    this.app.destroy({ removeView: true }, { children: true });
  }

  setInsets(ins) { this.insets = ins; this.fit(); }

  makeStars() {
    const g = this.stars; g.clear();
    const w = this.app.screen.width, h = this.app.screen.height;
    this.starList = Array.from({ length: 160 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6 }));
  }

  // --- torre de control (Apache/root) en el centro
  buildHQ() {
    const hq = new Container();
    const shield = new Graphics();
    const tower = new Graphics();
    const radar = new Graphics();
    const plate = new Graphics();
    const S = 2.2; // huella
    plate.poly([0, -TH * S, TW * S, 0, 0, TH * S, -TW * S, 0]).fill({ color: 0x0f1a30 }).stroke({ width: 2, color: 0x334155 });
    for (let i = 1; i < 4; i++) {
      const k = i / 4;
      plate.poly([0, -TH * S * k, TW * S * k, 0, 0, TH * S * k, -TW * S * k, 0]).stroke({ width: 1, color: 0x1e293b });
    }
    const hw = TW * 0.9, hh = TH * 0.9, h = 150;
    tower.poly([-hw, 0, 0, hh, 0, hh - h, -hw, -h]).fill(0x1e293b);
    tower.poly([0, hh, hw, 0, hw, -h, 0, hh - h]).fill(0x334155);
    tower.poly([0, -hh - h, hw, -h, 0, hh - h, -hw, -h]).fill(0x64748b);
    for (let y = -h + 14; y < -8; y += 14) {
      tower.poly([-hw + 6, y + 3, -6, y + hh - 3, -6, y + hh + 1, -hw + 6, y + 7]).fill({ color: 0x22d3ee, alpha: 0.5 });
      tower.poly([6, y + hh - 3, hw - 6, y + 3, hw - 6, y + 7, 6, y + hh + 1]).fill({ color: 0x22d3ee, alpha: 0.35 });
    }
    // mastil
    tower.rect(-2, -h - hh - 40, 4, 40).fill(0x94a3b8);
    radar.y = -h - hh - 40;
    const name = label('TORRE DE CONTROL', 20, 0xe6edf7);
    name.y = TH * S + 26;
    this.hqTag = label('apache · mariadb · exim', 13, 0x6b7a93);
    this.hqTag.y = TH * S + 50;
    hq.addChild(shield, plate, tower, radar, name, this.hqTag);
    hq.zIndex = 0;
    this.hq = { c: hq, shield, radar, h, rx: 190, ry: 105, flash: 0, heat: 0 };
    this.scene.addChild(hq);
    this.tappable(hq, new Rectangle(-170, -h - 100, 340, h + 170), () => this.pick('system', 'root'));
    this.hoverTip(hq, () => ({ title: 'Torre de control', body: 'El <b>servidor</b>: Apache recibe todo el tráfico y lo reparte a cada distrito. El <b>escudo</b> se enciende cuando repele un ataque.',
      meta: (this.state?.system ? `CPU ${this.state.system.cpu.toFixed(0)}% · RAM ${this.state.system.mem.pct.toFixed(0)}% · carga ${this.state.system.load[0].toFixed(2)}` : '')
        + (this.state?.keys?.length ? `<br>${this.state.keys.map(k => px(k.state === 'active' ? 'dotG' : k.state === 'failed' ? 'dotR' : 'dotS') + ' ' + esc(k.label)).join(' · ')}` : ''),
      hint: 'Clic para ver el servidor completo' }));
    this.gate = { x: 0, y: -h - 260 }; // "Internet"
    const gate = new Graphics();
    gate.circle(0, 0, 24).stroke({ width: 2, color: 0x22d3ee, alpha: 0.6 }).circle(0, 0, 14).stroke({ width: 2, color: 0xa78bfa, alpha: 0.6 });
    gate.x = this.gate.x; gate.y = this.gate.y;
    this.tappable(gate, new Rectangle(-40, -40, 80, 80), () => this.pick('security', 'all'));
    this.hoverTip(gate, () => ({ title: 'Internet', body: 'De aquí entran las visitas: <b>cian</b> personas, <b>gris</b> robots, <b>ámbar</b> errores del visitante y <b>rojo</b> errores del servidor.', hint: 'Clic para ver la defensa' }));
    const gl = label('INTERNET', 16, 0x6b7a93); gl.x = this.gate.x; gl.y = this.gate.y - 38;
    this.gateG = gate;
    this.labels.addChild(gate, gl);
    this.stations = new Map(); // cuenta -> {name: point}
    this.stations.set('root', this.makeStations(null, { x: 0, y: TH * S + 110 }));
  }

  makeStations(d, origin) {
    // fila de 6 estaciones en el frente de la parcela
    const pts = {};
    const cont = new Container();
    STATIONS.forEach((s, i) => {
      const p = { x: origin.x + (i - 2.5) * 70, y: origin.y + (i % 2) * 8 };
      pts[s] = p;
      const pad = new Graphics().ellipse(0, 0, 26, 11).fill({ color: 0x0f172a, alpha: 0.9 }).stroke({ width: 1, color: 0x334155 });
      const ic = new Sprite(iconTexture(s)); ic.anchor.set(0.5, 1); ic.scale.set(3.4);
      pad.x = p.x; pad.y = p.y; ic.x = p.x; ic.y = p.y - 2;
      this.hoverTip(ic, () => ({ title: STATION_TIPS[s][0], body: STATION_TIPS[s][1] }));
      ic.alpha = 0.85;
      cont.addChild(pad, ic);
    });
    this.ground.addChild(cont);
    return { pts, cont };
  }

  // --- distribucion de distritos alrededor de la torre
  layout(state) {
    const accounts = state.accounts.filter(a => a.id !== 'root');
    // cada distrito: sus apps de PM2 y despues sus sitios (WordPress, PHP, estaticos...)
    const appsBy = {};
    for (const a of state.apps) (appsBy[a.account] = appsBy[a.account] || []).push(a);
    for (const x of state.sites || []) (appsBy[x.account] = appsBy[x.account] || []).push({ ...x, _site: true });
    const key = accounts.map(a => a.id + ':' + (appsBy[a.id] || []).map(e => e.id).join(',') + ':' + (a.cpanel || '')).join('|');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    // limpiar distritos anteriores
    for (const d of this.districts.values()) { d.plate.destroy({ children: true }); d.st.cont.destroy({ children: true }); d.name.destroy(); d.sub.destroy(); }
    for (const b of this.buildings.values()) { b.sign.destroy({ children: true }); b.destroy({ children: true }); }
    this.districts.clear(); this.buildings.clear();

    const items = accounts.map(a => {
      const n = Math.max(1, (appsBy[a.id] || []).length);
      const cols = Math.max(2, Math.ceil(Math.sqrt(n)));
      const rows = Math.ceil(n / cols);
      const W = cols * 4 + 1, H = rows * 4 + 1;
      const sw = (W + H) * TW / 2, sh = (W + H) * TH / 2 + 180; // alto incluye edificios y estaciones
      return { a, n, cols, rows, W, H, sw, sh };
    }).sort((x, y) => y.n - x.n);
    // ranuras: der, izq, arriba-der, arriba-izq, abajo, abajo-der, abajo-izq
    const slots = [[1, 0.05], [-1, 0.05], [0.55, -0.9], [-0.55, -0.9], [0, 1], [0.8, 0.95], [-0.8, 0.95]];
    const RX = 300, RY = 250;
    items.forEach((it, i) => {
      const s = slots[i % slots.length];
      it.cx = s[0] * (RX + it.sw / 2); it.cy = s[1] * (RY + it.sh / 3);
    });
    // separar solapes
    for (let k = 0; k < 60; k++) {
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        const ox = (A.sw + B.sw) / 2 + 30 - Math.abs(A.cx - B.cx), oy = (A.sh + B.sh) / 2 + 10 - Math.abs(A.cy - B.cy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) { const d = Math.sign(B.cx - A.cx) || 1; B.cx += d * ox / 2; A.cx -= d * ox / 2; }
          else { const d = Math.sign(B.cy - A.cy) || 1; B.cy += d * oy / 2; A.cy -= d * oy / 2; }
        }
      }
      for (const it of items) { // no pisar la torre
        const ox = it.sw / 2 + 200 - Math.abs(it.cx), oy = it.sh / 2 + 190 - Math.abs(it.cy);
        if (ox > 0 && oy > 0) { if (ox < oy) it.cx += (Math.sign(it.cx) || 1) * ox; else it.cy += (Math.sign(it.cy) || 1) * oy; }
      }
    }
    for (const it of items) this.buildDistrict(it, appsBy[it.a.id] || []);
    this.drawRoads();
    this.fit();
  }

  buildDistrict(it, apps) {
    const { a, cols, W, H } = it;
    const color = hex(a.color);
    // origen para que la parcela quede centrada en (cx, cy)
    const c = iso(W / 2, H / 2);
    const ox = it.cx - c.x, oy = it.cy - c.y - 40;
    const P = (gx, gy) => { const p = iso(gx, gy); return { x: p.x + ox, y: p.y + oy }; };
    const plate = new Graphics();
    const q = [P(0, 0), P(W, 0), P(W, H), P(0, H)];
    // grosor de la parcela
    plate.poly([q[3].x, q[3].y, q[2].x, q[2].y, q[2].x, q[2].y + 10, q[3].x, q[3].y + 10]).fill(mix(color, 0x000000, 0.8));
    plate.poly([q[2].x, q[2].y, q[1].x, q[1].y, q[1].x, q[1].y + 10, q[2].x, q[2].y + 10]).fill(mix(color, 0x000000, 0.7));
    plate.poly(q.flatMap(p => [p.x, p.y])).fill({ color: mix(color, 0x060a14, 0.86) }).stroke({ width: 2, color, alpha: 0.55 });
    for (let x = 1; x < W; x++) { const p0 = P(x, 0), p1 = P(x, H); plate.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y); }
    for (let y = 1; y < H; y++) { const p0 = P(0, y), p1 = P(W, y); plate.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y); }
    plate.stroke({ width: 1, color, alpha: 0.08 });
    this.ground.addChild(plate);
    this.tappable(plate, new Polygon(q.flatMap(p => [p.x, p.y])), () => this.pick('district', a.id));
    this.hoverTip(plate, () => ({ title: a.label, body: `Un <b>distrito</b> = una cuenta de cPanel con sus servicios (${apps.length}). Sus robots trabajan en las estaciones del frente.`, hint: 'Clic para ver el distrito' }));
    const name = label(a.label.toUpperCase(), 24, color);
    const front0 = P(W, H);
    name.x = front0.x; name.y = front0.y + 120;
    this.labels.addChild(name);
    const nApps = apps.filter(e => !e._site).length, nSites = apps.length - nApps;
    const virt = { '_sys': `${nApps} servicio${nApps === 1 ? '' : 's'} de systemd`, '_docker': `${nApps} contenedor${nApps === 1 ? '' : 'es'}`, '_web': `${nSites} sitio${nSites === 1 ? '' : 's'} del servidor` };
    if (/^_vercel-/.test(a.id)) virt[a.id] = `${nApps} proyecto${nApps === 1 ? '' : 's'} en Vercel`;
    if (/^_supa-/.test(a.id)) virt[a.id] = `${nApps} base${nApps === 1 ? '' : 's'} de datos`;
    if (/^_dev-/.test(a.id)) virt[a.id] = 'Claude Code remoto';
    const sub = label(virt[a.id] || (a.cpanel ? `${a.panel || 'cuenta'} ${a.cpanel}${a.main ? ' · ' + a.main : ''}` : `${nApps} servicio${nApps === 1 ? '' : 's'} · ${nSites} sitio${nSites === 1 ? '' : 's'}`), 14, 0x8a9ab3, UI_FONT);
    sub.x = name.x; sub.y = name.y + 26;
    this.labels.addChild(sub);
    const d = { id: a.id, color: a.color, plate, name, sub, center: { x: it.cx, y: it.cy }, entry: P(W / 2, H / 2), apps: [] };
    // edificios
    apps.forEach((app, i) => {
      const gx = 1 + (i % cols) * 4 + 1.5, gy = 1 + Math.floor(i / cols) * 4 + 1.5;
      const kind = app._site ? 'site' : 'app';
      const b = new Building(app, a.color, !!app._site);
      const p = P(gx, gy);
      b.x = p.x; b.y = p.y; b.zIndex = p.y;
      this.scene.addChild(b);
      b.sign.x = p.x; b.sign.y = p.y + TH * b.fp + 22;
      this.signs.addChild(b.sign);
      this.tappable(b, null, () => this.pick(kind, app.id), () => { b.flash = Math.max(b.flash, 0.35); });
      this.tappable(b.sign, null, () => this.pick(kind, app.id));
      b.districtLabel = a.label;
      this.hoverTip(b, () => this.buildingTip(b));
      this.hoverTip(b.sign, () => this.buildingTip(b));
      this.buildings.set(app.id, b);
      d.apps.push(app.id);
    });
    // estaciones en el borde frontal (abajo de la parcela)
    const front = P(W, H);
    d.st = this.makeStations(d, { x: front.x, y: front.y + 60 });
    this.stations.set(a.id, d.st);
    this.districts.set(a.id, d);
  }

  drawRoads() {
    const g = this.roads; g.clear();
    for (const d of this.districts.values()) {
      const a = { x: 0, y: 30 }, b = d.center;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 14, color: 0x0f172a, alpha: 0.9 });
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.5, color: hex(d.color), alpha: 0.35 });
    }
    // haz desde Internet a la torre
    g.moveTo(this.gate.x, this.gate.y + 24).lineTo(0, -this.hq.h - 20).stroke({ width: 2, color: 0x22d3ee, alpha: 0.18 });
  }

  bounds() {
    let x0 = -300, x1 = 300, y0 = this.gate.y - 60, y1 = 300;
    for (const d of this.districts.values()) {
      const b = d.plate.getLocalBounds();
      x0 = Math.min(x0, b.minX); x1 = Math.max(x1, b.maxX); y0 = Math.min(y0, b.minY - 150); y1 = Math.max(y1, b.maxY + 150);
    }
    return { x0, x1, y0, y1 };
  }

  fit() {
    if (!this.app) return;
    const { x0, x1, y0, y1 } = this.bounds();
    const W = this.app.screen.width - this.insets.left - this.insets.right;
    const H = this.app.screen.height - this.insets.top - this.insets.bottom;
    const s = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.96;
    this.overview = { s, x: this.insets.left + W / 2 - (x0 + x1) / 2 * s, y: this.insets.top + H / 2 - (y0 + y1) / 2 * s };
    if (!this.camBase) this.camBase = { ...this.overview };
  }

  // encuadre de un rectangulo del mundo dentro del area libre
  frame(x0, x1, y0, y1, maxS = 1.35) {
    const W = this.app.screen.width - this.insets.left - this.insets.right;
    const H = this.app.screen.height - this.insets.top - this.insets.bottom;
    const s = Math.min(maxS, Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.92);
    return { s, x: this.insets.left + W / 2 - (x0 + x1) / 2 * s, y: this.insets.top + H / 2 - (y0 + y1) / 2 * s };
  }
  districtFrame(id) {
    if (id === 'root') return this.frame(-330, 330, -this.hq.h - 120, 250);
    const d = this.districts.get(id);
    if (!d) return null;
    const b = d.plate.getLocalBounds();
    return this.frame(b.minX - 20, b.maxX + 20, b.minY - 150, b.maxY + 150);
  }

  // Modo director: vista general y luego un paseo por cada distrito.
  // Un evento urgente (agente pidiendo permiso) toma la camara unos segundos.
  setDirector(on) { this.directorOn = on; this.shot = null; this.shotT = 0; }
  directorTick(dt) {
    if (!this.overview) return;
    if (this.manualUntil > this.t) return; // el usuario esta navegando: la camara es suya
    this.shotT -= dt;
    // el objetivo se guarda como nombre y se resuelve en cada cuadro (el layout puede cambiar)
    const resolve = id => id === 'overview' ? this.overview : (this.districtFrame(id) || this.overview);
    if (this.urgent && this.urgent.until > this.t) { this.camTarget = resolve(this.urgent.account); return; }
    if (!this.directorOn || !this.districts.size) { this.camTarget = this.overview; return; }
    if (this.shotT <= 0 || !this.shot) {
      const order = ['overview', ...this.districts.keys(), 'root'];
      this.shotIdx = ((this.shotIdx ?? -1) + 1) % order.length;
      this.shot = order[this.shotIdx];
      this.shotT = this.shot === 'overview' ? 18 : 9;
    }
    this.camTarget = resolve(this.shot);
  }
  focus(account, secs = 10) { this.urgent = { account, until: this.t + secs }; }

  // ---------------- navegacion e interaccion ----------------
  tappable(obj, hitArea, onTap, onHover) {
    obj.eventMode = 'static';
    obj.cursor = 'pointer';
    if (hitArea) obj.hitArea = hitArea;
    obj.on('pointertap', ev => { if (this.dragMoved) return; ev.stopPropagation(); onTap(); });
    if (onHover) obj.on('pointerover', onHover);
  }

  hoverTip(obj, fn) {
    if (obj.eventMode !== 'static') obj.eventMode = 'static';
    obj.on('pointerover', e => { if (this.onTip && !this.dragMoved) this.onTip(fn(), e.client.x, e.client.y); });
    obj.on('pointerout', () => this.onTip && this.onTip(null));
  }
  buildingTip(b) {
    const a = b.app || {}, ST = { online: px('dotG') + ' en línea', degraded: px('dotY') + ' parcial', down: px('dotR') + ' caído' };
    if (b.isSite) return {
      title: a.name || a.kind || 'Sitio',
      body: `${a.kind && a.kind !== a.name ? `<b>${esc(a.kind)}</b> · ` : ''}sitio de ${esc(b.districtLabel || '')} que Apache sirve directamente (no es un proceso de PM2). Su <b>altura</b> crece con las visitas.`,
      meta: `${a.reqMin || 0} visitas/min`,
      hint: 'Clic para ver dominios, países y visitas',
    };
    return {
      title: a.name || a.kind || 'Servicio',
      body: `${a.kind && a.kind !== a.name ? `<b>${esc(a.kind)}</b> · ` : ''}servicio de ${esc(b.districtLabel || '')}. La <b>altura</b> es la memoria que usa, el <b>techo naranja</b> indica CPU alta y las <b>ventanas</b> se encienden con las visitas.`,
      meta: `${ST[a.status] || ''} · CPU ${(a.cpu || 0).toFixed(1)}% · ${fmtBytes(a.mem || 0)} · ${a.reqMin || 0} visitas/min`,
      hint: 'Clic para ver su detalle',
    };
  }
  robotTip(r) {
    const a = r.info || {}, L = { working: 'Trabajando', thinking: 'Pensando', waiting: 'Lo espera', idle: 'En pausa' };
    const W = { permission: 'espera su permiso', question: 'le hizo una pregunta', idle: 'espera su respuesta' };
    return {
      title: a.title || (r.small ? 'Subagente de Claude' : 'Agente de Claude'),
      body: `${r.small ? 'Un <b>subagente</b>: ayudante que lanzó un agente principal.' : 'Una <b>sesión de Claude Code</b> trabajando en el servidor.'} Ahora: <b>${L[a.state] || ''}</b>${a.waitKind ? ` — ${W[a.waitKind] || 'lo espera'}` : ''}${a.activity && a.state !== 'idle' ? ` · ${esc(a.activity)}` : ''}.`,
      meta: a.detail ? esc(a.detail) : `${Math.round((a.tokensOut || 0) / 100) / 10}k tokens · ${a.tools || 0} herramientas`,
      hint: r.small ? '' : 'Clic para ver su línea de tiempo',
    };
  }

  pick(kind, id) {
    this.selected = { kind, id };
    this.focusOn(kind, id);
    if (this.onSelect) this.onSelect(kind, id);
  }
  clearSelection() { this.selected = null; }

  // encuadra una entidad y deja la camara en modo manual un rato
  focusOn(kind, id) {
    let f = null;
    if (kind === 'app' || kind === 'site') { const b = this.buildings.get(id); if (b) f = this.frame(b.x - 240, b.x + 240, b.y - b.h - TH - 130, b.y + TH + 110, 1.5); }
    else if (kind === 'session') { const r = this.robotById(id); if (r) f = this.frame(r.x - 280, r.x + 280, r.y - 200, r.y + 130, 1.6); }
    else if (kind === 'district') f = this.districtFrame(id);
    else if (kind === 'system') f = this.districtFrame('root');
    else if (kind === 'security') f = this.frame(-420, 420, this.gate.y - 80, 260, 1.1);
    if (!f) return;
    this.manualUntil = this.t + 90;
    this.camTarget = f;
    this.navChanged();
  }
  robotById(sid) {
    return this.robots.get(sid) || [...this.robots.entries()].find(([k]) => k.startsWith(sid + '/'))?.[1] || null;
  }

  setupNav() {
    const cv = this.app.canvas;
    const pts = new Map();
    let start = null, pinch = null;
    cv.style.touchAction = 'none';
    // fase de captura en window: corre antes que los manejadores de Pixi, que no dejan propagar
    const sig = this.sig;
    window.addEventListener('pointerdown', e => {
      if (e.target !== cv) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = { x: e.clientX, y: e.clientY };
      this.dragMoved = false;
    }, { capture: true, signal: sig.signal });
    window.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        if (!this.dragMoved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) this.dragMoved = true;
        if (this.dragMoved) this.panBy(dx, dy);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        pinch = d; this.dragMoved = true;
      }
    }, sig);
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    window.addEventListener('pointerup', up, sig);
    window.addEventListener('pointercancel', up, sig);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    cv.addEventListener('dblclick', () => this.resetView());
  }
  manual() {
    this.manualUntil = this.t + 90;
    this.camTarget = null;
    this.urgent = null;
    this.navChanged();
  }
  panBy(dx, dy) { if (!this.camBase) return; this.manual(); if (this.onTip) this.onTip(null); this.camBase.x += dx; this.camBase.y += dy; }
  zoomAt(sx, sy, f) {
    if (!this.camBase) return;
    this.manual();
    const cb = this.camBase, ns = clamp(cb.s * f, 0.18, 2.6);
    const wx = (sx - cb.x) / cb.s, wy = (sy - cb.y) / cb.s;
    this.camBase = { s: ns, x: sx - wx * ns, y: sy - wy * ns };
  }
  zoomBy(f) { this.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, f); }
  resetView() {
    this.manualUntil = 0; this.shot = null; this.shotT = 0;
    this.camTarget = this.overview;
    this.navChanged();
  }
  navState() {
    if (this.manualUntil > this.t) return { mode: 'manual', left: Math.ceil(this.manualUntil - this.t) };
    return { mode: this.directorOn ? 'director' : 'fixed' };
  }
  navChanged() { if (this.onNav) this.onNav(this.navState()); }

  // --- estado periodico
  update(state) {
    this.state = state;
    this.layout(state);
    for (const app of state.apps) { const b = this.buildings.get(app.id); if (b) b.update(app); }
    for (const x of state.sites || []) { const b = this.buildings.get(x.id); if (b) b.update(x); }
    for (const d of this.districts.values()) {
      const a = state.accounts.find(x => x.id === d.id);
      if (a && d.name.text !== a.label.toUpperCase()) d.name.text = a.label.toUpperCase();
    }
    this.hq.heat = clamp((state.system?.cpu || 0) / 100, 0, 1);
    this.hq.alarm = (state.keys || []).filter(k => k.state === 'failed').map(k => k.label);
    // bajo la torre: los servicios clave que realmente corren en este servidor
    const act = (state.keys || []).filter(k => k.state === 'active').map(k => k.label.toLowerCase());
    const tag = act.filter(l => !['ssh', 'cron'].includes(l)).slice(0, 4).join(' · ') || 'servidor';
    if (this.hqTag.text !== tag) this.hqTag.text = tag;
    this.syncRobots(state.sessions, state.accounts);
  }

  colorOf(account) {
    const a = this.state?.accounts.find(x => x.id === account);
    return a ? a.color : '#94a3b8';
  }

  stationPoint(account, station, slot) {
    const st = this.stations.get(account) || this.stations.get('root');
    const p = st.pts[station === 'waiting' ? 'desk' : station] || st.pts.desk;
    const ang = slot * 2.4;
    const r = slot ? 26 + slot * 4 : 0;
    return { x: p.x + Math.cos(ang) * r, y: p.y - 6 + Math.sin(ang) * r * 0.5 };
  }

  syncRobots(sessions, accounts) {
    const seen = new Set();
    const occupancy = new Map();
    const place = (key, account, agent, small, parentPos) => {
      seen.add(key);
      let r = this.robots.get(key);
      const color = small ? '#e2e8f0' : this.colorOf(account);
      if (!r) {
        r = new Robot(small ? this.colorOf(account) : color, small);
        const start = parentPos || this.stationPoint(account, 'portal', 0);
        r.x = start.x; r.y = start.y;
        r.beam = 1;
        this.beamFx(r.x, r.y, hex(this.colorOf(account)));
        this.scene.addChild(r);
        this.robots.set(key, r);
        r.small = small;
        this.tappable(r, new Rectangle(-26, -80, 52, 90), () => this.pick('session', key.split('/')[0]));
        this.hoverTip(r, () => this.robotTip(r));
      }
      r.state = agent.state;
      const occKey = account + '/' + agent.station;
      const slot = occupancy.get(occKey) || 0;
      occupancy.set(occKey, slot + 1);
      const p = this.stationPoint(account, agent.station, slot);
      if (!r.dest || Math.hypot(r.dest.x - p.x, r.dest.y - p.y) > 3) { r.dest = p; r.moveTo(p); }
      r.info = agent;
      return r;
    };
    for (const s of sessions) {
      const acc = this.stations.has(s.account) ? s.account : 'root';
      const r = place(s.id, acc, s, false);
      for (const sub of s.subagents || []) place(s.id + '/' + sub.id, acc, sub, true, { x: r.x, y: r.y });
    }
    for (const [k, r] of this.robots) {
      if (!seen.has(k)) { this.beamFx(r.x, r.y, 0xffffff); r.destroy({ children: true }); this.robots.delete(k); }
    }
  }

  robotFor(e) {
    const s = this.robots.get(e.agent ? e.sid + '/' + e.agent : e.sid);
    return s || this.robots.get(e.sid);
  }

  // --- eventos discretos
  onEvent(e, priv) {
    switch (e.kind) {
      case 'http': return this.packet(e);
      case 'attack': return this.invader(false);
      case 'block': return this.invader(true, priv ? e.ip : null);
      case 'login': return this.comet(priv ? `SSH ✓ ${e.user}` : 'SSH ✓');
      case 'mail': return this.mail(e.dir);
      case 'deploy': {
        const b = this.buildings.get(e.app);
        if (!b) return;
        const T = { building: ['DESPLEGANDO', 0xfbbf24], ready: ['DESPLEGADO ✓', 0x4ade80], error: ['FALLÓ EL DESPLIEGUE', 0xef4444], canceled: ['CANCELADO', 0x94a3b8] }[e.action];
        if (!T) return;
        b.pulse(); this.ring(b.x, b.y - b.h / 2, T[1]); this.floatText(b.x, b.y - b.h - 60, T[0], T[1]);
        if (e.action === 'ready') this.spark(b.x, b.y - b.h - 20, 0x4ade80);
        return;
      }
      case 'domain': {
        const d = this.districts.get(e.account);
        const p = d ? d.center : { x: 0, y: 0 };
        const txt = { added: 'NUEVO DOMINIO', removed: 'DOMINIO ELIMINADO', changed: 'SITIO CAMBIÓ' }[e.action];
        const col = e.action === 'removed' ? 0xf87171 : e.action === 'added' ? 0x4ade80 : 0xfbbf24;
        this.ring(p.x, p.y, col); this.floatText(p.x, p.y - 80, priv && e.domain ? `${txt}: ${e.domain}` : txt, col);
        return;
      }
      case 'pm2': {
        const b = this.buildings.get(e.app);
        if (b) { b.pulse(); this.ring(b.x, b.y - b.h / 2, e.action === 'down' ? 0xef4444 : 0xfbbf24); this.floatText(b.x, b.y - b.h - 50, e.action === 'down' ? 'CAÍDA' : 'REINICIO', e.action === 'down' ? 0xef4444 : 0xfbbf24); }
        return;
      }
      case 'claude': {
        const r = this.robotFor(e);
        if (!r) return;
        if (e.action === 'permission') {
          const q = { permission: '¿Me da permiso?', question: 'Tengo una pregunta', idle: 'Lo espero…' }[e.waitKind] || '¿Me da permiso?';
          r.say(priv && e.tool && e.waitKind === 'permission' ? `${q} ${e.tool}` : q, 12, 0xfbbf24);
          this.focus(this.stations.has(e.account) ? e.account : 'root', 12);
          this.ring(r.x, r.y - 20, 0xfbbf24);
        }
        else if (e.action === 'approved') { r.say('¡Gracias! Manos a la obra', 3); this.spark(r.x, r.y - 30, 0x22c55e); }
        else if (e.action === 'tool') r.say(priv && e.detail ? e.detail : e.activity, 5);
        else if (e.action === 'prompt') r.say(priv && e.text ? e.text : 'Nueva instrucción', 6);
        else if (e.action === 'error') this.spark(r.x, r.y - 30, 0xef4444);
        else if (e.action === 'done') { r.say('✓ Listo', 4); this.spark(r.x, r.y - 30, 0x22c55e); }
        return;
      }
    }
  }

  addFx(obj, tick) { this.fxLayer.addChild(obj); this.fx.push({ obj, tick, age: 0 }); }

  packet(e) {
    if (this.fx.length > 260) return;
    const d = this.districts.get(e.account);
    const b = e.app ? this.buildings.get(e.app) : e.site ? this.buildings.get(e.site) : null;
    const color = e.status >= 500 ? 0xef4444 : e.status >= 400 ? 0xf59e0b : e.bot ? 0x64748b : 0x67e8f9;
    const pts = [{ ...this.gate }, { x: 0, y: -this.hq.h + 10 }, { x: 0, y: 30 }];
    if (d) pts.push({ ...d.center });
    if (b) pts.push({ x: b.x, y: b.y - b.h - TH / 2 });
    const g = new Graphics().circle(0, 0, e.bot ? 2 : 3).fill(color).circle(0, 0, 7).fill({ color, alpha: 0.2 });
    g.x = pts[0].x; g.y = pts[0].y;
    let seg = 0; const speed = 520 + Math.random() * 200;
    this.addFx(g, (f, dt) => {
      const a = pts[seg + 1];
      if (!a) {
        if (b) b.flash = Math.max(b.flash, e.status >= 500 ? 1 : 0.25);
        if (e.status >= 500) this.spark(g.x, g.y, 0xef4444);
        return false;
      }
      const dx = a.x - g.x, dy = a.y - g.y, dd = Math.hypot(dx, dy);
      const st = speed * dt;
      if (dd <= st) { g.x = a.x; g.y = a.y; seg++; } else { g.x += dx / dd * st; g.y += dy / dd * st; }
      return true;
    });
  }

  invader(blocked, ip) {
    const tex = monoTextures(INVADER, blocked ? '#fb7185' : '#f87171');
    const s = new Sprite(tex[0]); s.anchor.set(0.5); s.scale.set(2.2);
    const ang = Math.random() * Math.PI * 2;
    const R = 900;
    s.x = Math.cos(ang) * R; s.y = Math.sin(ang) * R * 0.6 - 60;
    const hq = this.hq;
    const hit = { x: Math.cos(ang) * hq.rx, y: Math.sin(ang) * hq.ry - 60 };
    this.addFx(s, (f, dt) => {
      s.texture = tex[Math.floor(f.age * 4) % 2];
      const dx = hit.x - s.x, dy = hit.y - s.y, dd = Math.hypot(dx, dy);
      const st = 260 * dt;
      if (dd <= st) {
        this.explode(hit.x, hit.y, blocked ? 0xfb7185 : 0xf87171);
        hq.flash = 1;
        if (blocked) this.floatText(hit.x, hit.y - 30, ip ? 'BLOQUEADA ' + ip : 'IP BLOQUEADA', 0xfb7185);
        return false;
      }
      s.x += dx / dd * st; s.y += dy / dd * st;
      return true;
    });
  }

  comet(text) {
    const g = new Graphics().circle(0, 0, 4).fill(0x4ade80).circle(0, 0, 10).fill({ color: 0x4ade80, alpha: 0.25 });
    g.x = -900; g.y = -500;
    this.addFx(g, (f, dt) => {
      const dx = 0 - g.x, dy = -this.hq.h - g.y, dd = Math.hypot(dx, dy);
      if (dd < 12) { this.ring(0, -this.hq.h / 2, 0x4ade80); this.floatText(0, -this.hq.h - 60, text, 0x4ade80); return false; }
      g.x += dx / dd * 700 * dt; g.y += dy / dd * 700 * dt;
      return true;
    });
  }

  mail(dir) {
    const color = dir === 'bounce' ? '#f87171' : dir === 'in' ? '#a78bfa' : '#fbbf24';
    const s = new Sprite(monoTextures([ENVELOPE], color)[0]); s.anchor.set(0.5); s.scale.set(2);
    const hqP = { x: 20, y: -80 };
    const far = { x: (Math.random() > 0.5 ? 1 : -1) * 800, y: -600 };
    const [from, to] = dir === 'in' ? [far, hqP] : [hqP, far];
    s.x = from.x; s.y = from.y;
    this.addFx(s, (f, dt) => {
      const t = f.age / 2.2;
      if (t >= 1) return false;
      s.x = lerp(from.x, to.x, t); s.y = lerp(from.y, to.y, t) - Math.sin(t * Math.PI) * 60;
      s.alpha = t < 0.1 ? t * 10 : t > 0.85 ? (1 - t) / 0.15 : 1;
      return true;
    });
  }

  spark(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const g = new Graphics().rect(-1.5, -1.5, 3, 3).fill(color);
      g.x = x; g.y = y;
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 90;
      const vx = Math.cos(a) * v, vy = Math.sin(a) * v - 60;
      this.addFx(g, (f, dt) => { g.x += vx * dt; g.y += (vy + f.age * 220) * dt; g.alpha = 1 - f.age / 0.8; return f.age < 0.8; });
    }
  }
  explode(x, y, color) { this.spark(x, y, color); this.ring(x, y, color); }

  ring(x, y, color) {
    const g = new Graphics(); g.x = x; g.y = y;
    this.addFx(g, f => {
      const t = f.age / 0.7;
      g.clear().ellipse(0, 0, 10 + t * 60, (10 + t * 60) * 0.5).stroke({ width: 3, color, alpha: 1 - t });
      return t < 1;
    });
  }

  beamFx(x, y, color) {
    const g = new Graphics(); g.x = x; g.y = y;
    this.addFx(g, f => {
      const t = f.age / 1.1;
      g.clear().rect(-10 * (1 - t), -220, 20 * (1 - t), 220).fill({ color, alpha: 0.35 * (1 - t) }).ellipse(0, 0, 18, 7).fill({ color, alpha: 0.5 * (1 - t) });
      return t < 1;
    });
  }

  floatText(x, y, text, color) {
    const t = label(text, 18, color); t.x = x; t.y = y;
    this.addFx(t, (f, dt) => { t.y -= 18 * dt; t.alpha = 1 - Math.max(0, f.age - 1.6) / 0.8; return f.age < 2.4; });
  }

  drawSelection(t) {
    const g = this.selG; g.clear();
    const sel = this.selected;
    if (!sel) return;
    let x, y, rx;
    if (sel.kind === 'app' || sel.kind === 'site') { const b = this.buildings.get(sel.id); if (!b) return; x = b.x; y = b.y; rx = TW * 1.35 * b.fp; }
    else if (sel.kind === 'session') { const r = this.robotById(sel.id); if (!r) return; x = r.x; y = r.y; rx = 36; }
    else if (sel.kind === 'system') { x = 0; y = 0; rx = TW * 2.6; }
    else return;
    const a = 0.5 + 0.5 * Math.sin(t * 4);
    g.ellipse(x, y, rx + a * 6, (rx + a * 6) * 0.5).stroke({ width: 3, color: 0x22d3ee, alpha: 0.5 + 0.4 * a })
      .ellipse(x, y, rx * 0.8, rx * 0.4).fill({ color: 0x22d3ee, alpha: 0.08 });
  }

  tick(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const t = this.t;
    // estrellas
    const sg = this.stars; sg.clear();
    for (const s of this.starList || []) sg.rect(s.x, s.y, s.r, s.r).fill({ color: 0x9fb4d9, alpha: 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.9 + s.p)) });
    // camara: se desliza hacia el objetivo del director, con respiracion lenta
    this.directorTick(dt);
    if (this.camBase && this.camTarget) {
      const f = 1 - Math.pow(0.18, dt);
      const cb = this.camBase, ct = this.camTarget;
      // interpolar en espacio de mundo para que el paneo no haga arcos raros
      const cx = (this.app.screen.width / 2 - cb.x) / cb.s, cy = (this.app.screen.height / 2 - cb.y) / cb.s;
      const tx = (this.app.screen.width / 2 - ct.x) / ct.s, ty = (this.app.screen.height / 2 - ct.y) / ct.s;
      const ns = Math.exp(lerp(Math.log(cb.s), Math.log(ct.s), f));
      const nx = lerp(cx, tx, f), ny = lerp(cy, ty, f);
      this.camBase = { s: ns, x: this.app.screen.width / 2 - nx * ns, y: this.app.screen.height / 2 - ny * ns };
    }
    if (this.camBase) {
      const k = 1 + Math.sin(t * 0.12) * 0.012;
      this.cam.scale.set(this.camBase.s * k);
      this.cam.x = this.camBase.x + Math.sin(t * 0.07) * 8;
      this.cam.y = this.camBase.y + Math.cos(t * 0.09) * 5;
      const full = this.cam.scale.x >= 0.72;
      for (const b of this.buildings.values()) b.setDetail(full, this.cam.scale.x);
    }
    // torre: radar, escudo, calor
    const hq = this.hq;
    hq.radar.clear().moveTo(0, 0).lineTo(Math.cos(t * 1.6) * 22, Math.sin(t * 1.6) * 8).stroke({ width: 3, color: 0x22d3ee })
      .circle(0, 0, 3).fill(0xfbbf24);
    hq.flash = Math.max(0, hq.flash - dt * 1.8);
    if (hq.alarm && hq.alarm.length) {
      hq.flash = Math.max(hq.flash, 0.5 + 0.5 * Math.sin(t * 6));
      if (!this.alarmText) { this.alarmText = label('', 18, 0xf87171); this.alarmText.y = -hq.h - 110; this.labels.addChild(this.alarmText); }
      this.alarmText.text = 'ALERTA: ' + hq.alarm.join(', ') + (hq.alarm.length > 1 ? ' CAÍDOS' : ' CAÍDO');
      this.alarmText.alpha = 0.6 + 0.4 * Math.sin(t * 6);
    } else if (this.alarmText) { this.alarmText.destroy(); this.alarmText = null; }
    const sa = 0.12 + 0.06 * Math.sin(t * 1.3) + hq.flash * 0.6;
    hq.shield.clear().ellipse(0, -60, hq.rx, hq.ry).stroke({ width: 2 + hq.flash * 3, color: hq.flash > 0.1 ? 0xfb7185 : 0x22d3ee, alpha: sa })
      .ellipse(0, -60, hq.rx, hq.ry).fill({ color: 0x22d3ee, alpha: 0.02 + hq.flash * 0.05 });
    this.gateG.rotation = t * 0.5;
    for (const b of this.buildings.values()) b.tick(dt, t);
    for (const r of this.robots.values()) r.tick(dt, t);
    this.drawSelection(t);
    this.navT = (this.navT || 0) + dt;
    if (this.navT > 1) { this.navT = 0; this.navChanged(); }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.age += dt;
      if (!f.tick(f, dt)) { f.obj.destroy(); this.fx.splice(i, 1); }
    }
  }
}
