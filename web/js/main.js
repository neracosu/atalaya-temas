// Arranque: stream SSE, mundo, HUD y control del modo privado
import { animate } from '/vendor/anime.esm.min.js';
import { px } from './pixicons.js';
// marcadores del HTML estatico: <span data-px="nombre"></span>
document.querySelectorAll('[data-px]').forEach(el => { el.innerHTML = px(el.dataset.px); });
import { ThemeManager } from './themes.js';
import { initKpis, initCharts, rethemeCharts, renderState, tickerEvent, resetAgents, getEvents, clearTicker } from './hud.js';
import { buildPin } from './pin.js';
import { Drawer } from './drawer.js';
import { showTip, hideTip, openLegend } from './tips.js';

const $ = id => document.getElementById(id);
const post = (url, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atalaya': '1' }, body: JSON.stringify(body) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (r.status === 401 && url !== '/api/private') location.href = '/login'; if (!r.ok) throw new Error(j.error || 'Error'); return j; });

let hello = null, state = null, chartsReady = false, loadedVersion = null;
// el mundo lo pone el tema activo (web/themes/<id>); cambia en caliente
let world = null;
const tm = new ThemeManager($('world'), w => {
  world = w;
  w.onSelect = (kind, id) => { hideTip(); drawer.open(kind, id); };
  w.onTip = (t, x, y) => (t ? showTip(t, x, y) : hideTip());
  w.onNav = onNav;
  window.atalaya = { world: w, drawer, themes: tm }; // referencia para depurar desde la consola
});

// ---------------------------------------------------------------- detalle y navegacion
// Todo lo que se toca pasa por aqui: el mundo enfoca la entidad y el panel muestra su detalle
const drawer = new Drawer($('drawer'), {
  onNavigate: (kind, id) => openDetail(kind, id),
  onClose: () => world && world.clearSelection(),
});
function openDetail(kind, id) {
  if (['app', 'site', 'session', 'district', 'system', 'security'].includes(kind)) world.pick(kind, id); // enfoca y dispara onSelect
  else drawer.open(kind, id);
}
drawer.eventsProvider = getEvents;
$('tall').addEventListener('click', () => drawer.open('events', 'all'));
$('navHelp').addEventListener('click', () => openLegend(tm.manifest));
document.addEventListener('click', e => {
  const el = e.target.closest('[data-go]');
  if (!el || el.closest('#drawer')) return; // el panel maneja sus propios enlaces
  const [kind, ...rest] = el.dataset.go.split(':');
  openDetail(kind, rest.join(':'));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset?.go) e.target.click();
});
function onNav(st) {
  const el = $('navState');
  const html = st.mode === 'manual' ? `${px('move')} Navegación libre · el director vuelve en ${st.left} s` : st.mode === 'director' ? `${px('camera')} Director` : `${px('pin')} Cámara fija`;
  if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
  el.classList.toggle('manual', st.mode === 'manual');
}
$('navHome').addEventListener('click', () => world.resetView());
$('navIn').addEventListener('click', () => world.zoomBy(1.3));
$('navOut').addEventListener('click', () => world.zoomBy(1 / 1.3));
$('navState').addEventListener('click', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' })));

// monta un tema y restaura lo que la pantalla tenia (director, margenes del HUD)
async function switchTheme(id) {
  drawer.close(); hideTip();
  await tm.load(id);
  rethemeCharts();
  try { if (localStorage.getItem('atalaya_director') === '0') world.setDirector(false); } catch { }
  requestAnimationFrame(() => world.setInsets(insets()));
  world.navChanged && world.navChanged();
}

// margenes que el HUD le quita al mundo, midiendo donde quedo cada panel (cada tema los acomoda distinto):
// barras anchas arriba o abajo, y columnas altas a los lados
function insets() {
  const vw = innerWidth, vh = innerHeight, ins = { top: 8, bottom: 8, left: 8, right: 8 };
  // si el tema declaro el area del mundo, manda esa
  const wa = $('worldArea');
  if (wa && getComputedStyle(wa).display !== 'none') {
    const r = wa.getBoundingClientRect();
    if (r.width > 100 && r.height > 100) return { top: r.top, left: r.left, right: vw - r.right, bottom: vh - r.bottom };
  }
  for (const id of ['top', 'left', 'right', 'ticker']) {
    const el = $(id);
    if (!el || el.hidden || getComputedStyle(el).display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.width > vw * 0.5) {
      if (r.top < vh * 0.25) ins.top = Math.max(ins.top, r.bottom + 8);
      else if (r.bottom > vh * 0.75) ins.bottom = Math.max(ins.bottom, vh - r.top + 8);
    } else if (r.height > vh * 0.35 && vw > 900) {
      if (r.left < vw * 0.3) ins.left = Math.max(ins.left, r.right + 8);
      else if (r.right > vw * 0.7) ins.right = Math.max(ins.right, vw - r.left + 8);
    }
  }
  return ins;
}

// ---------------------------------------------------------------- modo
function applyMode(h) {
  hello = h;
  document.body.classList.toggle('private', h.priv);
  const b = $('mode');
  b.classList.toggle('priv', h.priv); b.classList.toggle('pub', !h.priv);
  b.querySelector('.txt').textContent = h.priv ? 'PRIVADO' : 'PÚBLICO';
  $('title').firstChild.textContent = h.title + ' ';
  $('verChip').textContent = 'v' + h.version;
  document.querySelectorAll('.owneronly').forEach(b => { b.hidden = h.role !== 'owner'; });
  $('version').textContent = `${h.title} v${h.version}`;
  // tras una actualizacion, las novedades se muestran una vez
  let seen = null; try { seen = localStorage.getItem('atalaya_seen_version'); localStorage.setItem('atalaya_seen_version', h.version); } catch { }
  if (seen && seen !== h.version) setTimeout(() => openNews(seen), 1500);
  $('subtitle').textContent = h.priv ? h.subtitle : 'Monitor en vivo';
  document.title = h.title + (h.priv ? ' · privado' : '');
  resetAgents();
  updateCountdown();
}
function updateCountdown() {
  const el = $('mode').querySelector('.left');
  if (!hello || !hello.priv) { el.textContent = ''; return; }
  if (hello.privateUntil === -1) { el.textContent = '∞'; return; }
  const s = Math.max(0, Math.round((hello.privateUntil - Date.now()) / 1000));
  el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
setInterval(updateCountdown, 1000);

// dialogo para activar el modo privado
let minutes = null;
const dlg = $('privDlg');
const privPin = buildPin($('privPin'), () => $('privForm').requestSubmit());
function openPrivate() {
  if (!hello) return;
  if (hello.role !== 'owner') { flash('Su usuario solo tiene acceso al modo público'); return; }
  const opts = hello.privateOptions;
  minutes = minutes ?? opts[0];
  const lbl = m => m === 0 ? 'Sin límite' : m < 60 ? `${m} min` : m === 60 ? '1 hora' : `${m / 60} horas`;
  $('durations').innerHTML = opts.map(m => `<button type="button" role="radio" aria-checked="${m === minutes}" data-m="${m}">${lbl(m)}</button>`).join('');
  $('privErr').textContent = '';
  dlg.showModal();
  privPin.clear();
  animate(dlg, { opacity: [0, 1], scale: [0.95, 1], duration: 300, ease: 'outQuad' });
}
$('durations').addEventListener('click', e => {
  const b = e.target.closest('button[data-m]'); if (!b) return;
  minutes = Number(b.dataset.m);
  for (const x of $('durations').children) x.setAttribute('aria-checked', x === b);
});
$('privCancel').addEventListener('click', () => dlg.close());
$('privForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (privPin.value().length !== 6) { $('privErr').textContent = 'Complete los 6 dígitos'; return; }
  try { await post('/api/private', { pin: privPin.value(), minutes }); dlg.close(); }
  catch (ex) { $('privErr').textContent = ex.message; privPin.clear(); }
});
async function goPublic() { try { await post('/api/public'); } catch { } }

$('mode').addEventListener('click', () => (hello?.priv ? goPublic() : openPrivate()));

// menu
$('menuBtn').addEventListener('click', e => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; });
document.addEventListener('click', () => { $('menu').hidden = true; });
$('menu').addEventListener('click', async e => {
  const act = e.target.closest('button')?.dataset.act;
  if (act === 'theme') openThemes();
  if (act === 'fullscreen') toggleFs();
  if (act === 'lock') goPublic();
  if (act === 'setup') location.href = '/setup';
  if (act === 'install') openInstall('vps');
  if (act === 'hosting') openInstall('hosting');
  if (act === 'director') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
  if (act === 'lockall') { await post('/api/public-all').catch(() => { }); flash('Todas las pantallas pasaron a modo público'); }
  if (act === 'logout') { await post('/api/logout').catch(() => { }); location.href = '/login'; }
});
function toggleFs() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { }); }

