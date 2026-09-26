// Panel de detalle: se abre al tocar un servicio, agente, distrito, la torre o un evento.
// Los datos vienen de /api/detail y ya llegan filtrados por el modo publico/privado.
import { animate } from '../vendor/anime.esm.min.js';
import { withFavicons } from './favicons.js';
import { px } from './pixicons.js';
import uPlot from '../vendor/uPlot.esm.js';
import { signCanvas, robotCanvas, iconCanvas } from './sprites.js';
import { esc, fmtBytes, fmtNum, ago } from './hud.js';

const STATE_LABEL = { working: 'Trabajando', thinking: 'Pensando', waiting: 'Lo espera', idle: 'En pausa' };
const STATUS_LABEL = { online: 'En línea', degraded: 'Parcial', down: 'Caído' };
const WAIT_LABEL = { permission: 'Espera su permiso', question: 'Le hizo una pregunta', idle: 'Espera su respuesta' };
const hhmm = t => new Date(t).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const dur = s => { s = Math.round(s || 0); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : m ? `${m} min` : `${s} s`; };
// pais: etiqueta pixel con el codigo ISO (VE, US...), sin emojis
export const flag = cc => `<span class="cc">${cc && /^[A-Z]{2}$/.test(cc) ? cc : '??'}</span>`;
const regionName = (() => { try { const dn = new Intl.DisplayNames(['es'], { type: 'region' }); return cc => { try { return dn.of(cc); } catch { return cc; } }; } catch { return cc => cc; } })();
const countryName = cc => cc && cc !== '??' ? regionName(cc) : 'Desconocido';
// barras horizontales para rankings (paises, paginas, navegadores...)
function bars(list, fmtKey, total) {
  if (!list || !list.length) return '<li class="dmuted">Sin datos en la última hora.</li>';
  const max = Math.max(...list.map(x => x.n));
  return list.map(x => `<li class="bar"><span class="grow">${fmtKey(x.key)}</span><span class="bw"><i style="width:${Math.round(x.n / max * 100)}%"></i></span>
    <span class="mono">${x.n}${total ? ` <span class="dmuted">${Math.round(x.n / total * 100)}%</span>` : ''}</span></li>`).join('');
}
const TYPE_LABEL = { wordpress: 'WordPress', php: 'PHP', static: 'Estático', proxy: 'Proxy', wip: 'En construcción' };
const stat = (k, v, cls = '') => `<div class="dstat ${cls}"><span>${k}</span><b>${v}</b></div>`;
const statusCls = st => st === 'online' ? 'ok' : st === 'degraded' ? 'warn' : 'bad';
const httpCls = c => c >= 500 ? 'bad' : c >= 400 ? 'warn' : 'ok';

