// Comunicacion entre agentes, dibujada encima de cualquier tema: el encargo que va del agente al subagente,
// el resultado que vuelve, los mensajes (SendMessage) y el haz del agente al proyecto que lee o edita.
// Cada tema dice donde esta cada cosa con world.screenOf(kind, id) -> { x, y } en pixeles de la ventana;
// si no lo sabe, se usan las tarjetas del panel de agentes. Sobres y chispas en pixel art, textos nitidos.
import { ENVELOPE, paintCanvas } from './pixeldata.js';

const COLORS = { task: '#22d3ee', result: '#4ade80', message: '#c084fc', edit: '#fbbf24', read: '#38bdf8' };
const LABEL = { task: 'encargo', result: 'resultado', message: 'mensaje' };
const MAX = 14;

export class CommFx {
  constructor(getWorld) {
    this.getWorld = getWorld;
    this.cv = Object.assign(document.createElement('canvas'), { className: 'commfx' });
    this.cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.cv);
    this.cx = this.cv.getContext('2d');
    this.fx = [];
    this.env = {};
    for (const [k, c] of Object.entries(COLORS)) this.env[k] = paintCanvas(ENVELOPE, { x: c }, 1);
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize = () => { const d = Math.min(2, devicePixelRatio || 1); this.dpr = d; this.cv.width = innerWidth * d; this.cv.height = innerHeight * d; };
    this.resize(); addEventListener('resize', this.resize);
    this.raf = 0;
  }

  // posicion en pantalla: primero el mundo del tema, despues el panel de agentes
  pos(kind, id, sid) {
    const w = this.getWorld();
    let p = null;
    try { p = w && w.screenOf ? w.screenOf(kind, id) : null; } catch { p = null; }
    if (p && p.x >= 0 && p.y >= 0 && p.x <= innerWidth && p.y <= innerHeight) return { ...p, world: true };
    let el = null;
    if (kind === 'session') el = document.querySelector(`#agents [data-go="session:${CSS.escape(id)}"]`);
    if (kind === 'agent') el = document.querySelector(`#agents [data-go="session:${CSS.escape(sid)}"] [data-agent="${CSS.escape(id)}"]`)
      || document.querySelector(`#agents [data-go="session:${CSS.escape(sid)}"]`);
    if (!el || !el.offsetParent) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * 0.85, y: r.top + r.height / 2, card: true };
  }

  onEvent(e) {
    if (e.kind === 'probe') return this.probe(e);
    // consulta lenta: un solo pulso ambar sobre el edificio que usa la base (si no se sabe cual, solo el ticker)
    if (e.kind === 'db' && e.action === 'slow') {
      const at = e.app ? this.pos('app', e.app) : e.site ? this.pos('site', e.site) : null;
      if (at && at.world && this.fx.length < MAX) { this.fx.push({ type: 'dbslow', at, secs: e.secs, t: 0, dur: this.still ? 0.8 : 2.2 }); this.run(); }
      return;
    }
    if (e.kind !== 'claude' || this.fx.length >= MAX) return;
    const me = e.agent ? this.pos('agent', e.sid + '/' + e.agent, e.sid) : this.pos('session', e.sid);
    if (e.action === 'spawn') {
      // el subagente aparece en el mundo un instante despues: se espera su lugar
      const from = this.pos('session', e.sid);
      if (from) this.later(() => this.pos('agent', e.sid + '/' + e.agent, e.sid), to => this.packet(from, to || nudge(from), 'task'));
    } else if (e.action === 'despawn') {
      const from = this.pos('agent', e.sid + '/' + e.agent, e.sid) || nudge(this.pos('session', e.sid));
      const to = this.pos('session', e.sid);
      if (from && to) this.packet(from, to, 'result');
    } else if (e.action === 'message') {
      const to = e.to == null ? null : e.to === '' ? this.pos('session', e.sid) : this.pos('agent', e.sid + '/' + e.to, e.sid);
      if (me) this.packet(me, to || nudge(me, -1), 'message');
    } else if (e.action === 'start') {
      // sesion nueva: el bot aparece un instante despues; baja un haz donde se pare
      this.later(() => this.pos('session', e.sid), to => { if (to) this.warp(to, 'in'); }, 12);
    } else if (e.action === 'end') {
      // sesion cerrada: el bot sigue en su lugar hasta el proximo estado; sube un haz y se va
      if (me) this.warp(me, 'out', e.reason);
    } else if (e.action === 'touch') {
      const to = e.app ? this.pos('app', e.app) : e.site ? this.pos('site', e.site) : null;
      if (me && to && to.world) this.beam(me, to, e.mode === 'edit' ? 'edit' : 'read');
    }
  }

  // un robot que busca una ruta vulnerable: auto oscuro con luz roja que va al edificio y rebota; si la
  // ruta respondio (archivo expuesto), el edificio queda marcado en rojo con el cartel EXPUESTO
  probe(e) {
    if (this.fx.filter(f => f.type === 'probe').length >= 4 && !e.exposed) return;
    const to = e.app ? this.pos('app', e.app) : e.site ? this.pos('site', e.site) : null;
    if (!to || !to.world) return;
    const w = this.getWorld();
    let from = null;
    try { from = w && w.screenOf ? w.screenOf('gate') : null; } catch { from = null; }
    if (!from) from = { x: Math.max(20, Math.min(innerWidth - 20, to.x + (Math.random() - 0.5) * 400)), y: 70 };
    this.fx.push({ type: 'probe', from, to, t: 0, dur: this.still ? 0.5 : 1.1 + Math.random() * 0.4, exposed: !!e.exposed, status: e.status });
    this.run();
  }

  drawProbe(f) {
    const { cx } = this;
    const go = Math.min(1, f.t / f.dur);
    let u, fade = 1;
    if (f.exposed) u = go;
    else {
      // ida hasta la puerta y vuelta corta: rebota
      const back = f.t > f.dur ? Math.min(1, (f.t - f.dur) / 0.35) : 0;
      u = go - back * 0.35; fade = 1 - back;
    }
    const x = f.from.x + (f.to.x - f.from.x) * u, y = f.from.y + (f.to.y - f.from.y) * u;
    cx.globalAlpha = fade;
    // auto pixel (escala 2): carroceria oscura con borde, parabrisas y sirena roja intermitente
    const X = Math.round(x), Y = Math.round(y);
    cx.fillStyle = '#475569'; cx.fillRect(X - 11, Y - 7, 22, 14);
    cx.fillStyle = '#1e1b2e'; cx.fillRect(X - 9, Y - 5, 18, 10);
    cx.fillStyle = '#0b0a12'; cx.fillRect(X - 6, Y - 3, 12, 4);
    cx.fillStyle = Math.floor(f.t * 8) % 2 ? '#ef4444' : '#7f1d1d'; cx.fillRect(X - 3, Y - 11, 6, 4);
    if (!f.exposed && f.t > f.dur && f.status) {
      cx.font = "600 11px 'Space Grotesk', system-ui, sans-serif"; cx.textAlign = 'center'; cx.fillStyle = '#94a3b8';
      cx.fillText(String(f.status), f.to.x, f.to.y - 14 - (f.t - f.dur) * 20);
    }
    cx.globalAlpha = 1;
    if (f.exposed && go >= 1) {
      const k = (f.t - f.dur) % 0.8 / 0.8, r = 10 + k * 26;
      cx.globalAlpha = 1 - k; cx.strokeStyle = '#ef4444'; cx.lineWidth = 3;
      cx.strokeRect(Math.round(f.to.x - r), Math.round(f.to.y - r), Math.round(r * 2), Math.round(r * 2));
      cx.globalAlpha = 1;
      cx.font = "700 12px 'Space Grotesk', system-ui, sans-serif"; cx.textAlign = 'center';
      const tw = cx.measureText('EXPUESTO').width + 12;
      cx.fillStyle = '#ef4444'; cx.fillRect(Math.round(f.to.x - tw / 2), Math.round(f.to.y - 42), Math.round(tw), 18);
      cx.fillStyle = '#fff'; cx.fillText('EXPUESTO', f.to.x, f.to.y - 29);
    }
  }

  later(find, then, tries = 8) {
    const p = find();
    if (p || tries <= 0) return then(p);
    setTimeout(() => this.later(find, then, tries - 1), 120);
  }

  packet(from, to, kind) {
    // mismo lugar (un tema sin subagentes dibujados): el sobre sale hacia un costado
    if (Math.hypot(to.x - from.x, to.y - from.y) < 14) to = nudge(from, kind === 'result' ? -1 : 1);
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    this.fx.push({ type: 'packet', kind, from, to, t: 0, dur: this.still ? 0.6 : Math.min(1.8, 0.7 + d / 700), lift: Math.min(140, 30 + d * 0.35) });
    this.run();
  }
  beam(from, to, kind) {
    this.fx.push({ type: 'beam', kind, from, to, t: 0, dur: this.still ? 0.6 : 1.3 });
    this.run();
  }
  warp(at, dir, reason) {
    const label = dir === 'in' ? 'nueva sesión' : reason === 'timeout' ? 'sin actividad' : 'sesión cerrada';
    this.fx.push({ type: 'warp', dir, at, label, t: 0, dur: this.still ? 0.6 : 1.6, seed: Math.random() * 1000 });
    this.run();
  }
  run() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.frame(t)); } }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { cx, dpr } = this;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, this.cv.width, this.cv.height);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.imageSmoothingEnabled = false;
    for (const f of this.fx) { f.t += dt; (f.type === 'packet' ? this.drawPacket : f.type === 'probe' ? this.drawProbe : f.type === 'warp' ? this.drawWarp : f.type === 'dbslow' ? this.drawDbSlow : this.drawBeam).call(this, f); }
    // un archivo expuesto queda marcado 6 s; lo demas se va al terminar
    this.fx = this.fx.filter(f => f.t < f.dur + (f.type === 'probe' && f.exposed ? 6 : 0.35));
    this.raf = this.fx.length ? requestAnimationFrame(t => this.frame(t)) : 0;
    if (!this.raf) cx.clearRect(0, 0, innerWidth, innerHeight);
  }

  // sobre en arco con estela de pixeles; al llegar, un destello cuadrado
  drawPacket(f) {
    const { cx } = this, c = COLORS[f.kind];
    const k = Math.min(1, f.t / f.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const at = u => { const mx = (f.from.x + f.to.x) / 2, my = Math.min(f.from.y, f.to.y) - f.lift;
      return { x: (1 - u) ** 2 * f.from.x + 2 * (1 - u) * u * mx + u * u * f.to.x, y: (1 - u) ** 2 * f.from.y + 2 * (1 - u) * u * my + u * u * f.to.y }; };
    cx.fillStyle = c;
    for (let i = 1; i <= 7; i++) { const u = e - i * 0.035; if (u <= 0) break; const p = at(u); cx.globalAlpha = 0.5 * (1 - i / 8); cx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4); }
    cx.globalAlpha = 1;
    if (k < 1) {
      const p = at(e), s = 3, img = this.env[f.kind];
      cx.drawImage(img, Math.round(p.x - img.width * s / 2), Math.round(p.y - img.height * s / 2), img.width * s, img.height * s);
      if (LABEL[f.kind]) { cx.font = "600 11px 'Space Grotesk', system-ui, sans-serif"; cx.textAlign = 'center'; cx.fillStyle = c; cx.fillText(LABEL[f.kind], p.x, p.y - 16); }
    } else this.burst(f.to, c, (f.t - f.dur) / 0.35);
  }

  // haz punteado del agente al proyecto; el edificio recibe un pulso (ambar si edita, celeste si lee)
  drawBeam(f) {
    const { cx } = this, c = COLORS[f.kind];
    const k = Math.min(1, f.t / (f.dur * 0.45));
    const fade = f.t > f.dur ? 1 - (f.t - f.dur) / 0.35 : 1;
    const x = f.from.x + (f.to.x - f.from.x) * k, y = f.from.y + (f.to.y - f.from.y) * k;
    const n = Math.max(2, Math.floor(Math.hypot(x - f.from.x, y - f.from.y) / 9));
    cx.fillStyle = c;
    for (let i = 0; i < n; i++) { const u = i / n; cx.globalAlpha = fade * (0.25 + 0.65 * u); cx.fillRect(Math.round(f.from.x + (x - f.from.x) * u) - 1.5, Math.round(f.from.y + (y - f.from.y) * u) - 1.5, 3, 3); }
    cx.globalAlpha = 1;
    if (k >= 1) this.burst(f.to, c, ((f.t - f.dur * 0.45) / (f.dur * 0.55 + 0.35)) % 1, fade);
  }

  // haz de sesion: columna de luz pixelada. Salida: crece, los pixeles del bot suben y se apaga hacia arriba.
  // Entrada: baja desde arriba y se abre en el piso. El cartel dice que paso, sin nombres (sirve en publico).
  drawWarp(f) {
    const { cx } = this, out = f.dir === 'out', c = out ? '#a5b4fc' : '#4ade80';
    const k = Math.min(1, f.t / f.dur), fade = f.t > f.dur ? Math.max(0, 1 - (f.t - f.dur) / 0.35) : 1;
    const x = Math.round(f.at.x), foot = Math.round(f.at.y + 16), top = foot - 120;
    // la columna: aparece rapido, se sostiene y se angosta hasta una linea
    const grow = Math.min(1, k / 0.18), shrink = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    const w = Math.max(2, Math.round(26 * grow * shrink)), h = foot - top;
    const y0 = out ? foot - Math.round(h * grow) : top, y1 = out ? foot : top + Math.round(h * grow);
    for (let y = y0; y < y1; y += 4) {
      const u = (y - top) / h;
      cx.globalAlpha = fade * (out ? 0.15 + 0.45 * u : 0.6 - 0.45 * u) * (0.75 + 0.25 * Math.sin(f.seed + y * 0.3 + f.t * 18));
      cx.fillStyle = c; cx.fillRect(x - w / 2, y, w, 3);
    }
    cx.globalAlpha = fade * 0.9; cx.fillStyle = '#fff'; cx.fillRect(x - 1, y0, 2, y1 - y0);
    // pixeles que suben (salida) o caen (entrada)
    for (let i = 0; i < 14; i++) {
      const r = (Math.sin(f.seed + i * 12.9898) * 43758.5453) % 1, ph = ((k * 1.4 + Math.abs(r)) % 1);
      const py = out ? foot - ph * (h + 20) : top + ph * (h + 10), px = x + (Math.abs(r) - 0.5) * 30;
      cx.globalAlpha = fade * (1 - ph) * 0.9; cx.fillStyle = i % 3 ? c : '#fff';
      cx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 4, 4);
    }
    // piso: anillo pixelado
    const ring = out ? 1 - k : k;
    cx.globalAlpha = fade * 0.7; cx.fillStyle = c;
    for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; cx.fillRect(Math.round(x + Math.cos(t) * (10 + 12 * ring)) - 1.5, Math.round(foot + Math.sin(t) * (3 + 3 * ring)) - 1.5, 3, 3); }
    // cartel
    cx.globalAlpha = fade * Math.min(1, f.t / 0.2);
    cx.font = "600 11px 'Space Grotesk', system-ui, sans-serif"; cx.textAlign = 'center';
    const tw = cx.measureText(f.label).width + 12, ly = top - 6;
    cx.fillStyle = 'rgba(5, 9, 18, .85)'; cx.fillRect(Math.round(x - tw / 2), ly - 13, Math.round(tw), 18);
    cx.fillStyle = c; cx.fillRect(Math.round(x - tw / 2), ly + 4, Math.round(tw), 2);
    cx.fillText(f.label, x, ly);
    cx.globalAlpha = 1;
  }

  // consulta lenta: un cilindro de base pixelado sobre el edificio, con reloj de arena y dos ondas ambar
  drawDbSlow(f) {
    const { cx } = this, c = '#fbbf24', k = Math.min(1, f.t / f.dur);
    const fade = f.t > f.dur ? Math.max(0, 1 - (f.t - f.dur) / 0.35) : Math.min(1, f.t / 0.2);
    const x = Math.round(f.at.x), y = Math.round(f.at.y - 34 - 6 * Math.sin(Math.min(1, k * 2) * Math.PI / 2));
    for (let i = 0; i < 2; i++) { const u = (k * 1.6 + i * 0.5) % 1; this.burst({ x: f.at.x, y: f.at.y }, c, u, fade * 0.8); }
    cx.globalAlpha = fade;
    // cilindro 14x16 en pixeles de 2
    cx.fillStyle = '#78350f'; cx.fillRect(x - 8, y - 8, 16, 18);
    cx.fillStyle = c; cx.fillRect(x - 7, y - 8, 14, 3); cx.fillRect(x - 7, y - 1, 14, 2); cx.fillRect(x - 7, y + 6, 14, 2);
    cx.fillStyle = '#fde68a'; cx.fillRect(x - 5, y - 8, 4, 1);
    // reloj de arena al costado
    cx.fillStyle = '#e2e8f0'; cx.fillRect(x + 10, y - 7, 8, 2); cx.fillRect(x + 10, y + 6, 8, 2);
    cx.fillStyle = c; cx.fillRect(x + 11, y - 5, 6, 3); cx.fillRect(x + 13, y - 2, 2, 3); cx.fillRect(x + 11, y + 1 + Math.round(2 * (1 - k)), 6, 5 - Math.round(2 * (1 - k)));
    cx.font = "600 11px 'Space Grotesk', system-ui, sans-serif"; cx.textAlign = 'center';
    const label = `consulta lenta · ${f.secs} s`, tw = cx.measureText(label).width + 12;
    cx.fillStyle = 'rgba(5, 9, 18, .85)'; cx.fillRect(Math.round(x - tw / 2), y - 30, Math.round(tw), 17);
    cx.fillStyle = c; cx.fillText(label, x, y - 18);
    cx.globalAlpha = 1;
  }

  burst(p, c, u, fade = 1) {
    const { cx } = this, r = 6 + u * 22;
    cx.globalAlpha = Math.max(0, (1 - u) * fade);
    cx.strokeStyle = c; cx.lineWidth = 3;
    cx.strokeRect(Math.round(p.x - r), Math.round(p.y - r), Math.round(r * 2), Math.round(r * 2));
    cx.globalAlpha = 1;
  }

  destroy() { cancelAnimationFrame(this.raf); removeEventListener('resize', this.resize); this.cv.remove(); }
}

// sin lugar propio (un tema que no dibuja subagentes): un poco al lado del agente
function nudge(p, dir = 1) { return p ? { x: p.x + 56 * dir, y: p.y - 34 } : null; }

// posicion en pantalla de un objeto de PixiJS (sprite, contenedor o un objeto con .spr/.c/.cont/.root)
export function pixiScreen(app, o) {
  const d = o && [o, o.spr, o.sp, o.sprite, o.worker, o.s, o.C, o.c, o.cont, o.root, o.body].find(x => x && typeof x.getBounds === 'function');
  if (!app || !d || d.destroyed || typeof d.getBounds !== 'function' || !d.visible) return null;
  const b = d.getBounds();
  if (!b || !(b.width > 0)) return null;
  const r = app.canvas.getBoundingClientRect();
  return { x: r.left + b.x + b.width / 2, y: r.top + b.y + b.height * 0.4 };
}