// atajos: L publico al instante, P privado, F pantalla completa
document.addEventListener('keydown', e => {
  if (dlg.open || $('legend').open || newsDlg.open || instDlg.open || themeDlg.open || e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' && drawer.isOpen) drawer.close();
  else if (k === 'l' || k === 'escape') goPublic();
  else if (k === 'p') openPrivate();
  else if (k === 'f') toggleFs();
  else if (k === 't') cycleTheme();
  else if (k === '?' || k === 'h') openLegend(tm.manifest);
  else if (k === 'd') { world.setDirector(!world.directorOn); world.navChanged(); try { localStorage.setItem('atalaya_director', world.directorOn ? '1' : '0'); } catch { } flash(world.directorOn ? 'Modo director: la cámara recorre los distritos' : 'Cámara fija en la vista general'); }
});

function flash(msg) {
  const c = $('conn');
  c.textContent = msg; c.hidden = false; c.style.background = 'rgba(34,211,238,.15)'; c.style.borderColor = 'rgba(34,211,238,.5)'; c.style.color = '#cffafe';
  setTimeout(() => { c.hidden = true; c.removeAttribute('style'); }, 3500);
}

// ---------------------------------------------------------------- instalar en otro servidor
const instDlg = $('instDlg');
instDlg.querySelector('.iclose').addEventListener('click', () => instDlg.close());
const ie = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ipost = (url, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atalaya': '1' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => ({ error: 'Sin conexión' }));
const copyBox = (id, text) => `<div class="copy"><pre class="cmd">${ie(text)}</pre><button class="btn small" data-copy="${id}">Copiar</button></div>`;
let instTab = 'vps';
instDlg.querySelectorAll('[data-itab]').forEach(b => b.addEventListener('click', () => openInstall(b.dataset.itab)));
instDlg.addEventListener('click', ev => {
  const b = ev.target.closest('[data-copy]');
  if (b) navigator.clipboard?.writeText(b.previousElementSibling.textContent).then(() => { b.textContent = 'Copiado ✓'; });
});
async function openInstall(tab = instTab) {
  instTab = tab;
  instDlg.querySelectorAll('[data-itab]').forEach(b => b.setAttribute('aria-selected', b.dataset.itab === tab ? 'true' : 'false'));
  if (tab === 'hosting') await renderHosting(); else await renderVps();
  if (!instDlg.open) instDlg.showModal();
}
async function renderVps() {
  const r = await ipost('/api/setup/install-command');
  if (!r.command) { $('instBody').innerHTML = `<p class="dmuted">${ie(r.error || 'No se pudo generar el comando')}</p>`; return; }
  const until = new Date(r.expires).toLocaleString('es-VE', { hour12: false });
  $('instBody').innerHTML = `
    <p class="lead"><b>Atalaya VPS</b>: para servidores con acceso root. Ve todo el servidor: cuentas, procesos, servicios, bases, logs y agentes de Claude Code.
    Este comando descarga Atalaya <b>desde este servidor</b> y lo instala en el otro. Vale hasta <b>${ie(until)}</b> y para 5 instalaciones.</p>
    ${copyBox('vps', r.command)}
    <section><h4>Dónde pegarlo</h4>
      <div class="lrow"><div class="lico">${px('terminal', 'big')}</div><div><b>cPanel / WHM</b><p>Entre a WHM como root › <b>Server Configuration › Terminal</b>, pegue el comando y pulse Enter. No necesita otro programa.</p></div></div>
      <div class="lrow"><div class="lico">${px('plug', 'big')}</div><div><b>Plesk</b><p><b>Tools & Settings › SSH Terminal</b> (o por SSH como root).</p></div></div>
      <div class="lrow"><div class="lico">${px('gear', 'big')}</div><div><b>DirectAdmin, CyberPanel o VPS sin panel</b><p>Por SSH como root (en Windows: PowerShell con <code>ssh root@IP</code>).</p></div></div>
      <div class="lrow"><div class="lico">${px('cloud', 'big')}</div><div><b>Solo nube (Vercel / Supabase)</b><p>Use cualquier VPS pequeño con Linux; al terminar, conecte sus cuentas en el asistente.</p></div></div>
    </section>
    <section><h4>Qué hace</h4><p class="lhelp">Instala Node.js si falta, descarga y verifica el paquete, crea el servicio de solo lectura y le muestra la <b>dirección y el código</b> del asistente web. Todo lo demás se configura desde el navegador.</p></section>
    <p class="lhelp">¿Su cliente solo tiene un hosting compartido (sin root)? Use la pestaña <a href="#" data-itab-go="hosting">Hosting compartido</a>.</p>`;
  $('instBody').querySelector('[data-itab-go]').addEventListener('click', ev => { ev.preventDefault(); openInstall('hosting'); });
}
async function renderHosting(created) {
  const list = await ipost('/api/agents/list');
  const rows = (list.agents || []).map(a => `<li><span class="pill ${a.pending ? 'waiting' : a.stale ? 'bad' : 'ok'}">${a.pending ? 'sin vincular' : a.stale ? 'sin señal' : 'conectado'}</span>
      <span class="grow"><b>${ie(a.label || a.id)}</b>${a.user ? ` <span class="dmuted mono">${ie(a.user)}@${ie(a.host)}</span>` : ''}</span>
      <span class="dmuted">${a.lastPush ? 'hace ' + Math.max(1, Math.round((Date.now() - a.lastPush) / 60000)) + ' min' : ''}</span>
      <button class="btn small ghost" data-recode="${ie(a.id)}">Nuevo código</button><button class="btn small ghost" data-remove="${ie(a.id)}">Quitar</button></li>`).join('');
  const got = created ? `<section class="newagent"><h4>${px('ok')} Listo: ahora instale el agente en el hosting «${ie(created.id)}»</h4>
      <p class="lhelp">El código vale <b>24 horas</b> y sirve <b>una sola vez</b>. Elija la forma que permita el hosting:</p>
      <div class="lrow"><div class="lico">⌨️</div><div><b>Con Terminal</b> (cPanel › Avanzado › <b>Terminal</b>, o SSH)<p>Pegue y pulse Enter:</p>${copyBox('term', created.command)}</div></div>
      <div class="lrow"><div class="lico">⏰</div><div><b>Sin Terminal</b> (cPanel › <b>Trabajos de cron</b>, hPanel › Avanzado › <b>Cron Jobs</b>)
        <p>Cree una tarea <b>cada minuto</b> (<code>* * * * *</code>) con este comando. En su primera ejecución el agente se instala y esa tarea se borra sola.</p>${copyBox('cron', created.cron)}</div></div>
      <p class="lhelp">En uno o dos minutos aparecerá un distrito nuevo en el mapa con sus sitios y visitas.</p></section>` : '';
  $('instBody').innerHTML = `
    <p class="lead"><b>Atalaya Hosting</b>: para cuentas de hosting compartido (cPanel, Hostinger, GoDaddy, Namecheap…) donde no hay root.
      Un agente pequeño corre por cron cada minuto, <b>lee solo esa cuenta</b> y envía los datos a esta pantalla. No se instala nada en <code>public_html</code>, no usa base de datos y no abre puertos.</p>
    ${got}
    <section class="wpbox"><h4>${px('wp')} Conectar un sitio WordPress (sin terminal ni cron)</h4>
      <p class="lhelp">Descargue el plugin <b>ya configurado</b> para este Atalaya, súbalo en <b>wp-admin › Plugins › Añadir nuevo › Subir plugin</b> y actívelo: se conecta solo.
        Además de lo del hosting, ve lo que solo se sabe desde adentro: versión de WordPress, plugins y temas por actualizar, PHP sin soporte, errores visibles, usuario «admin» y más.</p>
      <form id="wpForm" class="agform"><input name="id" placeholder="nombre-corto (ej. blog-ana)" pattern="[a-z0-9][a-z0-9-]{0,30}" required>
        <input name="label" placeholder="Descripción (ej. Blog de Ana)"><button class="btn small">Descargar plugin</button></form>
      <p class="dmuted" id="wpErr"></p>
      <p class="lhelp">El .zip trae un código de un solo uso que vence en 24 horas. ¿Prefiere pegar el código a mano? Use el <a href="/install/atalaya-wp.zip">plugin genérico</a> y el código del formulario de abajo (Ajustes › Atalaya).</p></section>
    <section><h4>Conectar un hosting</h4>
      <form id="agForm" class="agform"><input name="id" placeholder="nombre-corto (ej. cliente-godaddy)" pattern="[a-z0-9][a-z0-9-]{0,30}" required>
        <input name="label" placeholder="Descripción (ej. Tienda de Ana · GoDaddy)"><button class="btn small">Generar código</button></form>
      <p class="dmuted" id="agErr"></p></section>
    ${rows ? `<section><h4>Hostings conectados</h4><ul class="dlist">${rows}</ul></section>` : ''}
    <section><h4>¿Su cliente quiere su propia pantalla?</h4><p class="lhelp">Si el hosting permite apps Node (cPanel › <b>Setup Node.js App</b>), puede instalarle <b>Atalaya Hosting completo</b> en su cuenta:
      en su Terminal de cPanel pegue el comando (cambie el dominio por un subdominio suyo). Queda con su propio acceso, asistente y agente.</p>
      <div class="row"><button class="btn small" id="hcmd">Generar comando de instalación</button></div><div id="hcmdOut"></div></section>
    <section><h4>Qué verá de cada hosting</h4><p class="lhelp">Sus dominios y subdominios como edificios, las visitas en vivo con país, errores de PHP, cuota de disco, bases de datos, certificados SSL por vencer,
      buzones de correo, uso de recursos y tareas cron (con los secretos tapados). Con <b>Analizar ahora</b> puede pedirle qué carpetas ocupan más espacio.
      Necesita <code>curl</code> y cron, que traen todos los hostings; con cPanel se aprovecha además <code>uapi</code>.</p></section>`;
  $('hcmd').addEventListener('click', async () => {
    const r = await ipost('/api/setup/install-command');
    $('hcmdOut').innerHTML = r.hostingCommand ? `${copyBox('hosting', r.hostingCommand)}<p class="lhelp">Vale 24 horas y para 5 instalaciones. Sin Node en el hosting, conéctelo arriba como hosting de esta pantalla.</p>` : `<p class="dmuted">${ie(r.error || 'No se pudo generar')}</p>`;
  });
  $('wpForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const r = await fetch('/api/agents/wp-plugin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atalaya': '1' }, body: JSON.stringify({ id: f.get('id'), label: f.get('label') || f.get('id') }) }).catch(() => null);
    if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; $('wpErr').textContent = j.error || 'No se pudo generar el plugin'; return; }
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `atalaya-agent-${f.get('id')}.zip` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    $('wpErr').innerHTML = px('ok') + ' Descargado. Súbalo en wp-admin › Plugins › Añadir nuevo › Subir plugin y actívelo.';
    setTimeout(() => renderHosting(), 1500);
  });
  $('agForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const r = await ipost('/api/agents/create', { id: f.get('id'), label: f.get('label') || f.get('id') });
    if (r.error) { $('agErr').textContent = r.error; return; }
    renderHosting(r);
  });
  $('instBody').querySelectorAll('[data-recode]').forEach(b => b.addEventListener('click', async () => {
    const r = await ipost('/api/agents/recode', { id: b.dataset.recode });
    if (r.error) flash(r.error); else renderHosting(r);
  }));
  $('instBody').querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`¿Quitar el hosting «${b.dataset.remove}»? Dejará de aceptar sus envíos (el agente seguirá en el hosting hasta que lo desinstale).`)) return;
    const r = await ipost('/api/agents/remove', { id: b.dataset.remove });
    if (r.error) flash(r.error); else renderHosting();
  }));
}