export class Drawer {
  constructor(el, { onNavigate, onClose }) {
    this.el = el;
    this.onNavigate = onNavigate;
    this.onClose = onClose;
    this.head = el.querySelector('.dhead');
    this.body = el.querySelector('.dbody');
    el.querySelector('.dclose').addEventListener('click', () => this.close());
    // enlaces internos: data-go="kind:id"
    el.addEventListener('click', async e => {
      const dir = e.target.closest('[data-dir]');
      if (dir) { this.params = { ...(this.params || {}), path: dir.dataset.dir }; this.load(); this.body.scrollTo({ top: this.body.querySelector('.crumbs')?.offsetTop - 80 || 0, behavior: 'smooth' }); return; }
      if (e.target.closest('[data-analyze]')) {
        const b = e.target.closest('[data-analyze]'); b.disabled = true;
        const r = await fetch('api/disk/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atalaya': '1' }, body: '{}' }).then(x => x.json()).catch(() => ({}));
        if (r.error) { b.insertAdjacentHTML('afterend', `<span class="dmuted"> ${esc(r.error)}</span>`); b.disabled = false; } else this.load();
        return;
      }
      const ag = e.target.closest('[data-agent-du]');
      if (ag) {
        ag.disabled = true;
        const r = await fetch('api/agents/request', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atalaya': '1' }, body: JSON.stringify({ id: ag.dataset.agentDu, what: 'du' }) }).then(x => x.json()).catch(() => ({}));
        if (r.error) { ag.insertAdjacentHTML('afterend', `<span class="dmuted"> ${esc(r.error)}</span>`); ag.disabled = false; } else this.load();
        return;
      }
      const pa = e.target.closest('[data-proj]');
      if (pa) {
        const act = pa.dataset.proj, body = { id: pa.dataset.id };
        if (act === 'merge') { body.into = this.body.querySelector('#projInto')?.value; if (!body.into) return; }
        if (act === 'rename') { const n = prompt('Nuevo nombre del proyecto', pa.dataset.name || ''); if (n == null) return; body.name = n; }
        if (act === 'hide' && !confirm('¿Ocultar este proyecto del mapa? (se puede volver a mostrar editando settings.json)')) return;
        pa.disabled = true;
        const r = await fetch('api/projects/' + act, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atalaya': '1' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => ({}));
        if (r.error) { pa.insertAdjacentHTML('afterend', `<span class="dmuted"> ${esc(r.error)}</span>`); pa.disabled = false; return; }
        if (act === 'hide' || act === 'merge') { this.onNavigate('projects', 'all'); return; }
        this.load();
        return;
      }
      const up = e.target.closest('[data-audit-updates]');
      if (up) {
        up.disabled = true;
        const r = await fetch('api/audit/updates', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atalaya': '1' }, body: '{}' }).then(x => x.json()).catch(() => ({}));
        if (r.error) { up.insertAdjacentHTML('afterend', `<span class="dmuted"> ${esc(r.error)}</span>`); up.disabled = false; } else { up.textContent = 'Revisando…'; setTimeout(() => this.load(), 12000); }
        return;
      }
      const au = e.target.closest('[data-audit-db]');
      if (au) {
        au.disabled = true;
        const r = await fetch('api/audit/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atalaya': '1' }, body: JSON.stringify({ name: au.dataset.auditDb }) }).then(x => x.json()).catch(() => ({}));
        if (r.error) { au.insertAdjacentHTML('afterend', `<span class="dmuted"> ${esc(r.error)}</span>`); au.disabled = false; } else this.load();
        return;
      }
      const a = e.target.closest('[data-go]');
      if (!a) return;
      const [kind, ...rest] = a.dataset.go.split(':');
      this.onNavigate(kind, rest.join(':'));
    });
  }

  get isOpen() { return !this.el.hidden; }

  open(kind, id) {
    const same = this.isOpen && this.kind === kind && this.id === id;
    this.kind = kind; this.id = id;
    if (!same) { this.charts = null; this.headKey = null; this.params = {}; this.body.innerHTML = '<p class="dmuted">Cargando…</p>'; this.head.innerHTML = ''; }
    if (!this.isOpen) {
      this.el.hidden = false;
      animate(this.el, { opacity: [0, 1], translateX: [40, 0], duration: 350, ease: 'outExpo' });
    }
    clearInterval(this.timer);
    this.load();
    this.timer = setInterval(() => this.load(), 2500);
  }

  close() {
    if (!this.isOpen) return;
    clearInterval(this.timer);
    animate(this.el, { opacity: 0, translateX: 40, duration: 250, ease: 'inQuad', onComplete: () => { this.el.hidden = true; } });
    this.kind = this.id = null;
    if (this.onClose) this.onClose();
  }

  async load() {
    const kind = this.kind, id = this.id;
    if (kind === 'events') { if (this.eventsProvider) this.renderEvents(this.eventsProvider()); return; }
    let d;
    try {
      const extra = this.params && this.params.path ? `&path=${encodeURIComponent(this.params.path)}` : '';
      const r = await fetch(`api/detail?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}${extra}`);
      if (r.status === 401) { location.href = 'login'; return; }
      d = r.ok ? await r.json() : null;
      if (d) { withFavicons([d]); withFavicons(d.apps); withFavicons(d.sites); } // favicons reales (solo llegan en privado)
    } catch (e) { console.error('[detalle]', e); if (kind === this.kind && id === this.id) this.body.innerHTML = '<p class="dmuted">No se pudo cargar el detalle. Se reintenta solo en unos segundos.</p>'; return; }
    if (kind !== this.kind || id !== this.id) return; // ya se abrio otra cosa
    if (!d) {
      clearInterval(this.timer);
      this.body.innerHTML = '<p class="dmuted">Este elemento ya no existe (la sesión terminó o el servicio se retiró).</p>';
      return;
    }
    try { this.render(d); } catch (e) { console.error('[detalle]', kind, e); this.body.innerHTML = '<p class="dmuted">No se pudo mostrar este detalle.</p>'; }
  }

  // cabecera con icono pixel; el canvas solo se regenera si cambia
  setHead(key, canvas, title, sub, badge) {
    if (this.headKey !== key) {
      this.headKey = key;
      this.head.innerHTML = '<div class="dicon"></div><div class="dtitles"><h3></h3><p></p></div><div class="dbadge"></div>';
      this.head.querySelector('.dicon').appendChild(canvas);
    }
    this.head.querySelector('h3').textContent = title;
    this.head.querySelector('p').innerHTML = sub;
    this.head.querySelector('.dbadge').innerHTML = badge || '';
  }

  // estructura: graficas persistentes + contenido que se reemplaza en cada refresco
  frame(chartsSpec) {
    if (this.charts) return;
    this.body.innerHTML = `<div class="dcontent"></div>${chartsSpec.map((c, i) => `<section class="dsec"><h4>${c.title}</h4><div class="dchart" id="dch${i}"></div></section>`).join('')}<div class="dcontent2"></div>`;
    this.charts = chartsSpec.map((c, i) => {
      const host = this.body.querySelector('#dch' + i);
      return new uPlot({
        width: host.clientWidth || 300, height: 110, legend: { show: false }, cursor: { points: { size: 7 }, drag: { x: false, y: false } },
        scales: { x: { time: true }, y: { range: c.range || ((u, mn, mx) => [0, Math.max(c.min || 1, (mx || 0) * 1.2)]) } },
        axes: [
          { stroke: '#6b7a93', grid: { show: false }, ticks: { show: false }, font: '10px ui-monospace', size: 20, space: 60,
            values: (u, v) => v.map(x => new Date(x * 1000).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false })) },
          { stroke: '#6b7a93', grid: { stroke: 'rgba(148,163,184,.08)' }, ticks: { show: false }, font: '10px ui-monospace', size: 42, space: 28, values: c.fmt ? (u, v) => v.map(c.fmt) : undefined },
        ],
        series: [{}, ...c.series],
      }, [[], ...c.series.map(() => [])], host);
    });
  }
  setChart(i, rows, fields) {
    if (!this.charts || !this.charts[i]) return;
    this.charts[i].setData([rows.map(r => r.t / 1000), ...fields.map(f => rows.map(r => f(r)))]);
  }
  content(html, html2 = '') {
    const c = this.body.querySelector('.dcontent');
    if (c) c.innerHTML = html; else this.body.innerHTML = html;
    const c2 = this.body.querySelector('.dcontent2');
    if (c2) c2.innerHTML = html2;
  }

  // historial de la cinta (vive en el navegador; se vacia al cambiar de modo)
  renderEvents(list) {
    this.eventsFilter = this.eventsFilter || 'todos';
    const cats = [['todos', 'Todos'], ['agentes', 'Agentes'], ['seguridad', 'Seguridad'], ['servicios', 'Servicios'], ['sitios', 'Sitios'], ['correo', 'Correo']];
    const n = c => c === 'todos' ? list.length : list.filter(e => e.cat === c).length;
    const cv = document.createElement('div'); cv.className = 'dswatch'; cv.innerHTML = px('scroll', 'big');
    this.setHead('events', cv, 'Novedades recientes', `${list.length} evento${list.length === 1 ? '' : 's'} desde que abrió esta pantalla`, '');
    const shown = list.filter(e => this.eventsFilter === 'todos' || e.cat === this.eventsFilter);
    this.content(`<div class="chips">${cats.map(([k, l]) => `<button class="chipbtn ${this.eventsFilter === k ? 'on' : ''}" data-cat="${k}">${l} <b>${n(k)}</b></button>`).join('')}</div>
      <ul class="dlist">${shown.map(e => `<li class="${e.go ? 'link' : ''}" ${e.go ? `data-go="${esc(e.go)}"` : ''}><time>${hhmm(e.t)}</time><span>${px(e.ic)}</span>
        <span class="grow" style="white-space:normal">${e.tag ? `<b style="color:${esc(e.color || 'inherit')}">${esc(e.tag)}</b> · ` : ''}${esc(e.text)}</span></li>`).join('') || '<li class="dmuted">Todavía no hay novedades de este tipo.</li>'}</ul>`);
    this.body.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { this.eventsFilter = b.dataset.cat; this.renderEvents(list); }));
  }

  // panel de un indicador de la barra superior
  renderMetric(d) {
    const T = { cpu: ['CPU', 'terminal'], mem: ['Memoria', 'library'], disk: ['Disco', 'desk'], load: ['Carga del servidor', 'workshop'], net: ['Red', 'antenna'], req: ['Visitas', 'portal'], err: ['Errores 5xx', 'terminal'] }[d.id] || ['Detalle', 'desk'];
    const s = d.system || {};
    const pctBar = (label, v, total, extra = '') => `<li class="bar"><span class="grow">${label}${extra}</span><span class="bw"><i style="width:${Math.min(100, total ? v / total * 100 : v).toFixed(1)}%;${(total ? v / total * 100 : v) > 85 ? 'background:#f87171' : ''}"></i></span><span class="mono">${total ? fmtBytes(v) : v.toFixed(1) + '%'}</span></li>`;
    const procs = list => `<ul class="dlist">${(list || []).map(p => `<li><span class="mono grow">${esc(p.comm)} <span class="dmuted">×${p.n}</span></span><span class="mono">${p.cpu.toFixed(1)}%</span><span class="mono dmuted">${fmtBytes(p.mem)}</span></li>`).join('')}</ul>`;
    const line = (title, series, fmt, range, min) => ({ title, series: series.map(([stroke, fill]) => ({ stroke, width: 2, fill, points: { show: false } })), fmt, range, min });
    switch (d.id) {
      case 'cpu': {
        this.setHead('metric:cpu', iconCanvas(T[1], 4), 'CPU', `${s.cores} núcleos · carga ${s.load ? s.load[0].toFixed(2) : '–'}`, `<span class="pill ${s.cpu > 90 ? 'bad' : s.cpu > 70 ? 'warn' : 'ok'}">${(s.cpu || 0).toFixed(0)}%</span>`);
        this.frame([line('Uso total · 10 min', [['#22d3ee', 'rgba(34,211,238,.1)']], v => v + '%', [0, 100])]);
        this.setChart(0, d.hist, [r => r.v]);
        const M = { user: 'Programas (usuario)', system: 'Sistema (kernel)', iowait: 'Esperando al disco', steal: 'Robado por el hipervisor', softirq: 'Interrupciones', nice: 'Baja prioridad', irq: 'Interrupciones (hw)' };
        this.content(`<section class="dsec"><h4>En qué se va la CPU</h4><ul class="dlist">${Object.entries(M).map(([k, l]) => pctBar(l, d.modes[k] || 0, 0)).join('')}</ul>
          <p class="hint">${(d.modes.iowait || 0) > 10 ? px('warn') + ' Mucha espera de disco: el cuello de botella es el disco, no la CPU. ' : ''}${(d.modes.steal || 0) > 5 ? px('warn') + ' El proveedor está quitando CPU a esta máquina (steal): otras máquinas del mismo servidor físico la usan.' : ''}</p></section>`,
          `<section class="dsec"><h4>Cada núcleo</h4><div class="cores">${(d.cores || []).map((v, i) => `<div class="core" title="Núcleo ${i}: ${v}%"><i style="height:${v}%;${v > 85 ? 'background:#f87171' : ''}"></i><span>${i}</span></div>`).join('')}</div></section>
          <section class="dsec"><h4>Procesos que más CPU usan</h4>${procs(d.top)}</section>`);
        return;
      }
      case 'mem': {
        const m = d.mem;
        this.setHead('metric:mem', iconCanvas(T[1], 4), 'Memoria', `${fmtBytes(m.total)} en total`, `<span class="pill ${s.mem?.pct > 92 ? 'bad' : s.mem?.pct > 80 ? 'warn' : 'ok'}">${(s.mem?.pct || 0).toFixed(0)}%</span>`);
        this.frame([line('Uso · 10 min', [['#a78bfa', 'rgba(167,139,250,.12)']], v => v + '%', [0, 100])]);
        this.setChart(0, d.hist, [r => r.v]);
        this.content(`<section class="dsec"><h4>Cómo se reparte</h4><ul class="dlist">
            ${pctBar('Programas en uso', m.apps, m.total)}${pctBar('Caché de archivos (se libera sola)', m.cached, m.total)}${pctBar('Búferes', m.buffers, m.total)}
            ${pctBar('Compartida (tmpfs, shm)', m.shmem, m.total)}${pctBar('Libre', m.free, m.total)}</ul>
          <p class="hint">"Disponible" = libre + caché que se puede soltar: <b>${fmtBytes(m.available)}</b>. Es normal que Linux use la memoria libre como caché.</p></section>
          <section class="dsec"><h4>Swap</h4><ul class="dlist">${m.swapTotal ? pctBar('Swap en uso', m.swapUsed, m.swapTotal) : '<li class="dmuted">Sin swap configurada.</li>'}</ul>
          ${m.swapTotal && m.swapUsed / m.swapTotal > .5 ? '<p class="hint">' + px('warn') + ' Mucha swap en uso: al servidor le está faltando memoria.</p>' : ''}</section>`,
          `<section class="dsec"><h4>Procesos que más memoria ocupan</h4>${procs(d.top)}</section>`);
        return;
      }
      case 'disk': {
        const main = d.mounts.find(x => x.mount === '/') || d.mounts[0] || {};
        this.setHead('metric:disk', iconCanvas(T[1], 4), 'Disco', `${d.mounts.length} partición(es) · ${fmtBytes(main.avail || 0)} libres en ${esc(main.mount || '/')}`, `<span class="pill ${main.pct > 90 ? 'bad' : main.pct > 80 ? 'warn' : 'ok'}">${(main.pct || 0).toFixed(0)}%</span>`);
        this.frame([line('Lectura y escritura · 10 min', [['#34d399', 'rgba(52,211,153,.1)'], ['#fbbf24', null]], v => fmtBytes(v) + '/s')]);
        this.setChart(0, d.hist, [r => r.read, r => r.write]);
        this.content(`<section class="dsec"><h4>Particiones</h4><ul class="dlist">${d.mounts.map(x => `<li class="bar"><span class="grow"><b class="mono">${esc(x.mount)}</b> <span class="dmuted">${esc(x.type)} · ${fmtBytes(x.avail)} libres de ${fmtBytes(x.total)}${x.inodesPct > 70 ? ` · ${px('warn')} inodos ${x.inodesPct.toFixed(0)}%` : ''}</span></span>
            <span class="bw"><i style="width:${x.pct.toFixed(1)}%;${x.pct > 85 ? 'background:#f87171' : ''}"></i></span><span class="mono">${x.pct.toFixed(0)}%</span></li>`).join('')}</ul></section>
          <p class="hint">Verde: lectura · ámbar: escritura. Los inodos son la cantidad de archivos; si se agotan, el disco "se llena" aunque quede espacio.</p>`,
          `${this.diskMapHtml(d.map)}<section class="dsec"><h4>Dispositivos ahora</h4><ul class="dlist">${d.io.devices.map(x => `<li><span class="mono grow">${esc(x.dev)}</span><span class="mono">↓ ${fmtBytes(x.read)}/s</span><span class="mono">↑ ${fmtBytes(x.write)}/s</span><span class="mono dmuted">ocupado ${x.util.toFixed(0)}%</span></li>`).join('') || '<li class="dmuted">Sin datos todavía.</li>'}</ul></section>`);
        return;
      }
      case 'load': {
        const L = d.load || [0, 0, 0], c = d.cores || 1;
        this.setHead('metric:load', iconCanvas(T[1], 4), 'Carga del servidor', `${c} núcleos: por debajo de ${c} va holgado`, `<span class="pill ${L[0] > c * 1.5 ? 'bad' : L[0] > c ? 'warn' : 'ok'}">${L[0].toFixed(2)}</span>`);
        this.frame([line('Carga · 10 min', [['#fbbf24', 'rgba(251,191,36,.1)']], v => v.toFixed(1), null, c)]);
        this.setChart(0, d.hist, [r => r.v]);
        this.content(`<div class="dstats">${stat('Último minuto', L[0].toFixed(2), L[0] > c ? 'warn' : '')}${stat('5 minutos', L[1].toFixed(2))}${stat('15 minutos', L[2].toFixed(2))}
            ${stat('Procesos corriendo', d.procs.running)}${stat('Esperando disco o red', d.procs.blocked, d.procs.blocked > c ? 'warn' : '')}${stat('Núcleos', c)}</div>
          <p class="hint">La carga cuenta procesos que quieren CPU (o esperan el disco). ${L[0] > L[2] ? 'Está <b>subiendo</b> respecto a los últimos 15 minutos.' : 'Está <b>bajando o estable</b> respecto a los últimos 15 minutos.'}</p>`,
          `<section class="dsec"><h4>Procesos que más CPU usan</h4>${procs(d.top)}</section>`);
        return;
      }
      case 'net': {
        const tot = d.ifaces.reduce((a, x) => ({ rx: a.rx + x.rx, tx: a.tx + x.tx }), { rx: 0, tx: 0 });
        this.setHead('metric:net', iconCanvas(T[1], 4), 'Red', `↓ ${fmtBytes(tot.rx)}/s · ↑ ${fmtBytes(tot.tx)}/s`, '');
        this.frame([line('Entrada y salida · 10 min', [['#22d3ee', 'rgba(34,211,238,.1)'], ['#f472b6', null]], v => fmtBytes(v) + '/s')]);
        this.setChart(0, d.hist, [r => r.rx, r => r.tx]);
        this.content(`<section class="dsec"><h4>Interfaces</h4><ul class="dlist">${d.ifaces.map(x => `<li><span class="mono grow">${esc(x.name)}</span><span class="mono">↓ ${fmtBytes(x.rx)}/s</span><span class="mono">↑ ${fmtBytes(x.tx)}/s</span><span class="dmuted mono">total ↓ ${fmtBytes(x.rxTotal)} ↑ ${fmtBytes(x.txTotal)}</span></li>`).join('')}</ul>
          <p class="hint">Cian: lo que entra · rosado: lo que sale.</p></section>`,
          `<section class="dsec"><h4>Conexiones TCP</h4><div class="dstats">${Object.entries(d.tcp).sort((a, b) => b[1] - a[1]).map(([k, v]) => stat(k, fmtNum(v))).join('')}</div></section>`);
        return;
      }
      case 'req': case 'err': {
        const isErr = d.id === 'err';
        this.setHead('metric:' + d.id, iconCanvas(T[1], 4), T[0], isErr ? 'Veces que un sitio falló al responder' : 'Peticiones a todos los sitios', `<span class="pill ${isErr ? (d.errMin ? 'bad' : 'ok') : 'ok'}">${fmtNum(isErr ? d.errMin : d.reqMin)}/min</span>`);
        this.frame([line(isErr ? 'Errores cada 10 s' : 'Visitas cada 10 s', [[isErr ? '#ef4444' : '#67e8f9', isErr ? 'rgba(239,68,68,.1)' : 'rgba(103,232,249,.08)']], null, null, 2)]);
        this.setChart(0, d.hist, [r => isErr ? r.err : r.req]);
        const link = x => x.go ? `<a data-go="${esc(x.go)}">${esc(x.name)}</a>` : esc(x.name);
        if (!isErr) {
          const total = d.countries.reduce((n, x) => n + x.n, 0);
          const K = { escritorio: px('laptop') + ' Personas en computadora', movil: px('phone') + ' Personas en celular', 'bot:search': px('search') + ' Buscadores', 'bot:ai': px('brain') + ' Bots de IA',
            'bot:seo': px('chart') + ' Bots de SEO', 'bot:social': px('chat') + ' Redes sociales', 'bot:monitor': px('antenna') + ' Monitores', 'bot:script': px('gear') + ' Scripts', 'bot:other': px('bot') + ' Otros bots', 'bot:system': px('workshop') + ' Sistema' };
          this.content(`<section class="dsec"><h4>Qué recibe más visitas (último minuto)</h4><ul class="dlist">${d.top.length ? bars(d.top.map(x => ({ key: x, n: x.n })), x => `${link(x)}${x.kind && x.kind !== x.name ? ` <span class="dmuted">· ${esc(x.kind)}</span>` : ''}`) : '<li class="dmuted">Sin visitas en el último minuto.</li>'}</ul></section>`,
            `<section class="dsec"><h4>Quién visita · última hora</h4><ul class="dlist">${bars(d.kinds, k => K[k] || esc(k), d.kinds.reduce((n, x) => n + x.n, 0))}</ul></section>
            <section class="dsec"><h4>Desde dónde · última hora</h4><ul class="dlist">${bars(d.countries, k => `${flag(k)} ${esc(countryName(k))}`, total)}</ul></section>`);
        } else {
          this.content(`<section class="dsec"><h4>Qué sitios fallan</h4><ul class="dlist">${d.bySite.length ? bars(d.bySite.map(x => ({ key: x, n: x.n })), x => `${link(x)}${x.kind && x.kind !== x.name ? ` <span class="dmuted">· ${esc(x.kind)}</span>` : ''}`) : '<li class="dmuted">' + px('ok') + ' Ningún error 5xx reciente.</li>'}</ul>
            <p class="hint">Un 5xx es una falla del servidor al responder (la aplicación se cayó, tardó demasiado o tiró una excepción). Los 4xx, como "página no encontrada", no cuentan aquí.</p></section>`,
            `<section class="dsec"><h4>Últimos errores</h4><ul class="dlist">${d.recent.map(e => `<li class="visit"><time>${hhmm(e.t)}</time><span class="flag">${flag(e.cc)}</span><span class="code bad">${e.status}</span>
              <span class="grow">${link(e)}${e.path ? `<br><span class="mono dmuted">${esc(e.method || '')} ${esc(e.domain || '')}${esc(e.path)}</span>` : ''}</span></li>`).join('') || '<li class="dmuted">Sin errores registrados desde que Atalaya arrancó.</li>'}</ul></section>`);
        }
        return;
      }
    }
  }

  // "que ocupa el espacio": categorias, arbol navegable, lo que crecio y archivos grandes
  diskMapHtml(m) {
    if (!m) return '';
    const st = m.status;
    const when = st.finishedAt ? `Último análisis ${ago(Date.now() - st.finishedAt)} atrás (${Math.round((st.durationMs || 0) / 1000)} s${st.by ? ', ' + esc(st.by) : ''})` : 'Todavía no se analizó el disco.';
    const head = `<section class="dsec"><h4>¿Qué ocupa el espacio?</h4>
      <div class="row dmrow"><span class="grow dmuted">${st.running ? `⏳ Analizando ${esc(st.running.mount)}… (prioridad mínima: no afecta a los sitios)` : when}</span>
      ${st.running ? '' : '<button class="btn small" data-analyze>Analizar ahora</button>'}</div>
      <p class="hint">Es una tarea pesada: corre solo cuando la pide un dueño, de a una por vez y con la prioridad más baja. Se listan carpetas y archivos de ${esc(st.threshold)} o más.</p></section>`;
    const cats = m.categories.length ? `<section class="dsec"><h4>Por tipo</h4><ul class="dlist">${m.categories.map(c => `<li class="catrow">
        <span class="grow"><b>${esc(c.label)}</b> <span class="dmuted">· ${c.n} carpeta${c.n === 1 ? '' : 's'}</span>${c.id === 'db' ? ' · <a data-go="databases:all">auditar bases</a>' : ''}<br><span class="dmuted">${esc(c.tip)}</span>
        ${c.paths ? `<br>${c.paths.map(x => `<a class="mono" data-dir="${esc(x.path)}">${esc(x.path)}</a> <span class="dmuted">${fmtBytes(x.size)}</span>`).join(' · ')}` : ''}</span>
        <span class="mono"><b>${fmtBytes(c.size)}</b></span></li>`).join('')}</ul></section>` : '';
    if (!m.tree) return head + cats + (st.finishedAt ? '<p class="dmuted">Active el modo privado para ver las carpetas y archivos concretos.</p>' : '');
    const t = m.tree;
    const crumbs = t.dir === '/' ? ['/'] : ['/', ...t.dir.split('/').filter(Boolean).map((_, i, a) => '/' + a.slice(0, i + 1).join('/'))];
    const tree = `<section class="dsec"><h4>Explorar</h4>
      <div class="crumbs">${crumbs.map((c, i) => `<a data-dir="${esc(c)}">${i === 0 ? '/' : esc(c.split('/').pop())}</a>`).join('<span>›</span>')}
        <span class="dmuted mono">· ${fmtBytes(t.size)}${t.prevSize != null && Math.abs(t.size - t.prevSize) > 50 * 1048576 ? ` (${t.size > t.prevSize ? '+' : ''}${fmtBytes(t.size - t.prevSize)} desde el anterior)` : ''}</span></div>
      <ul class="dlist">${t.children.map(x => `<li class="bar ${x.more ? 'link' : ''}" ${x.more ? `data-dir="${esc(x.path)}"` : ''}>
          <span class="grow">${px(x.file ? 'page' : 'folder')} <span class="mono">${esc(x.name)}</span></span>
          <span class="bw"><i style="width:${(x.size / t.size * 100).toFixed(1)}%"></i></span><span class="mono">${fmtBytes(x.size)}</span><span class="dmuted mono pct">${(x.size / t.size * 100).toFixed(0)}%</span></li>`).join('')}
        ${t.rest > 0 ? `<li><span class="grow dmuted">Otros (cada uno menor que el umbral)</span><span class="mono dmuted">${fmtBytes(t.rest)}</span></li>` : ''}</ul></section>`;
    const growth = m.growth && m.growth.length ? `<section class="dsec"><h4>Qué cambió desde el análisis anterior</h4><ul class="dlist">${m.growth.map(g => `<li class="link" data-dir="${esc(g.path)}">
        <span class="grow mono">${esc(g.path)}</span><span class="mono ${g.delta > 0 ? 'upd' : 'dnd'}">${g.delta > 0 ? '▲ +' : '▼ '}${fmtBytes(Math.abs(g.delta))}</span><span class="mono dmuted">${fmtBytes(g.size)}</span></li>`).join('')}</ul></section>` : '';
    const files = m.files && m.files.length ? `<section class="dsec"><h4>Archivos más grandes</h4><ul class="dlist">${m.files.map(f => `<li>
        <span class="grow mono" title="${esc(f.path)}">${esc(f.path)}</span><span class="dmuted">${f.mtime ? new Date(f.mtime).toLocaleDateString('es-VE') : ''}</span><span class="mono"><b>${fmtBytes(f.size)}</b></span></li>`).join('')}</ul></section>` : '';
    return head + cats + growth + tree + files;
  }

  render(d) {
    switch (d.kind) {
      case 'metric': return this.renderMetric(d);
      case 'app': this.renderApp(d); return this.probesLine(d);
      case 'site': this.renderSite(d); return this.probesLine(d);
      case 'session': return this.renderSession(d);
      case 'district': return this.renderDistrict(d);
      case 'system': return this.renderSystem(d);
      case 'security': return this.renderSecurity(d);
      case 'webdef': return this.renderWebdef(d);
      case 'mail': return this.renderMail(d);
      case 'databases': return this.renderDatabases(d);
      case 'database': return this.renderDatabase(d);
      case 'projects': return this.renderProjects(d);
      case 'audit': return this.renderAudit(d);
      case 'project': return this.renderProject(d);
    }
  }

  // bloque comun de trafico: resumen de la hora, rankings y ultimas visitas
  trafficHtml(d) {
    const st = d.stats;
    const priv = !!(st && st.paths);
    // personas (sin robots) en los ultimos 5 minutos y hoy, contadas en vivo
    const live = d.visitorsNow != null ? `<div class="dstats">${stat('Visitantes ahora', fmtNum(d.visitorsNow), d.visitorsNow ? 'ok' : '')}${stat('Visitas de hoy', fmtNum(d.today ? d.today.visits : 0))}${stat('Visitantes de hoy', fmtNum(d.today ? d.today.visitors : 0))}</div>` : '';
    const hour = live + (st ? `<div class="dstats">${stat('Visitas · última hora', fmtNum(st.total))}${stat('Robots', st.total ? Math.round(st.bots / st.total * 100) + '%' : '–')}${stat('Errores 5xx', st.errors, st.errors ? 'bad' : '')}</div>` : '');
    const rank = st ? `
      <section class="dsec"><h4>Países · última hora</h4><ul class="dlist">${bars(st.countries, k => `${flag(k)} ${esc(countryName(k))}`, st.total)}</ul></section>
      <section class="dsec"><h4>Navegadores y robots</h4><ul class="dlist">${bars(st.agents, k => esc(k), st.total)}</ul></section>
      ${priv ? `<section class="dsec"><h4>Páginas más pedidas</h4><ul class="dlist">${bars(st.paths, k => `<span class="mono">${esc(k)}</span>`)}</ul></section>
      <section class="dsec"><h4>De dónde llegan (referer)</h4><ul class="dlist">${bars(st.refs, k => esc(k))}</ul></section>
      ${st.domains && st.domains.length > 1 ? `<section class="dsec"><h4>Visitas por dominio</h4><ul class="dlist">${bars(st.domains, k => esc(k))}</ul></section>` : ''}` : ''}` : '';
    const recent = d.recent.length ? d.recent.map(r => `<li class="visit"><time>${hhmm(r.t)}</time><span class="flag" title="${esc(countryName(r.cc))}">${flag(r.cc)}</span>
        <span class="code ${httpCls(r.status)}">${r.status}</span><span class="mono">${esc(r.method)}</span>
        <span class="grow">${r.path ? `<span class="mono">${esc(r.path)}</span>` : esc(r.ua || (r.bot ? 'Robot' : 'Visita'))}${r.domain ? `<br><span class="dmuted">${esc(r.domain)}${r.ref ? ' · desde ' + esc(r.ref.replace(/^https?:\/\//, '').slice(0, 60)) : ''}</span>` : ''}</span>
        <span class="vua">${px(r.bot ? 'bot' : r.mobile ? 'phone' : 'laptop')} ${esc(r.ua || '')}${r.ip ? `<br><span class="mono dmuted">${esc(r.ip)}</span>` : ''}</span></li>`).join('')
      : '<li class="dmuted">Sin visitas desde que se abrió este panel o se reinició Atalaya.</li>';
    return { hour, rank, recent: `<section class="dsec"><h4>Últimas visitas</h4><ul class="dlist">${recent}</ul></section>` };
  }

  renderApp(d) {
    const SRC = { pm2: 'Proceso PM2', systemd: 'Servicio systemd', docker: 'Contenedor Docker', vercel: 'Proyecto Vercel', supabase: 'Proyecto Supabase' };
    this.setHead('app:' + d.id + d.icon, signCanvas(d.icon, 4), d.name || d.category,
      `${esc(d.name !== d.category ? d.category : '')}${d.name !== d.category && d.category ? ' · ' : ''}${SRC[d.source] || ''} · <a data-go="district:${esc(d.account)}">${esc(d.accountLabel)}</a>`,
      `<span class="pill ${statusCls(d.status)}">${STATUS_LABEL[d.status] || d.status}</span>`);
    this.frame([
      { title: 'CPU · 10 min', series: [{ stroke: '#22d3ee', width: 2, fill: 'rgba(34,211,238,.1)', points: { show: false } }], min: 5, fmt: v => v + '%' },
      { title: 'Memoria · 10 min', series: [{ stroke: '#a78bfa', width: 2, fill: 'rgba(167,139,250,.1)', points: { show: false } }], min: 1, fmt: v => fmtBytes(v * 1048576) },
      { title: 'Visitas cada 10 s', series: [{ stroke: '#67e8f9', width: 2, points: { show: false } }, { stroke: '#ef4444', width: 2, points: { show: false } }], min: 2 },
    ]);
    this.setChart(0, d.hist, [r => r.cpu]);
    this.setChart(1, d.hist, [r => Math.round(r.mem / 1048576)]);
    this.setChart(2, d.req, [r => r.req, r => r.err]);
    const priv = d.port !== undefined || d.domains;
    const top = `<div class="dstats">
        ${stat('CPU', d.cpu.toFixed(1) + '%')}${stat('Memoria', fmtBytes(d.mem))}${stat('Visitas / min', fmtNum(d.reqMin))}
        ${stat('Instancias', `${d.online}/${d.instances}`, d.online < d.instances ? 'bad' : '')}${stat('En línea hace', d.uptime ? dur(d.uptime) : '–')}
        ${stat('Reinicios vistos', d.restarts, d.restarts ? 'warn' : '')}
      </div>
      ${priv ? `<section class="dsec"><h4>Ficha técnica</h4><dl class="dkv">
        ${d.source === 'systemd' ? `<dt>Unidad</dt><dd class="mono">${esc(d.unit)}${d.substate ? ` · ${esc(d.substate)}` : ''}</dd>
          <dt>Usuario</dt><dd>${esc(d.user || 'root')}</dd>${d.description ? `<dt>Descripción</dt><dd>${esc(d.description)}</dd>` : ''}
          <dt>Comando</dt><dd class="mono">${esc(d.exec || '')}</dd><dt>Reinicios</dt><dd>${esc(d.restartsTotal ?? 0)} desde que arrancó systemd</dd>` : ''}
        ${d.source === 'docker' ? `<dt>Imagen</dt><dd class="mono">${esc(d.image)}</dd><dt>Contenedor</dt><dd class="mono">${esc(d.containerId)} · ${esc(d.substate)}</dd>
          ${d.compose ? `<dt>Compose</dt><dd>${esc(d.compose)}${d.service ? ' · ' + esc(d.service) : ''}</dd>` : ''}
          ${d.ports && d.ports.length ? `<dt>Puertos</dt><dd>${d.ports.map(x => `<span class="chip">${esc(x)}</span>`).join(' ')}</dd>` : ''}
          <dt>Reinicios</dt><dd>${esc(d.restartsTotal ?? 0)}</dd>` : ''}
        ${d.pm2 ? `<dt>Proceso PM2</dt><dd>${esc(d.pm2)}${d.mode ? ' · ' + esc(d.mode.replace('_mode', '')) : ''}</dd>` : ''}
        ${d.port ? `<dt>Puerto</dt><dd>${esc(d.port)}</dd>` : ''}
        ${d.cwd ? `<dt>Carpeta</dt><dd class="mono">${esc(d.cwd)}</dd>` : ''}
        ${d.domains?.length ? `<dt>Dominios</dt><dd>${d.domains.map(x => `<span class="chip">${esc(x)}</span>`).join(' ')}</dd>` : ''}
      </dl></section>` : `${d.image ? `<p class="dmuted">Imagen: <span class="mono">${esc(d.image)}</span></p>` : ''}<p class="dmuted">Active el modo privado para ver el proyecto, sus dominios, carpeta, puerto y las IPs y páginas de cada visita.</p>`}`;
    // Vercel: despliegues recientes; Supabase: salud de la base de datos
    const DEP = { READY: ['ok', 'listo'], ERROR: ['bad', 'falló'], CANCELED: ['off', 'cancelado'], BUILDING: ['waiting', 'construyendo'], QUEUED: ['waiting', 'en cola'], INITIALIZING: ['waiting', 'iniciando'] };
    const cloud = d.source === 'vercel' ? `<section class="dsec"><h4>Despliegues recientes</h4><ul class="dlist">${(d.deployments || []).map(x => `<li>
        <time>${hhmm(x.created)}</time><span class="pill ${(DEP[x.state] || ['off'])[0]}">${(DEP[x.state] || ['', x.state])[1]}</span><span class="chip">${x.target === 'production' ? 'producción' : 'preview'}</span>
        <span class="grow">${x.commit ? esc(x.commit) : ''}${x.branch ? ` <span class="dmuted mono">${esc(x.branch)}</span>` : ''}${x.creator ? ` <span class="dmuted">· ${esc(x.creator)}</span>` : ''}</span></li>`).join('') || '<li class="dmuted">Sin despliegues todavía.</li>'}</ul></section>
      ${d.framework ? `<p class="dmuted">Framework: ${esc(d.framework)}${d.domains && d.domains.length ? ' · ' + d.domains.map(x => `<span class="chip">${esc(x)}</span>`).join(' ') : ''}</p>` : ''}`
      : d.source === 'supabase' ? `<div class="dstats">${stat('Disco', d.disk ? `${d.disk.pct.toFixed(0)}% de ${fmtBytes(d.disk.total)}` : '–', d.disk && d.disk.pct > 85 ? 'warn' : '')}
        ${stat('Memoria total', d.memTotal ? fmtBytes(d.memTotal) : '–')}${stat('Conexiones (pooler)', d.pooler ?? '–')}${stat('Conexiones a Postgres', d.dbConns ?? '–')}
        ${stat('Tamaño de la base', d.dbSize ? fmtBytes(d.dbSize) : '–')}${stat('Reinicios de Postgres', d.restartsTotal ?? 0, d.restartsTotal ? 'warn' : '')}</div>
        <p class="dmuted">${d.metrics ? `${d.metrics} métricas · última lectura ${d.lastScrape ? ago(Date.now() - d.lastScrape) : '–'}` : 'Sin métricas todavía (se leen cada minuto).'}${d.region ? ' · región ' + esc(d.region) : ''}${d.ref ? ` · <span class="mono">${esc(d.ref)}</span>` : ''}</p>` : '';
    const tr = this.trafficHtml(d);
    const events = d.events.length ? d.events.slice().reverse().map(e => `<li><time>${hhmm(e.t)}</time><span>${e.action === 'down' ? px('fire') + ' Se cayó' : px('refresh') + ' Se reinició'}</span></li>`).join('')
      : '<li class="dmuted">Sin reinicios ni caídas desde que Atalaya lo vigila.</li>';
    this.content(top + cloud + tr.hour, `${tr.rank}${tr.recent}
      <section class="dsec"><h4>Reinicios y caídas</h4><ul class="dlist">${events}</ul></section>`);
  }

  renderSite(d) {
    const priv = !!d.domains;
    this.setHead('site:' + d.id + d.icon, signCanvas(d.icon, 4), d.name || d.category,
      `${esc(d.category)} · <a data-go="district:${esc(d.account)}">${esc(d.accountLabel)}</a>`,
      `<span class="pill ok">${esc(TYPE_LABEL[d.type] || d.type)}</span>`);
    this.frame([{ title: 'Visitas cada 10 s', series: [{ stroke: '#67e8f9', width: 2, points: { show: false } }, { stroke: '#ef4444', width: 2, points: { show: false } }], min: 2 }]);
    this.setChart(0, d.req, [r => r.req, r => r.err]);
    const tr = this.trafficHtml(d);
    const ficha = priv ? `<section class="dsec"><h4>Ficha técnica</h4><dl class="dkv">
        <dt>Tipo</dt><dd>${esc(TYPE_LABEL[d.type] || d.type)}${d.wpVersion ? ` · WordPress ${esc(d.wpVersion)}` : ''}${d.proxyPort ? ` · puerto ${esc(d.proxyPort)}` : ''}</dd>
        <dt>Carpeta</dt><dd class="mono">${esc(d.docroot)}</dd>
        <dt>Dominios</dt><dd>${d.domains.map(x => `<span class="chip">${esc(x)}</span>`).join(' ')}</dd>
        <dt>Última visita</dt><dd>${d.lastSeen ? new Date(d.lastSeen).toLocaleString('es-VE', { hour12: false }) : '–'}</dd>
      </dl></section>` : `<p class="dmuted">Active el modo privado para ver sus dominios, carpeta y las IPs y páginas de cada visita.</p>`;
    this.content(`<div class="dstats">${stat('Visitas / min', fmtNum(d.reqMin))}${stat('Tipo', esc(TYPE_LABEL[d.type] || d.type))}${stat('Última visita', d.lastSeen ? ago(Date.now() - d.lastSeen) : '–')}</div>${tr.hour}${ficha}`,
      `${tr.rank}${tr.recent}`);
  }

  renderSession(d) {
    const priv = d.title !== undefined;
    const title = priv && d.title ? d.title : `Agente · ${d.accountLabel}`;
    this.setHead('session:' + d.id, robotCanvas(d.color, 4), title,
      `${priv && d.project ? `<span class="mono">${esc(d.project)}</span> · ` : ''}<a data-go="district:${esc(d.account)}">${esc(d.accountLabel)}</a>${d.model ? ' · ' + esc(d.model) : ''}`,
      `<span class="pill ${d.state}">${STATE_LABEL[d.state] || d.state}</span>`);
    const wait = d.waitKind ? `<div class="dwait">${px('ask')} ${WAIT_LABEL[d.waitKind] || 'Lo espera'} desde hace ${ago(Date.now() - d.waitSince)}${priv && d.tool ? ` · <b>${esc(d.tool)}</b>` : ''}${priv && d.detail ? `: ${esc(d.detail)}` : ''}${priv && d.waitMessage ? `<br><span class="dmuted">${esc(d.waitMessage)}</span>` : ''}</div>` : '';
    const now = d.state === 'idle' ? `Sin actividad hace ${ago(Date.now() - d.lastActivity)}` : (priv && d.detail ? `<b>${esc(d.tool || '')}</b> ${esc(d.detail)}` : esc(d.activity));
    const subs = d.subagents.length ? `<section class="dsec"><h4>Subagentes (${d.subagents.length})</h4><ul class="dlist">${d.subagents.map(x =>
      `<li><span class="pill ${x.state}">${STATE_LABEL[x.state] || x.state}</span><span class="grow">${esc(priv ? (x.title || x.agentType || 'subagente') : x.activity)}</span><span class="dmuted mono">${fmtNum(x.tokensOut)} tk</span></li>`).join('')}</ul></section>` : '';
    const ACT = { tool: null, prompt: px('chat'), permission: px('ask'), approved: px('thumb'), done: px('ok'), error: px('warn'), spawn: px('portal'), despawn: px('portal'), start: px('bot'), compact: px('squeeze') };
    const line = e => {
      switch (e.action) {
        case 'tool': return priv && e.tool ? `<b>${esc(e.tool)}</b> ${esc(e.detail || '')}` : esc(e.activity);
        case 'prompt': return priv && e.text ? `Instrucción: ${esc(e.text)}` : 'Recibió una instrucción';
        case 'permission': return (WAIT_LABEL[e.waitKind] || 'Pidió permiso') + (priv && e.tool ? ` · ${esc(e.tool)}` : '');
        case 'approved': return 'Permiso concedido';
        case 'done': return 'Terminó su turno';
        case 'error': return 'Falló una herramienta' + (priv && e.tool ? ` (${esc(e.tool)})` : '');
        case 'spawn': return 'Creó un subagente' + (priv && e.detail ? `: ${esc(e.detail)}` : '');
        case 'despawn': return 'Un subagente terminó';
        case 'compact': return 'Compactó su memoria';
        case 'start': return 'Se conectó';
        default: return esc(e.action);
      }
    };
    const tl = d.timeline.length ? d.timeline.map(e => `<li class="${e.sub ? 'sub' : ''}"><time>${hhmm(e.t)}</time>
        <span class="tic">${e.action === 'tool' && e.station ? '' : (ACT[e.action] || '•')}</span><span class="grow">${e.sub ? '↳ ' : ''}${line(e)}</span></li>`).join('')
      : '<li class="dmuted">Todavía no hay acciones registradas: aparecen a medida que el agente trabaja.</li>';
    this.content(`${wait}<div class="dstats">
        ${stat('Tokens generados', fmtNum(d.tokensOut))}${stat('Herramientas', d.tools)}${stat('Errores', d.errors, d.errors ? 'warn' : '')}
        ${stat('Activo desde', hhmm(d.since))}${stat('Conexión', d.hooks ? px('bolt') + ' Hooks' : 'Transcript')}${priv && d.permMode ? stat('Permisos', esc(d.permMode)) : stat('Estación', esc(d.activity || '–'))}
      </div>
      <section class="dsec"><h4>Ahora</h4><p class="dnow">${now}</p>${priv && d.lastPrompt ? `<p class="dmuted">Última instrucción: ${esc(d.lastPrompt)}</p>` : ''}</section>
      ${subs}
      <section class="dsec"><h4>Línea de tiempo</h4><ul class="dlist tl">${tl}</ul></section>`);
    // iconos de estacion en la linea de tiempo
    this.body.querySelectorAll('.tl li').forEach((li, i) => {
      const e = d.timeline[i];
      if (e && e.action === 'tool' && e.station) { const cv = iconCanvas(e.station === 'waiting' ? 'desk' : e.station, 2); li.querySelector('.tic').appendChild(cv); }
    });
  }

  renderDistrict(d) {
    const sw = document.createElement('div'); sw.className = 'dswatch'; sw.style.background = d.color;
    const h = d.hosting;
    const sub = h ? (h.kind === 'wordpress' ? `Sitio WordPress${h.wp ? ' ' + esc(h.wp.version) : ''}${h.user ? ` · <span class="mono">${esc(h.user)}</span>` : ''}`
        : h.user ? `Hosting compartido · <span class="mono">${esc(h.user)}@${esc(h.host)}</span>${d.main ? ` · <span class="mono">${esc(d.main)}</span>` : ''}` : 'Hosting compartido')
      : d.cpanel ? `cPanel <b>${esc(d.cpanel)}</b> · <span class="mono">${esc(d.main)}</span>` : `${d.apps.length} servicios · ${d.sites.length} sitios`;
    this.setHead('district:' + d.id, sw, d.label, sub, '');
    if (h) return this.renderHosting(d, h);
    const apps = d.apps.map(a => `<li class="link" data-go="app:${esc(a.id)}"><span class="sico" data-icon="${esc(a.icon)}"></span>
        <span class="grow"><b>${esc(a.name)}</b>${a.name !== a.category && a.category ? ` <span class="dmuted">· ${esc(a.category)}</span>` : ''}${a.domains?.length ? `<br><span class="dmuted mono">${a.domains.map(esc).join(' · ')}</span>` : ''}</span>
        <span class="pill ${statusCls(a.status)}">${STATUS_LABEL[a.status]}</span><span class="mono dmuted">${a.cpu.toFixed(1)}% · ${fmtBytes(a.mem)}</span></li>`).join('');
    const ses = d.sessions.length ? d.sessions.map(x => `<li class="link" data-go="session:${esc(x.id)}"><span class="pill ${x.state}">${STATE_LABEL[x.state]}</span>
        <span class="grow">${esc(x.title || 'Agente de Claude')}</span><span class="dmuted">${esc(x.activity)}</span></li>`).join('') : '<li class="dmuted">Sin agentes en este distrito.</li>';
    const sites = d.sites.length ? d.sites.map(x => `<li class="link" data-go="site:${esc(x.id)}"><span class="sico" data-icon="${esc(x.icon)}"></span>
        <span class="grow"><b>${esc(x.name)}</b>${x.name !== x.category ? ` <span class="dmuted">· ${esc(x.category)}</span>` : ''}${x.domains?.length > 1 ? `<br><span class="dmuted mono">${x.domains.slice(1).map(esc).join(' · ')}</span>` : ''}</span>
        <span class="mono dmuted">${fmtNum(x.reqMin)}/min</span></li>`).join('') : '<li class="dmuted">Sin sitios propios.</li>';
    const CH = { added: [px('wip'), 'Nuevo dominio'], removed: [px('trash'), 'Dominio eliminado'], changed: [px('refresh'), 'Cambió'] };
    const changes = d.changes && d.changes.length ? `<section class="dsec"><h4>Cambios recientes</h4><ul class="dlist">${d.changes.map(c => `<li><time>${hhmm(c.t)}</time><span>${CH[c.action][0]}</span><span class="grow">${CH[c.action][1]}${c.domain ? `: <b class="mono">${esc(c.domain)}</b> <span class="dmuted">${esc(c.what || '')}</span>` : ''}</span></li>`).join('')}</ul></section>` : '';
    this.content(`<div class="dstats">${stat('Servicios PM2', d.apps.length)}${stat('Sitios', d.sites.length)}${stat('Visitas / min', fmtNum(d.reqMin))}</div>
      ${changes}
      <section class="dsec"><h4>Servicios (PM2)</h4><ul class="dlist">${apps}</ul></section>
      <section class="dsec"><h4>Sitios web</h4><ul class="dlist">${sites}</ul></section>
      <section class="dsec"><h4>Agentes de Claude</h4><ul class="dlist">${ses}</ul></section>
      ${d.dbs && d.dbs.length ? `<section class="dsec"><h4>Bases de datos</h4><ul class="dlist">${d.dbs.map(dbRow).join('')}</ul>
        ${d.dbCount > d.dbs.length ? `<p class="dlinks"><a data-go="databases:${esc(d.id)}">Ver las ${d.dbCount} bases</a></p>` : ''}</section>` : ''}`);
    this.body.querySelectorAll('.sico').forEach(el => el.appendChild(signCanvas(el.dataset.icon, 2)));
  }

  // distrito de un hosting compartido (datos que envia el agente por cron)
  renderHosting(d, h) {
    const priv = !!h.user;
    const LV = { warn: px('warn'), info: px('info'), ok: px('ok') };
    const when = t => t ? 'hace ' + ago(Date.now() - t) : '—';
    const quota = h.quota ? (h.quota.limitMB ? `${fmtBytes(h.quota.usedMB * 1048576)} / ${fmtBytes(h.quota.limitMB * 1048576)}` : fmtBytes(h.quota.usedMB * 1048576) + ' (sin límite)') : h.disk ? fmtBytes(h.disk.used) : '–';
    const sites = d.sites.length ? d.sites.map(x => `<li class="link" data-go="site:${esc(x.id)}"><span class="sico" data-icon="${esc(x.icon)}"></span>
        <span class="grow"><b>${esc(x.name)}</b>${x.name !== x.category ? ` <span class="dmuted">· ${esc(x.category)}</span>` : ''}</span><span class="mono dmuted">${fmtNum(x.reqMin)}/min</span></li>`).join('') : '<li class="dmuted">Todavía sin sitios (llegan con el primer envío completo).</li>';
    const findings = h.findings.length ? `<section class="dsec"><h4>Para revisar</h4><ul class="dlist">${h.findings.map(f => `<li><span>${LV[f.level] || ''}</span><span class="grow">${esc(f.text)}</span></li>`).join('')}</ul></section>` : '';
    const usage = h.usage && h.usage.length ? `<section class="dsec"><h4>Uso de recursos (según el panel)</h4><ul class="dlist">${h.usage.map(u => `<li class="bar"><span class="grow">${esc(u.label)}</span>
        ${u.max ? `<span class="bw"><i style="width:${Math.min(100, u.usage / u.max * 100).toFixed(1)}%"></i></span>` : ''}<span class="mono">${u.bytes ? fmtBytes(u.usage) : fmtNum(u.usage)}${u.max ? ' / ' + (u.bytes ? fmtBytes(u.max) : fmtNum(u.max)) : ''}</span></li>`).join('')}</ul></section>` : '';
    const w = h.wp;
    const wpSec = w ? `<section class="dsec"><h4>WordPress</h4><div class="dstats">${stat('Versión', esc(w.version) + (w.coreUpdate ? ` → ${esc(w.coreUpdate)}` : ''), w.coreUpdate ? 'warn' : '')}
        ${stat('PHP', esc(w.php || '–'), w.phpStatus && w.phpStatus.level !== 'ok' ? w.phpStatus.level : '')}${stat('Plugins', `${w.pluginsActive}/${w.plugins} activos`)}
        ${stat('Por actualizar', w.pluginUpdates + w.themeUpdates, w.pluginUpdates + w.themeUpdates ? 'warn' : '')}${stat('Base', w.dbSize ? fmtBytes(w.dbSize) : '–')}${stat('Usuarios', `${w.users} · ${w.admins} admin`)}</div>
        ${w.woocommerce ? `<p class="hint">WooCommerce ${esc(w.woocommerce)}</p>` : ''}
        ${w.pluginList ? `<ul class="dlist">${w.pluginList.map(p => `<li><span class="grow">${esc(p.name)} <span class="dmuted mono">${esc(p.version)}</span>${p.auto ? ' <span class="dmuted">· auto</span>' : ''}</span>
          ${p.update ? `<span class="pill warn">→ ${esc(p.update)}</span>` : ''}<span class="pill ${p.active ? 'ok' : 'off'}">${p.active ? 'activo' : 'inactivo'}</span></li>`).join('')}</ul>` : ''}
        ${w.themeList ? `<p class="hint">Temas: ${w.themeList.map(t => `${esc(t.name)} ${esc(t.version)}${t.active ? ' (activo)' : ''}${t.update ? ` → ${esc(t.update)}` : ''}`).join(' · ')}</p>` : ''}</section>` : '';
    let detail = '';
    if (priv) {
      const ssl = h.ssl.length ? `<section class="dsec"><h4>Certificados SSL</h4><ul class="dlist">${h.ssl.map(c => { const days = c.expires ? Math.ceil((c.expires - Date.now()) / 86400000) : null;
        return `<li><span class="pill ${days == null ? 'off' : days < 0 ? 'bad' : days < 14 ? 'warn' : 'ok'}">${days == null ? '¿?' : days < 0 ? 'vencido' : days + ' días'}</span><span class="grow mono">${esc(c.domain)}</span><span class="dmuted">${esc(c.issuer)}${c.selfSigned ? ' · autofirmado' : ''}</span></li>`; }).join('')}</ul></section>` : '';
      const dbs = h.dbs.length ? `<section class="dsec"><h4>Bases de datos · ${fmtBytes(h.dbSize)}</h4><ul class="dlist">${h.dbs.map(x => `<li><span class="grow mono">${esc(x.name)}</span><span class="dmuted">${x.users} usuario${x.users === 1 ? '' : 's'}</span><span class="mono">${fmtBytes(x.size)}</span></li>`).join('')}</ul></section>` : '';
      const errs = h.errlogs.length ? `<section class="dsec"><h4>Errores de PHP (error_log)</h4><ul class="dlist">${h.errlogs.map(e => `<li class="col"><span class="grow"><span class="mono">${esc(e.file)}</span> <span class="dmuted">· ${fmtBytes(e.size)} · ${e.lastHour} líneas en la última hora · modificado ${when(e.mtime)}</span>
          ${e.recent.length ? `<pre class="errtail">${e.recent.map(r => esc(r.text)).join('\n')}</pre>` : ''}</span></li>`).join('')}</ul></section>` : '';
      const cron = h.cron.length ? `<section class="dsec"><h4>Tareas cron</h4><ul class="dlist">${h.cron.map(c => `<li><span class="mono dmuted">${esc(c.schedule)}</span><span class="grow mono">${esc(c.command)}</span></li>`).join('')}</ul><p class="hint">Los tokens y contraseñas se tapan antes de guardarse.</p></section>` : '';
      const mail = h.mail.length ? `<section class="dsec"><h4>Buzones de correo · ${fmtBytes(h.mailSize)}</h4><ul class="dlist">${h.mail.map(m => `<li><span class="grow mono">${esc(m.email)}</span><span class="mono">${fmtBytes(m.used)}${m.quota ? ' / ' + fmtBytes(m.quota) : ''}</span></li>`).join('')}</ul></section>` : '';
      const max = h.du && h.du.rows.length ? h.du.rows[0].size : 1;
      const du = `<section class="dsec"><h4>¿Qué ocupa el espacio?</h4><div class="row dmrow"><span class="grow dmuted">${h.duPending ? '⏳ Pedido: el agente lo calcula en su próximo envío (1–2 minutos).' : h.du ? `Último análisis ${when(h.du.at)}` : 'Todavía no se analizó.'}</span>
          ${h.duPending ? '' : `<button class="btn small" data-agent-du="${esc(h.id)}">Analizar ahora</button>`}</div>
        ${h.du ? `<ul class="dlist">${h.du.rows.slice(1, 40).map(x => `<li class="bar"><span class="grow mono">${esc(x.path)}</span><span class="bw"><i style="width:${(x.size / max * 100).toFixed(1)}%"></i></span><span class="mono">${fmtBytes(x.size)}</span></li>`).join('')}</ul>` : ''}</section>`;
      detail = findings + wpSec + ssl + errs + dbs + du + mail + cron + usage;
    } else detail = findings + wpSec + usage + '<p class="dmuted">Active el modo privado para ver dominios, plugins, certificados, errores, bases, correo y tareas cron.</p>';
    this.content(`<div class="dstats">${stat('Agente', h.stale ? 'sin señal' : 'en línea', h.stale ? 'bad' : '')}${stat('Último envío', when(h.lastPush))}${stat('Visitas / min', fmtNum(d.reqMin))}
        ${stat('Disco', quota)}${stat('Bases', h.dbCount ? `${h.dbCount} · ${fmtBytes(h.dbSize)}` : '–')}${stat('Correo', h.mailCount ? `${h.mailCount} · ${fmtBytes(h.mailSize)}` : '–')}
        ${stat('SSL por vencer', h.sslSoon, h.sslSoon ? 'warn' : '')}${stat('Errores PHP / h', fmtNum(h.errLastHour), h.errLastHour > 20 ? 'warn' : '')}${stat('Tareas cron', h.cronCount)}</div>
      <section class="dsec"><h4>Sitios</h4><ul class="dlist">${sites}</ul></section>${detail}`);
    this.body.querySelectorAll('.sico').forEach(el => el.appendChild(signCanvas(el.dataset.icon, 2)));
  }

  renderSystem(d) {
    const s = d.system;
    this.setHead('system', iconCanvas('terminal', 4), 'Torre de control', d.host ? esc(d.host) : 'El servidor completo', d.health ? this.healthPill(d.health) : '');
    this.frame([{ title: 'CPU y memoria · 10 min', range: [0, 100], fmt: v => v + '%',
      series: [{ stroke: '#22d3ee', width: 2, fill: 'rgba(34,211,238,.1)', points: { show: false } }, { stroke: '#a78bfa', width: 2, points: { show: false } }] }]);
    this.setChart(0, d.hist, [r => r.cpu, r => r.mem]);
    const top = d.top.map(p => `<li><span class="mono grow">${esc(p.comm)} <span class="dmuted">×${p.n}</span></span><span class="mono">${p.cpu.toFixed(1)}%</span><span class="mono dmuted">${fmtBytes(p.mem)}</span></li>`).join('');
    const health = d.health ? `<section class="dsec hsec"><h4>${px('shield')} Salud del servidor ${this.healthPill(d.health)}</h4>${this.healthHtml(d.health, true)}</section>` : '';
    this.content(`${health}<div class="dstats">
        ${stat('CPU', s.cpu.toFixed(0) + '%')}${stat('Núcleos', s.cores)}${stat('Carga 1/5/15', s.load.map(x => x.toFixed(2)).join(' · '))}
        ${stat('Memoria', `${fmtBytes(s.mem.used)} / ${fmtBytes(s.mem.total)}`)}${stat('Swap', fmtBytes(s.swap.used))}${stat('Disco', s.disk ? `${fmtBytes(s.disk.used)} / ${fmtBytes(s.disk.total)}` : '–', s.disk?.pct > 85 ? 'warn' : '')}
        ${stat('Red ↓ / ↑', `${fmtBytes(s.net.rx)}/s · ${fmtBytes(s.net.tx)}/s`)}${stat('Encendido hace', dur(s.uptime))}${stat('Procesos', s.procs)}
        ${stat('Servicios', `${d.apps}${d.appsDown ? ` (${d.appsDown} con problemas)` : ''}`, d.appsDown ? 'bad' : '')}${stat('Agentes Claude', d.sessions)}
      </div>
      ${d.connectors && d.connectors.length ? `<section class="dsec"><h4>Conectores de nube</h4><ul class="dlist">${d.connectors.map(c => `<li>
        <span class="pill ${c.ok ? 'ok' : 'bad'}">${c.ok ? 'conectado' : 'error'}</span><span class="grow"><b>${esc(c.label)}</b> · ${c.projects} proyecto${c.projects === 1 ? '' : 's'}${c.error ? `<br><span class="dmuted">${esc(c.error)}</span>` : ''}</span>
        <span class="dmuted">${c.lastOk ? 'leído hace ' + ago(Date.now() - c.lastOk) : 'sin lectura'}${c.type === 'vercel' ? (c.drainAt ? ` · visitas hace ${ago(Date.now() - c.drainAt)}` : ' · sin Drain') : ''}</span></li>`).join('')}</ul></section>` : ''}
      ${d.keys && d.keys.length ? `<section class="dsec"><h4>Servicios clave</h4><div class="keys">${d.keys.map(k => `<span class="keysvc ${k.state === 'active' ? 'ok' : k.state === 'failed' ? 'bad' : 'off'}" title="${esc(k.unit)} · ${esc(k.substate || k.state)}">${esc(k.label)}<b>${k.state === 'active' ? 'activo' : k.state === 'failed' ? 'FALLÓ' : k.state === 'inactive' ? 'detenido' : esc(k.state)}</b></span>`).join('')}</div></section>` : ''}`, `<section class="dsec"><h4>Visitantes por país · última hora</h4><ul class="dlist">${bars(d.countries, k => `${flag(k)} ${esc(countryName(k))}`, d.countries.reduce((n, x) => n + x.n, 0))}</ul></section>
      <section class="dsec"><h4>Procesos que más consumen</h4><ul class="dlist">${top}</ul></section>
      <p class="dlinks"><a data-go="security:all">${px('shield')} Ver defensa</a> · <a data-go="webdef:all">${px('invader')} Defensa web</a> · <a data-go="mail:all">${px('mail')} Ver correo</a> · <a data-go="databases:all">${px('db')} Bases de datos</a></p>`);
  }

  // al final de la ficha de un sitio o app: cuantos robots lo sondearon y si quedo algo expuesto
  probesLine(d) {
    if (!d.probes || !d.probes.n) return;
    const body = this.body.querySelector('.dcontent') || this.body; // se reemplaza en cada refresco: no se duplica
    body.insertAdjacentHTML('beforeend', `<section class="dsec"><h4>Defensa web</h4><p class="${d.probes.exposed ? 'afind bad' : 'dmuted'}">${px(d.probes.exposed ? 'bad' : 'invader')}
      ${fmtNum(d.probes.n)} sondeo(s) de robots en 24 h${d.probes.exposed ? ` · <b>${d.probes.exposed} archivo(s) expuesto(s)</b>` : ''} · <a data-go="webdef:${esc(d.id)}">Ver qué buscan</a></p></section>`);
  }

  // defensa web: robots que buscan rutas vulnerables; lo grave arriba (archivos expuestos) con su arreglo
  renderWebdef(d) {
    this.setHead('webdef', iconCanvas('portal', 4), 'Defensa web', d.id === 'all' ? 'Robots buscando rutas vulnerables en sus sitios' : 'Rutas vulnerables buscadas en este sitio', '');
    const FAMPX = { secrets: 'key', shells: 'bad', panels: 'gear', exploits: 'invader', wordpress: 'wp' };
    const exp = d.exposed.length ? `<section class="dsec"><h4>Para atender</h4>${d.exposed.map(x => `<div class="afind ${x.sev}">
        <h5>${px(FAMPX[x.fam] || 'warn')} ${esc(x.why)}</h5>
        <p>${esc(x.site)} <span class="dmuted">· ${esc(x.account)}</span>${x.path ? ` · <code>${esc(x.path)}</code>` : ''} <span class="dmuted">· ${fmtNum(x.n)} vez(ces), la última a las ${hhmm(x.last)}</span></p>
        ${x.fix ? `<p class="fix">${esc(x.fix)}</p>` : ''}</div>`).join('')}</section>`
      : `<section class="dsec"><p class="dmuted">${px('ok')} Ningún archivo sensible respondió: los sondeos no encontraron nada.</p></section>`;
    const fams = d.families.length ? `<section class="dsec"><h4>Qué buscan</h4><ul class="dlist">${d.families.map(f => `<li>${px(FAMPX[f.fam] || 'warn')}<span class="grow">${esc(f.label)}</span><b>${fmtNum(f.n)}</b></li>`).join('')}</ul></section>` : '';
    const sites = d.sites.length ? `<section class="dsec"><h4>Sitios más buscados</h4><ul class="dlist">${d.sites.map(s => `<li class="${s.go ? 'link' : ''}" ${s.go ? `data-go="${esc(s.go)}"` : ''}><span class="grow">${esc(s.name)} <span class="dmuted">· ${esc(s.account)}</span></span><b>${fmtNum(s.n)}</b></li>`).join('')}</ul></section>` : '';
    const cc = d.countries.length ? `<section class="dsec"><h4>Desde dónde</h4><div class="chips">${d.countries.map(c => `<span class="chip">${esc(c.cc)} <b>${fmtNum(c.n)}</b></span>`).join('')}</div></section>` : '';
    const paths = d.paths && d.paths.length ? `<section class="dsec"><h4>Rutas más pedidas</h4><ul class="dlist">${d.paths.map(p => `<li><code class="grow">${esc(p.path)}</code><span class="dmuted">${p.status || ''}</span><b>${fmtNum(p.n)}</b></li>`).join('')}</ul></section>` : '';
    const ips = d.ips && d.ips.length ? `<section class="dsec"><h4>Quién más insiste</h4><ul class="dlist">${d.ips.map(i => `<li><span class="grow mono">${esc(i.ip)}</span><span class="dmuted">${esc(i.country || i.cc || '')}</span><b>${fmtNum(i.n)}</b></li>`).join('')}</ul></section>` : '';
    this.content(`<div class="dstats">${stat('Última hora', fmtNum(d.hour))}${stat('Últimas 24 h', fmtNum(d.day))}${stat('Expuestos', fmtNum(d.exposed.filter(x => x.sev === 'bad').length), d.exposed.some(x => x.sev === 'bad') ? 'bad' : '')}</div>
      ${exp}${fams}${sites}${paths}${ips}${cc}
      ${d.priv ? '' : '<p class="dmuted small">En modo privado se ven las rutas, las IPs y qué archivo quedó expuesto.</p>'}
      <p class="dmuted small">Atalaya solo mira: no bloquea. Cuando una ruta de secretos o de webshell responde, la vuelve a pedir una vez para confirmar si de verdad expone algo; nunca guarda su contenido.</p>`);
  }

  renderSecurity(d) {
    this.setHead('security', iconCanvas('portal', 4), 'Defensa del servidor', 'SSH, cPHulk y accesos', '');
    const c = d.counts;
    const KIND = { attack: [px('invader'), 'Intento fallido'], block: [px('shield'), 'IP bloqueada'], login: [px('key'), 'Acceso correcto'] };
    const top = d.top.length ? d.top.map((x, i) => `<li><span class="flag" title="${esc(x.country || '')}">${flag(x.cc)}</span><span class="grow">${x.ip ? `<b class="mono">${esc(x.ip)}</b>${x.users?.length ? ` <span class="dmuted">probó: ${x.users.map(esc).join(', ')}</span>` : ''}` : `Atacante #${i + 1}`}</span>
        <span class="mono">${fmtNum(x.n)}</span>${x.blocked ? '<span class="pill bad">bloqueada</span>' : ''}</li>`).join('') : '<li class="dmuted">Sin atacantes registrados desde que Atalaya arrancó.</li>';
    const rec = d.recent.length ? d.recent.map(e => `<li><time>${hhmm(e.t)}</time><span>${KIND[e.kind][0]}</span><span class="flag" title="${esc(e.country || '')}">${flag(e.cc)}</span><span class="grow">${KIND[e.kind][1]} · ${esc(e.service || '')}${e.user ? ` · <span class="mono">${esc(e.user)}</span>` : ''}</span>${e.ip ? `<span class="mono dmuted">${esc(e.ip)}</span>` : ''}</li>`).join('')
      : '<li class="dmuted">Sin eventos todavía.</li>';
    this.content(`<div class="dstats">${stat('Intentos fallidos', fmtNum(c.failed), c.failed ? 'warn' : '')}${stat('IPs bloqueadas', fmtNum(c.blocked))}${stat('Accesos correctos', fmtNum(c.logins))}</div>
      <section class="dsec"><h4>Quién más insiste</h4><ul class="dlist">${top}</ul></section>
      <section class="dsec"><h4>Últimos eventos</h4><ul class="dlist">${rec}</ul></section>`);
  }

  renderMail(d) {
    const cv = document.createElement('div'); cv.className = 'dswatch'; cv.innerHTML = px('mail', 'big');
    this.setHead('mail', cv, 'Correo', 'Exim · entregas y rebotes', '');
    const DIR = { out: px('mailOut') + ' Enviado', in: px('mailIn') + ' Recibido', bounce: px('mailBad') + ' Rebotó' };
    const WHY = { auth: 'Sin SPF/DKIM/DMARC', nouser: 'No existe el destinatario', full: 'Buzón lleno', spam: 'Spam o reputación', domain: 'Dominio inexistente', rate: 'Demasiados envíos', other: 'Otro motivo' };
    // cada movimiento: hora, que paso, de que cuenta y, si reboto, por que (en privado: de quien, a quien y el codigo)
    const rec = d.recent.length ? d.recent.map(e => `<li class="mailrow"><time>${hhmm(e.t)}</time><div class="grow">
        <div>${DIR[e.dir]} <span class="dmuted">· ${esc(e.account)}</span>${e.dir === 'bounce' && e.cat ? ` <span class="pill ${e.cat === 'full' || e.cat === 'nouser' ? 'warn' : 'bad'}">${esc(WHY[e.cat] || e.why || '')}</span>` : ''}</div>
        ${d.priv && (e.from || e.to) ? `<div class="mfield"><span>De</span><b class="mono">${esc(e.from || '(sin remitente: aviso del sistema)')}</b></div><div class="mfield"><span>Para</span><b class="mono">${esc(e.to || '')}</b></div>` : ''}
        ${d.priv && e.reason && e.dir === 'bounce' ? `<div class="mwhy">${e.code ? `<b class="mono">${esc(e.code)}</b> ` : ''}${esc(e.reason)}</div>` : ''}</div></li>`).join('')
      : '<li class="dmuted">Sin movimiento de correo desde que Atalaya arrancó.</li>';
    const reasons = (d.reasons || []).length ? `<section class="dsec"><h4>Por qué rebota</h4>${d.reasons.map(r => `<div class="afind ${r.cat === 'full' || r.cat === 'nouser' ? 'warn' : 'bad'}">
        <h5>${esc(WHY[r.cat] || r.cat)} <span class="dmuted">· ${fmtNum(r.n)}</span></h5>${r.fix ? `<p class="fix">${esc(r.fix)}</p>` : ''}</div>`).join('')}</section>` : '';
    const accs = (d.byAccount || []).length ? `<section class="dsec"><h4>Por cuenta</h4><table class="dtable"><thead><tr><th>Cuenta</th><th>Enviados</th><th>Recibidos</th><th>Rebotes</th></tr></thead><tbody>
        ${d.byAccount.map(a => `<tr><td>${esc(a.account)}</td><td>${fmtNum(a.out)}</td><td>${fmtNum(a.in)}</td><td class="${a.bounce ? 'warn' : ''}">${fmtNum(a.bounce)}</td></tr>`).join('')}</tbody></table></section>` : '';
    this.content(`<div class="dstats">${stat('Enviados', fmtNum(d.counts.out))}${stat('Recibidos', fmtNum(d.counts.in))}${stat('Rebotes', fmtNum(d.counts.bounce), d.counts.bounce ? 'warn' : '')}</div>
      ${reasons}${accs}
      <section class="dsec"><h4>Últimos movimientos</h4><ul class="dlist">${rec}</ul>${d.priv ? '' : '<p class="dmuted small">En modo privado se ven remitente, destinatario y el mensaje del servidor que lo rechazó.</p>'}</section>`);
  }

  // salud del servidor: una seccion por revision, con sus cifras y cada hallazgo con su "como arreglarlo".
  // compact (en la Torre de control): lo que esta en orden va en una sola linea
  healthHtml(h, compact) {
    if (!h) return '';
    const ST = { ok: ['ok', 'En orden'], warn: ['warn', 'Para revisar'], bad: ['bad', 'Grave'], unknown: ['off', 'Sin revisar'] };
    const sec = x => {
      const st = ST[x.status] || ST.unknown;
      const btn = x.canCheck ? `<button class="btn small" data-audit-updates="1" ${h.running ? 'disabled' : ''}>${h.running ? 'Revisando…' : 'Revisar actualizaciones'}</button>` : '';
      if (compact && x.status === 'ok') return `<div class="hline">${px(x.icon)} <b>${esc(x.title)}</b> <span class="pill ok">En orden</span> <span class="dmuted">${x.items.map(i => `${esc(i.label)}: ${esc(i.value)}`).join(' · ')}</span></div>`;
      const finds = h.priv ? x.findings.map(f => `<div class="afind ${f.sev}"><h5>${esc(f.title)}</h5><p>${esc(f.detail || '')}</p>${f.fix ? `<p class="fix">${esc(f.fix)}</p>` : ''}
          ${f.rows && f.rows.length ? `<ul>${f.rows.map(r => `<li>${r.port ? `puerto <b>${r.port}</b> ${esc(r.proc || '')}` : `<b>${esc(r.user || '')}</b> <span class="dmuted">${esc(r.schedule || '')}</span> <code>${esc(r.command || '')}</code>`}</li>`).join('')}</ul>` : ''}
          ${f.names && f.names.length ? `<p class="dmuted">${esc(f.names.slice(0, 20).join(', '))}${f.names.length > 20 ? '…' : ''}</p>` : ''}</div>`).join('')
        : (x.findings.length ? `<p class="dmuted">${x.findings.length} hallazgo${x.findings.length === 1 ? '' : 's'}. Active el modo privado para verlos con su «cómo arreglarlo».</p>` : '');
      return `<section class="dsec"><h4>${px(x.icon)} ${esc(x.title)} <span class="pill ${st[0]}">${st[1]}</span></h4>
        <div class="dstats">${x.items.map(i => stat(i.label, `${esc(i.value)}${i.sub ? `<br><small class="dmuted">${esc(i.sub)}</small>` : ''}`)).join('')}</div>
        ${finds || (x.status === 'ok' ? '<p class="dmuted">Nada para revisar.</p>' : '')}${btn ? `<div class="row dmrow">${btn}</div>` : ''}</section>`;
    };
    const rank = { bad: 0, warn: 1, unknown: 2, ok: 3 };
    const order = h.sections.slice().sort((a, b) => rank[a.status] - rank[b.status]);
    return order.map(sec).join('') + '<p class="hint">Atalaya solo mira: no cambia nada. Estas revisiones se repiten cada 15 minutos; las actualizaciones, solo cuando usted lo pide.</p>';
  }
  healthPill(h) {
    const all = h ? h.sections.flatMap(x => x.findings) : [];
    const bad = all.filter(f => f.sev === 'bad').length, warn = all.filter(f => f.sev === 'warn').length;
    return `<span class="pill ${bad ? 'bad' : warn ? 'warn' : 'ok'}">${bad ? bad + ' grave' + (bad === 1 ? '' : 's') : warn ? warn + ' para revisar' : 'en orden'}</span>`;
  }
  renderAudit(d) {
    const cv = document.createElement('div'); cv.className = 'dswatch'; cv.innerHTML = px('shield', 'big');
    this.setHead('audit:all', cv, 'Salud del servidor', `Revisado hace ${ago(Date.now() - d.t)} · solo lectura`, this.healthPill(d));
    this.content(this.healthHtml(d, false));
  }

  renderProjects(d) {
    const cv = document.createElement('div'); cv.className = 'dswatch'; cv.innerHTML = px('folder', 'big');
    this.setHead('projects', cv, 'Proyectos', 'Código, despliegues, dominios y bases, unidos por proyecto', '');
    const priv = d.projects.some(x => x.repo !== undefined);
    const f = this.params.filter || 'all';
    const FIL = { all: ['Todos', () => true], bad: ['Con problemas', x => x.bad || x.down], warn: ['Para revisar', x => !x.bad && !x.down && x.warn], ok: ['En orden', x => !x.bad && !x.down && !x.warn] };
    const list = d.projects.filter(FIL[f][1]);
    const gh = d.github.length ? d.github.map(g => `${px(g.ok ? 'dotG' : 'dotR')} ${esc(g.label || 'GitHub')} · ${g.repos} repos${g.error ? ` · ${esc(g.error)}` : ''}`).join(' · ') : '';
    this.content(`<div class="dstats">${stat('Proyectos', d.projects.length)}${stat('Puntaje promedio', d.avg ?? '–', d.avg != null ? (d.avg >= 85 ? '' : d.avg >= 60 ? 'warn' : 'bad') : '')}
        ${stat('Con problemas', d.projects.filter(FIL.bad[1]).length, d.projects.some(FIL.bad[1]) ? 'bad' : '')}${stat('Para revisar', d.projects.filter(FIL.warn[1]).length)}</div>
      <section class="dsec"><div class="row dmrow"><span class="grow dmuted">${d.job ? '' : 'Las revisiones que salen a Internet (certificados, respuesta, dominio y repo) corren solo a pedido.'}</span>
        ${priv && !d.job ? '<button class="btn small" data-proj="analyze" data-id="all">Analizar todos</button>' : ''}</div>${projJob(d.job)}
        ${gh ? `<p class="hint">${gh}</p>` : `<p class="hint">Conecte GitHub (menú ⋮ › Asistente › Extras) para unir cada proyecto con su código y revisar sus repos.</p>`}</section>
      <div class="chips">${Object.entries(FIL).map(([k, [l]]) => `<button class="chip ${k === f ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
      <section class="dsec"><ul class="dlist">${list.map(x => `<li class="link" data-go="project:${esc(x.id)}"><span class="score s${scoreCls(x.score)}">${x.score}</span>
        <span class="grow"><b>${esc(x.name)}</b> <span class="dmuted">${x.kinds.map(k => KIND_ICON[k] || '').join(' ')}</span>
        ${x.repo || (x.domains && x.domains.length) ? `<br><span class="dmuted mono">${esc([x.repo, ...(x.domains || [])].filter(Boolean).join(' · '))}</span>` : ''}</span>
        <span class="dmuted">${x.bad ? `${px('bad')} ${x.bad}` : ''} ${x.warn ? `${px('warn')} ${x.warn}` : ''}</span><span class="dmuted">${x.activity ? ago(Date.now() - x.activity) : ''}</span></li>`).join('') || '<li class="dmuted">Nada en este filtro.</li>'}</ul></section>`);
    this.body.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { this.params.filter = b.dataset.filter; this.load(); }));
  }

  renderProject(d) {
    const sc = document.createElement('div'); sc.className = `dswatch score s${scoreCls(d.score)}`; sc.textContent = d.score;
    const priv = d.repoInfo !== undefined;
    this.setHead('project:' + d.id, sc, d.name, priv && d.repoInfo ? `<span class="mono">${esc(d.repoInfo.fullName)}</span>${d.repoInfo.private ? '' : ' · público'}${d.repoInfo.language ? ' · ' + esc(d.repoInfo.language) : ''}` : d.kinds.map(k => KIND_ICON[k]).join(' '), '');
    const order = { bad: 0, warn: 1, unknown: 2, info: 3, ok: 4 };
    const checks = d.checks.slice().sort((a, b) => order[a.level] - order[b.level]).map(c => `<li class="col"><span>${LEVEL_ICON[c.level]}</span><span class="grow"><b>${esc(c.title)}</b>${c.tip ? `<br><span class="dmuted">${esc(c.tip)}</span>` : ''}</span></li>`).join('');
    const parts = d.parts.map(p => `<li class="${p.go ? 'link' : ''}" ${p.go ? `data-go="${esc(p.go)}"` : ''}><span>${KIND_ICON[p.kind] || ''}</span>
        <span class="grow"><b>${esc(p.name || p.where)}</b> <span class="dmuted">· ${esc(p.where)}${p.account ? ' · ' + esc(p.account) : ''}${p.suggested ? ' · unido por nombre parecido' : ''}</span>
        ${p.remote ? `<br><span class="mono dmuted">${esc(p.remote.replace(/\/\/[^@/]+@/, '//'))}</span>` : ''}</span>
        ${p.status ? `<span class="pill ${p.status === 'online' ? 'ok' : p.status === 'down' ? 'bad' : 'warn'}">${STATUS_LABEL[p.status] || esc(p.status)}</span>` : ''}</li>`).join('');
    const a = d.audit;
    const doms = priv && d.allDomains.length ? `<section class="dsec"><h4>Dominios</h4><ul class="dlist">${d.allDomains.slice(0, 20).map(x => {
        const c = a && a.certs && a.certs[x], h = a && a.http && a.http[x];
        const days = c && c.expires ? Math.ceil((c.expires - Date.now()) / 86400000) : null;
        return `<li><span class="grow mono">${esc(x)}</span>${h ? `<span class="code ${h.status >= 500 || !h.status ? 'bad' : h.status >= 400 ? 'warn' : 'ok'}">${h.status || '—'}</span><span class="dmuted mono">${h.ms} ms</span>` : ''}
          ${c ? `<span class="pill ${!c.ok || days < 0 ? 'bad' : days < 14 ? 'warn' : 'ok'}">${!c.ok ? 'SSL inválido' : 'SSL ' + days + ' d'}</span>` : ''}</li>`; }).join('')}</ul>
        ${a && a.domains && Object.keys(a.domains).length ? `<p class="hint">Registro: ${Object.entries(a.domains).map(([k, v]) => `${esc(k)} ${v.expires ? 'vence el ' + new Date(v.expires).toLocaleDateString('es-VE') : '(el registro no publica la fecha)'}${v.registrar ? ' · ' + esc(v.registrar) : ''}`).join(' · ')}</p>` : ''}</section>` : '';
    const secrets = priv && a && a.repo && a.repo.secrets.length ? `<section class="dsec"><h4>Archivos con secretos en el repo</h4><ul class="dlist">${a.repo.secrets.map(x => `<li><span class="grow mono">${esc(x.path)}</span><span class="dmuted">${esc(x.what)}</span></li>`).join('')}</ul></section>` : '';
    const tools = priv ? `<section class="dsec"><h4>Organizar</h4><div class="row">
        <select id="projInto"><option value="">Unir con…</option>${d.others.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select>
        <button class="btn small ghost" data-proj="merge" data-id="${esc(d.id)}">Unir</button>
        ${d.parts.some(p => p.suggested) || d.parts.length > 1 ? `<button class="btn small ghost" data-proj="split" data-id="${esc(d.id)}">Separar uniones</button>` : ''}
        <button class="btn small ghost" data-proj="rename" data-id="${esc(d.id)}" data-name="${esc(d.name)}">Renombrar</button>
        <button class="btn small ghost" data-proj="hide" data-id="${esc(d.id)}">Ocultar</button></div>
        <p class="hint">Atalaya une solo lo que comparte repositorio. Si dos piezas son del mismo proyecto y no se unieron, únalas aquí.</p></section>` : '';
    this.content(`<div class="dstats">${stat('Puntaje', d.score, scoreCls(d.score) === 'ok' ? '' : scoreCls(d.score))}${stat('Problemas', d.bad, d.bad ? 'bad' : '')}${stat('Para revisar', d.warn, d.warn ? 'warn' : '')}
        ${stat('Última actividad', d.activity ? 'hace ' + ago(Date.now() - d.activity) : '–')}</div>
      <section class="dsec"><div class="row dmrow"><span class="grow dmuted">${d.running ? '⏳ Revisando…' : d.audited ? `Última revisión hace ${ago(Date.now() - d.audited)}` : 'Todavía no se revisó.'}</span>
        ${priv && !d.job ? `<button class="btn small" data-proj="analyze" data-id="${esc(d.id)}">Analizar ahora</button>` : ''}</div>${d.job && !d.running ? projJob(d.job) : ''}
        ${a && a.repoError ? `<p class="msg bad">No se pudo revisar el repo: ${esc(a.repoError)}</p>` : ''}</section>
      <section class="dsec"><h4>Buenas prácticas</h4><ul class="dlist">${checks}</ul></section>
      <section class="dsec"><h4>Dónde vive</h4><ul class="dlist">${parts}</ul></section>
      ${doms}${secrets}${tools}${priv ? '' : '<p class="dmuted">Active el modo privado para ver nombres, repos, dominios y los consejos concretos.</p>'}`);
  }

  renderDatabases(d) {
    this.setHead('databases:' + (d.account || 'all'), signCanvas('db', 4), 'Bases de datos', d.accountLabel ? `Cuenta ${esc(d.accountLabel)}` : 'MySQL / MariaDB · todo el servidor', '');
    if (!d.available) return this.content('<p class="dmuted">No se encontró el directorio de datos de MySQL/MariaDB en este servidor.</p>');
    const shown = d.dbs.reduce((n, x) => n + x.size, 0);
    const max = d.dbs.reduce((n, x) => Math.max(n, x.size), 1);
    this.content(`<div class="dstats">${stat('Bases', d.account ? d.dbs.length : d.count)}${stat('Espacio', fmtBytes(d.account ? shown : d.total))}${stat('La más grande', d.dbs[0] ? fmtBytes(d.dbs[0].size) : '–')}</div>
      ${jobLine(d.job)}
      <p class="hint">La lista se lee de los archivos del servidor de bases, sin conectarse ni ejecutar consultas. Toque una base para auditarla: tablas, qué sitio la usa, qué creció y hallazgos.</p>
      <section class="dsec"><ul class="dlist">${d.dbs.map(x => dbRow(x, max)).join('')}</ul></section>`);
  }

  renderDatabase(d) {
    this.setHead('database:' + d.id, signCanvas('db', 4), d.name,
      `${d.account ? `<a data-go="district:${esc(d.account)}">${esc(d.accountLabel)}</a> · ` : ''}${d.tables} tabla${d.tables === 1 ? '' : 's'} · ${fmtBytes(d.size)}`, '');
    const priv = !!d.findings;
    const when = d.audited ? `Última auditoría hace ${ago(Date.now() - d.audited)}` : 'Todavía no se auditó esta base.';
    const btn = d.running ? '' : priv ? `<button class="btn small" data-audit-db="${esc(d.name)}"${d.job ? ' disabled' : ''}>${d.audited ? 'Auditar de nuevo' : 'Analizar ahora'}</button>` : '';
    const head = `<div class="dstats">${stat('Tamaño', fmtBytes(d.size))}${stat('Tablas', d.tables)}${stat('Última escritura', d.lastWrite ? 'hace ' + ago(Date.now() - d.lastWrite) : '–')}</div>
      <section class="dsec"><div class="row dmrow"><span class="grow dmuted">${d.running ? '⏳ Auditando…' : when}</span>${btn}</div>
      ${d.job && !d.running ? jobLine(d.job) : ''}
      ${priv || d.audited ? '' : '<p class="dmuted">Active el modo privado para auditar la base y ver sus tablas.</p>'}</section>`;
    if (!d.audited) return this.content(head);
    const LV = { warn: px('warn'), info: px('info'), ok: px('ok') };
    if (!priv) {
      const c = d.findingCounts;
      return this.content(head + `<section class="dsec"><h4>Resultado</h4><ul class="dlist">
        <li><span class="grow">${d.inUse ? 'Un sitio o app de la cuenta la usa' : 'Ningún archivo de configuración la menciona'}</span></li>
        <li><span class="grow">Hallazgos: ${c.warn || 0} ${px('warn')} · ${c.info || 0} ${px('info')}</span></li>
        <li><span class="grow">Motores: ${d.engines.map(e => `${esc(e.key)} ×${e.n}`).join(' · ')}</span></li></ul>
        <p class="dmuted">Active el modo privado para ver tablas, archivos y hallazgos concretos.</p></section>`);
    }
    const dg = d.prevAt ? d.auditSize - d.prevSize : 0;
    const growth = d.prevAt ? `<p class="dmuted">Comparado con la auditoría del ${new Date(d.prevAt).toLocaleDateString('es-VE')}: ${dg ? (dg > 0 ? '+' : '−') + fmtBytes(Math.abs(dg)) : 'sin cambios de tamaño'}.</p>` : '';
    const users = d.users.length ? d.users.map(u => `<li>${u.domain ? `<span class="grow"><b>${esc(u.domain)}</b>` : `<span class="grow">${u.project ? `Proyecto <b>${esc(u.project)}</b>` : 'App'}`}<br><span class="mono dmuted">${esc(u.file)}</span></span></li>`).join('')
      : '<li class="dmuted">Ningún archivo de configuración de la cuenta menciona esta base.</li>';
    const tmax = d.tables.reduce((n, t) => Math.max(n, t.size), 1);
    const tables = d.tables.map(t => `<li class="bar"><span class="grow mono">${esc(t.name)} <span class="dmuted">${esc(t.engine)}</span></span>
        <span class="bw"><i style="width:${(t.size / tmax * 100).toFixed(1)}%"></i></span><span class="mono">${fmtBytes(t.size)}</span>
        <span class="mono pct ${t.delta > 0 ? 'upd' : t.delta < 0 ? 'dnd' : 'dmuted'}">${t.delta ? (t.delta > 0 ? '+' : '−') + fmtBytes(Math.abs(t.delta)) : ''}</span></li>`).join('');
    this.content(head + `<section class="dsec"><h4>Hallazgos</h4><ul class="dlist">${d.findings.map(f => `<li><span>${LV[f.level] || ''}</span><span class="grow">${esc(f.text)}</span></li>`).join('')}</ul>${growth}</section>
      <section class="dsec"><h4>¿Quién la usa?</h4><ul class="dlist">${users}</ul><p class="hint">Se buscó el nombre de la base en los archivos de configuración de la cuenta (.env, wp-config.php, config.php…). Nunca se muestra su contenido.</p></section>
      <section class="dsec"><h4>Tablas por tamaño${d.tableCount > d.tables.length ? ` · las ${d.tables.length} más grandes de ${d.tableCount}` : ''}</h4><ul class="dlist">${tables}</ul></section>`);
  }
}

const KIND_ICON = { vercel: px('triangle'), supabase: px('bolt'), app: px('gear'), site: px('web'), hosting: px('house'), repo: px('box') };
const LEVEL_ICON = { ok: px('ok'), info: px('info'), warn: px('warn'), bad: px('bad'), unknown: px('unknown') };
const scoreCls = s => s >= 85 ? 'ok' : s >= 60 ? 'warn' : 'bad';
function projJob(j) { return j ? `<p class="dmuted">⏳ En curso: ${esc(j.label)} (hace ${ago(Date.now() - j.startedAt)}).</p>` : ''; }

// fila de una base en listas (distrito y panel de bases)
function dbRow(x, max) {
  return `<li class="link${max ? ' bar' : ''}" data-go="database:${esc(x.id)}"><span class="grow"><span class="mono">${esc(x.name)}</span>${x.shadow ? ' <span class="dmuted">· shadow</span>' : ''}
    ${x.accountLabel ? `<br><span class="dmuted">${esc(x.accountLabel)} · ${x.tables} tablas · escrita hace ${ago(Date.now() - x.lastWrite)}</span>` : `<br><span class="dmuted">${x.tables} tablas</span>`}</span>
    ${max ? `<span class="bw"><i style="width:${(x.size / max * 100).toFixed(1)}%"></i></span>` : ''}<span class="mono">${fmtBytes(x.size)}</span></li>`;
}
function jobLine(j) { return j ? `<p class="dmuted">⏳ En curso: ${esc(j.label)} (hace ${ago(Date.now() - j.startedAt)}). Los análisis corren de a uno para no cargar el servidor.</p>` : ''; }
