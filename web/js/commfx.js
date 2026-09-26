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
    } else if (e.action === 'touch') {
      const to = e.app ? this.pos('app', e.app) : e.site ? this.pos('site', e.site) : null;
      if (me && to && to.world) this.beam(me, to, e.mode === 'edit' ? 'edit' : 'read');
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
  run() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.frame(t)); } }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { cx, dpr } = this;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, this.cv.width, this.cv.height);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.imageSmoothingEnabled = false;
    for (const f of this.fx) { f.t += dt; (f.type === 'packet' ? this.drawPacket : this.drawBeam).call(this, f); }
    this.fx = this.fx.filter(f => f.t < f.dur + 0.35);
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