// ---------------------------------------------------------------- temas
const themeDlg = $('themeDlg');
themeDlg.querySelector('.tclose').addEventListener('click', () => themeDlg.close());
async function themeList() { const r = await fetch('/api/themes').then(x => x.ok ? x.json() : null).catch(() => null); return r ? r.themes : []; }
async function cycleTheme() {
  const list = await themeList();
  if (list.length < 2) return;
  const i = list.findIndex(t => t.id === document.body.dataset.theme);
  const next = list[(i + 1) % list.length];
  tm.setLocal(next.id); await switchTheme(next.id);
  flash(`Tema: ${next.name} (solo en esta pantalla)`);
}
async function openThemes() {
  const list = await themeList();
  const cur = document.body.dataset.theme, local = tm.localChoice(), owner = hello && hello.role === 'owner';
  const SW = ['ok', 'warn', 'crit', 'friendly', 'accent', 'bg', 'ink'];
  $('themeBody').innerHTML = `<p class="lead">Cada tema cambia el mundo <b>y</b> el HUD. Puede elegir uno solo para esta pantalla o, como dueño, el de todas.</p>
    <div class="tgrid">${list.map(t => `<article class="tcard${t.id === cur ? ' on' : ''}">
      ${t.preview ? `<img class="tprev" src="${ie(t.preview)}" alt="" loading="lazy">` : ''}
      <div class="tsw">${SW.filter(k => t.palette[k]).map(k => `<i style="background:${ie(t.palette[k])}" title="${k}"></i>`).join('')}</div>
      <h4>${ie(t.name)}${t.id === cur ? ' <span class="pill ok">en uso</span>' : ''}${t.id === tm.serverDefault ? ' <span class="pill">de todas</span>' : ''}</h4>
      <p>${ie(t.description)}</p>
      <p class="dmuted">${ie(t.author)}${t.version ? ' · v' + ie(t.version) : ''}${t.license ? ' · ' + ie(t.license) : ''}</p>
      <div class="row">${t.id !== cur ? `<button class="btn small" data-tlocal="${ie(t.id)}">Usar en esta pantalla</button>` : ''}
        ${owner && t.id !== tm.serverDefault ? `<button class="btn small ghost" data-tall="${ie(t.id)}">Usar en todas</button>` : ''}</div></article>`).join('')}</div>
    ${local ? `<p class="lhelp">Esta pantalla usa un tema propio. <a href="#" id="tforget">Volver al de todas las pantallas</a></p>` : ''}
    <p class="lhelp">Tecla <b>T</b>: pasar al tema siguiente en esta pantalla. También sirve la dirección con <code>?theme=ops</code>.</p>`;
  $('themeBody').querySelectorAll('[data-tlocal]').forEach(b => b.addEventListener('click', async () => { tm.setLocal(b.dataset.tlocal); await switchTheme(b.dataset.tlocal); openThemes(); }));
  $('themeBody').querySelectorAll('[data-tall]').forEach(b => b.addEventListener('click', async () => {
    try { await post('/api/theme', { id: b.dataset.tall }); tm.serverDefault = b.dataset.tall; tm.setLocal(null); await switchTheme(b.dataset.tall); flash('Tema cambiado en todas las pantallas'); openThemes(); } catch (e) { flash(e.message); }
  }));
  $('tforget')?.addEventListener('click', async ev => { ev.preventDefault(); tm.setLocal(null); await switchTheme(tm.serverDefault); openThemes(); });
  if (!themeDlg.open) themeDlg.showModal();
}

// ---------------------------------------------------------------- resumen de proyectos (panel derecho)
async function refreshProjects() {
  const r = await fetch('/api/detail?kind=projects&id=all').then(x => x.ok ? x.json() : null).catch(() => null);
  if (!r || !r.projects) return;
  const n = r.projects.length, bad = r.projects.filter(x => x.bad || x.down).length, warn = r.projects.filter(x => !x.bad && !x.down && x.warn).length;
  $('projSub').textContent = n ? `${n} · promedio ${r.avg}` : '';
  if (!n) return;
  const worst = r.projects.slice(0, 3);
  $('proj').innerHTML = `<div class="projsum"><b class="${bad ? 'bad' : warn ? 'warn' : 'ok'}">${bad ? `${px('dotR')} ${bad} con problemas` : warn ? `${px('dotY')} ${warn} para revisar` : `${px('dotG')} todo en orden`}</b></div>
    ${worst.map(x => `<div class="projrow"><span class="score s${x.score >= 85 ? 'ok' : x.score >= 60 ? 'warn' : 'bad'}">${x.score}</span><span class="grow">${ie(x.name)}</span></div>`).join('')}`;
}
refreshProjects(); setInterval(refreshProjects, 60000);

// ---------------------------------------------------------------- novedades (CHANGELOG)
const newsDlg = $('news');
const md = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const GROUP_ICON = { 'Añadido': px('star'), 'Corregido': px('workshop'), 'Cambiado': px('refresh'), 'Seguridad': px('lock'), 'Requiere acción': px('warn'), 'Eliminado': px('trash') };
async function openNews(since) {
  const r = await fetch('/api/changelog').then(x => x.json()).catch(() => null);
  if (!r) return;
  const isNew = v => since && v.localeCompare(since, undefined, { numeric: true }) > 0;
  $('newsBody').innerHTML = r.releases.map((rel, i) => `<details class="rel${isNew(rel.version) ? ' fresh' : ''}" ${i === 0 || isNew(rel.version) ? 'open' : ''}>
    <summary><b>v${rel.version}</b><span class="dmuted">${rel.date}</span>${rel.version === r.version ? '<span class="pill ok">instalada</span>' : ''}${isNew(rel.version) ? '<span class="pill waiting">nueva</span>' : ''}</summary>
    ${rel.groups.map(g => `<h4>${GROUP_ICON[g.title] || '•'} ${md(g.title)}</h4><ul>${g.items.map(it => `<li>${md(it)}</li>`).join('')}</ul>`).join('')}
  </details>`).join('');
  if (!newsDlg.open) { newsDlg.showModal(); animate(newsDlg, { opacity: [0, 1], translateY: [16, 0], duration: 300, ease: 'outQuad' }); }
}
$('verChip').addEventListener('click', () => openNews(null));
newsDlg.querySelector('.nclose').addEventListener('click', () => newsDlg.close());
newsDlg.addEventListener('click', e => { if (e.target === newsDlg) newsDlg.close(); });

// ---------------------------------------------------------------- reloj
function clock() {
  const d = new Date();
  $('time').textContent = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
  $('date').textContent = d.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short' });
}
setInterval(clock, 1000); clock();

// ---------------------------------------------------------------- stream
function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('hello', e => {
    $('conn').hidden = true;
    const h = JSON.parse(e.data);
    // si el servidor se actualizo, esta pantalla (que puede llevar dias abierta) se recarga sola
    if (loadedVersion && h.version && h.version !== loadedVersion) {
      flash(`Atalaya se actualizó a la versión ${h.version}. Recargando…`);
      setTimeout(() => location.reload(), 2500);
      return;
    }
    loadedVersion = loadedVersion || h.version;
    applyMode(h);
    if (!chartsReady) { initCharts(h.history); chartsReady = true; }
  });
  // tema por defecto cambiado por un dueno: lo toman las pantallas que no eligieron otro
  es.addEventListener('theme', e => {
    const { id } = JSON.parse(e.data);
    tm.serverDefault = id;
    if (!tm.localChoice() && !new URLSearchParams(location.search).get('theme') && document.body.dataset.theme !== id) switchTheme(id);
  });
  es.addEventListener('mode', e => {
    const h = JSON.parse(e.data);
    const changed = !hello || h.priv !== hello.priv;
    applyMode(h);
    if (changed) { drawer.close(); clearTicker(); } // la cinta puede tener texto privado
    if (changed) flash(h.priv ? 'Modo privado activado' : 'Modo público: los detalles quedaron ocultos');
  });
  es.addEventListener('state', e => {
    state = JSON.parse(e.data);
    renderState(state);
    tm.update(state);
  });
  es.addEventListener('ev', e => {
    const ev = JSON.parse(e.data);
    if (world) world.onEvent(ev, state?.priv);
    if (state) tickerEvent(ev, state.accounts, state.priv);
  });
  es.onerror = async () => {
    $('conn').hidden = false;
    // si la sesion caduco, al login
    const r = await fetch('/api/me').catch(() => null);
    if (r && r.status === 401) { es.close(); location.href = '/login'; }
  };
}

// ---------------------------------------------------------------- telefonos y tablets
// Con pantalla chica el HUD se reacomoda (en CSS, body.compact): el mundo ocupa el centro y los paneles
// (agentes, metricas y novedades) se abren como hojas desde la barra de pestanas de abajo.
const compactMQ = matchMedia('(max-width: 1100px), (max-height: 560px)');
function openSheet(id) {
  document.body.dataset.sheet = id || '';
  document.querySelectorAll('#tabs [data-sheet]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sheet === (id || ''))));
  if (id === 'right') rethemeCharts(); // las graficas se miden al abrirse la hoja
}
function applyCompact() {
  document.body.classList.toggle('compact', compactMQ.matches);
  if (!compactMQ.matches) openSheet('');
  if (world) requestAnimationFrame(() => world.setInsets(insets()));
}
compactMQ.addEventListener('change', applyCompact);
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-sheet]'); if (b) openSheet(document.body.dataset.sheet === b.dataset.sheet ? '' : b.dataset.sheet); });
$('sheetBack').addEventListener('click', () => openSheet(''));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.dataset.sheet) openSheet(''); });
// al tocar algo dentro de una hoja se abre su detalle: la hoja se cierra para dejarle lugar
document.addEventListener('click', e => { if (document.body.classList.contains('compact') && document.body.dataset.sheet && e.target.closest('#left [data-go], #right [data-go], #ticker [data-go], #left .agent, #tall')) setTimeout(() => openSheet(''), 0); }, true);
// contadores en las pestanas
const mirror = (from, to) => new MutationObserver(() => { $(to).textContent = $(from).textContent === '0' ? '' : $(from).textContent; }).observe($(from), { childList: true, characterData: true, subtree: true });
mirror('agentCount', 'tabAgents'); mirror('tcount', 'tabEvents');
applyCompact();

(async () => {
  initKpis();
  await document.fonts.ready.catch(() => { });
  const th = await fetch('/api/themes').then(r => r.ok ? r.json() : null).catch(() => null);
  if (th) tm.serverDefault = th.current;
  await switchTheme(tm.preferred());
  addEventListener('resize', () => world && world.setInsets(insets()));
  animate(['#top', '#left', '#right', '#ticker'], { opacity: [0, 1], duration: 800, ease: 'outQuad' });
  connect();
})();
