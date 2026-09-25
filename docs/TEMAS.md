# Crear un tema para Atalaya

Un tema cambia **el mundo** (cómo se dibujan el servidor, las cuentas, los servicios, las visitas,
los ataques y los agentes) **y el HUD** (cómo se ven y dónde van los paneles). No es una paleta de
colores: es otra forma de mirar el mismo servidor.

Atalaya trae tres temas que sirven de ejemplo:

| Tema | Mundo | HUD |
|---|---|---|
| `ciudad` | Ciudad isométrica: distritos, edificios, robots | Paneles a los lados, cinta abajo |
| `ops` | Radar táctico polar: base, sectores, contactos | Lecturas arriba, parte de operaciones arriba a la derecha, esquinas de mira |
| `villa` | RPG de casillas desde arriba: castillo, pueblos, aldeanos, slimes, magos | Marcos de madera, barras de estado a la derecha, registro tipo chat abajo a la izquierda |

`villa` es el ejemplo más completo de **arte hecho en código**: todas las texturas (pasto, caminos,
murallas, casas, castillo, personajes) se pintan con funciones o matrices de caracteres, sin
archivos de imagen.

## 1. La carpeta

```
web/themes/<id>/
  theme.json     obligatorio: nombre, paleta, layout, leyenda, créditos
  world.js       obligatorio: el mundo (módulo ES con una clase por defecto)
  theme.css      opcional: el HUD de este tema
  preview.png    opcional: captura para el selector de temas
  ...            sprites, fuentes (woff2) y lo que el tema necesite
```

El `<id>` va en minúsculas, con números y guiones (`villa`, `raid`, `terminal-crt`). Atalaya
encuentra la carpeta sola: no hay que registrar nada ni reiniciar.

Para probarlo en una pantalla sin cambiar las demás: `https://SU-ATALAYA/?theme=<id>`, o la tecla
**T**, o el menú › **Tema**.

## 2. `theme.json`

```json
{
  "id": "villa",
  "name": "Villa",
  "description": "Qué es el mundo, en una o dos frases.",
  "author": "Su nombre",
  "version": "1.0.0",
  "license": "La del tema, y la de cada recurso de terceros",
  "world": "world.js",
  "css": "theme.css",
  "preview": "preview.png",
  "hud": { "layout": "barra-lateral" },
  "palette": { "ok": "#…", "warn": "#…", "crit": "#…", "hostile": "#…", "friendly": "#…", "accent": "#…", "bg": "#…", "ink": "#…" },
  "rule": "La regla de oro del tema, en una frase.",
  "credits": [{ "what": "Fuente X", "author": "…", "license": "SIL OFL 1.1", "url": "…" }],
  "legend": [
    { "title": "El mundo", "items": [
      { "icon": "house", "title": "Casa", "text": "Un servicio." },
      { "color": "#ff4d3d", "title": "Rojo", "text": "Caído." }
    ] }
  ]
}
```

- **`palette` tiene significado, no decoración.** `ok` sano, `warn` alerta, `crit` falla,
  `hostile` ataque, `friendly` lo propio, `accent` un solo color de marca, `bg` fondo, `ink` texto.
  El administrador de temas las publica como variables CSS `--t-ok`, `--t-warn`, etc., y el mundo
  las recibe en `manifest.palette`.
- **`hud.layout`** queda en `body[data-layout]`, por si varios temas comparten un layout.
- **`legend`** es lo que muestra la tecla `?`. `icon` es un ícono pixel de Atalaya
  (`web/js/pixicons.js`: `house`, `invader`, `bot`, `shield`, `db`, `web`, `terminal`, `chart`,
  `antenna`, `refresh`, `warn`, `ok`, …) o `color` para un punto de color.
- **`rule`**: la regla que no se rompe. Ejemplos: «nada redondeado ni brillante» (Ops), «la
  información vive en la ciudad antes que en números» (Ciudad).

## 3. `world.js`: el mundo

Un módulo ES que exporta **por defecto** una clase. PixiJS 8 se importa desde
`/vendor/pixi.csp.mjs`. El administrador de temas la usa así:

```js
const w = new World(contenedorDom, { manifest });   // manifest = el theme.json
await w.init();                                      // crear el canvas dentro del contenedor
w.update(state);                                     // cada ~2 s: el estado completo
w.onEvent(evento, priv);                             // cada evento en vivo
w.destroy();                                         // al cambiar de tema: quitar canvas y escuchas
```

Métodos que la pantalla llama:

| Método | Para qué |
|---|---|
| `pick(kind, id)` | Enfocar algo y avisar con `onSelect(kind, id)` (abre el panel de detalle) |
| `clearSelection()` | El panel de detalle se cerró |
| `setInsets({ top, right, bottom, left })` | Cuánto espacio ocupan los paneles del HUD: el mundo se encuadra en el resto |
| `setDirector(bool)`, `directorOn` | Modo director (cámara automática), tecla D |
| `resetView()`, `zoomBy(f)` | Botones de navegación |
| `navChanged()` | Avisar el estado de la cámara con `onNav({ mode: 'director' \| 'fixed' \| 'manual', left })` |

Callbacks que la pantalla le asigna al mundo:

- `onSelect(kind, id)`: el usuario tocó algo. `kind` ∈ `app`, `site`, `session`, `district`,
  `system`, `security`.
- `onTip({ title, body, meta, hint } | null, x, y)`: tooltip al pasar el mouse. `body` y `meta`
  admiten HTML simple; todo texto que venga del servidor pásenlo por `esc()` de `/js/hud.js`.
- `onNav(estado)`: para el botón de cámara.

Reglas técnicas:

- **Todas las escuchas globales** (`window.addEventListener`) con un `AbortController`, y
  `destroy()` las quita. Si no, al cambiar de tema quedan escuchas vivas.
- En Pixi 8 un `Graphics` no debe tener hijos: los textos van en un `Container` aparte.
- Para un look pixel: `resolution: 0.5` (o menos), `antialias: false` y
  `canvas.style.imageRendering = 'pixelated'` (así lo hace Ops).

### El estado (`update(state)`)

```js
{
  priv: false,                       // modo privado: si es true, hay nombres reales
  system: { cpu, cores, load: [1, 5, 15], mem: { total, used, pct }, uptime, ... },
  accounts: [{ id, label, color, reqMin, sites, claudeProcs }],     // 'root' = el servidor
  apps:  [{ id, account, name, kind, icon, source, status, cpu, mem, reqMin, instances, online }],
  sites: [{ id, account, name, kind, icon, type, status, reqMin, lastSeen }],
  sessions: [{ id, account, state, station, activity, waitKind, subagents: [...], tokensOut, tools }],
  keys: [{ label, unit, state }],    // servicios clave: 'active' | 'failed' | 'inactive'
  security: { ... }, mail: { ... }, traffic: [...], top: [...]
}
```

- `status`: `online`, `degraded` o `down`.
- `source`: `pm2`, `systemd`, `docker`, `vercel` o `supabase`. `type` (sitios): `wordpress`,
  `php`, `static`, `proxy` o `wip`.
- `icon`: nombre de un cartel pixel (`shop`, `hotel`, `calendar`, `card`, `wp`, `db`, …).
- `state` de una sesión: `working`, `thinking` o `idle`. `waitKind` (`permission`, `question`,
  `idle`) si espera al usuario.
- En **modo público** los nombres ya vienen reemplazados por categorías y alias: el tema no
  tiene que esconder nada, pero **no debe guardar ni mostrar** nada que no reciba.

### Los eventos (`onEvent(e, priv)`)

| `e.kind` | Campos útiles | Qué pasó |
|---|---|---|
| `http` | `app` o `site`, `account`, `status`, `bot`, `cc` | Una visita (`status` ≥ 500 = error del servidor) |
| `attack` | — | Un intento de acceso fallido |
| `block` | `ip` (solo en privado) | Una IP quedó bloqueada |
| `login` | `user` (solo en privado) | Un acceso SSH correcto |
| `mail` | `dir`: `in`, `out`, `bounce` | Correo |
| `deploy` | `app`, `action`: `building`, `ready`, `error`, `canceled` | Un despliegue |
| `pm2` | `app`, `action`: `down`, `restart` | Un servicio cayó o se reinició |
| `domain` | `account`, `action`: `added`, `removed`, `changed` | Cambió un dominio |
| `claude` | `sid`, `account`, `action`: `permission`, `approved`, `tool`, `prompt`, `done`, `error` | Un agente hizo algo |

## 4. `theme.css`: el HUD

El HUD es el mismo HTML para todos los temas (mismos `id`), y cada tema lo **reacomoda y
restiliza**. Todo el CSS del tema va bajo `body[data-theme="<id>"]` para no pisar a otros.

| Elemento | Qué es |
|---|---|
| `#top` | Barra superior: marca, indicadores (`.kpi`), modo, reloj y menú |
| `#left` | Agentes de Claude Code (`.agent`) |
| `#right` | Gráficas (`#chCpu`, `#chReq`), procesos, proyectos, defensa y correo |
| `#ticker` / `#log .ev` | Cinta de novedades (Ops la vuelve una columna arriba a la derecha) |
| `#navbar` | Botones de cámara |
| `.drawer` | Panel de detalle |
| `dialog` | Leyenda, temas, novedades, instalar |

Variables que conviene redefinir: `--bg`, `--panel`, `--panel-solid`, `--line`, `--line-strong`,
`--ink`, `--ink-2`, `--ink-3`, `--accent`, `--good`, `--warn`, `--bad`, `--radius`, `--font`,
`--pixel`, `--mono`, y los colores de las gráficas `--chart-1` a `--chart-4`.

Se puede **mover** cada panel (`top`, `left`, `right`, `bottom`, `width`), **esconderlo**
(`display: none`) o cambiarle el título con CSS (ver `#left h2 .pix::after` en Ops).

**El espacio del mundo.** Por defecto, Atalaya mide dónde quedaron los paneles y encuadra el mundo en
lo que sobra. Si el tema pone paneles en las esquinas, conviene declarar el rectángulo exacto con
`#worldArea` (un elemento invisible que solo sirve para medir):

```css
body[data-theme="villa"] #worldArea { display: block; top: 6.4rem; bottom: 1.2rem;
  left: calc(19vw + 2.6rem); right: calc(22vw + 2.6rem); }
```

Fuentes: dentro de la carpeta del tema, con `@font-face` y ruta relativa (`url(mi-fuente.woff2)`).

## 5. Reglas de Atalaya

- **Pixel art.** Sprites, íconos y mundo en pixel art. **Nada de emojis**, en ningún lado.
- **Inspirado, no copiado.** Se puede tomar un género (RPG de casillas, raid de MMO, operaciones
  tácticas, terminal), nunca nombres, logos, sprites, fuentes ni marcos de un juego existente.
- **Licencias claras.** Arte propio, CC0 (Kenney, parte de OpenGameArt) o fuentes SIL OFL. Cada
  recurso de terceros va en `credits` con su licencia.
- **Sin red externa.** La pantalla bloquea toda conexión que no sea con el propio Atalaya (CSP).
  Todo lo que el tema use va dentro de su carpeta.
- **Colores con significado.** El verde, el ámbar y el rojo dicen algo; no se usan de adorno.
- **Legible en una TV a tres metros.** Pocas cifras grandes; el resto, en forma y movimiento.

## 6. Probar

1. Copie `web/themes/ops` a `web/themes/<id>` y cambie el `id` en `theme.json`.
2. Abra `https://SU-ATALAYA/?theme=<id>` y recargue al guardar.
3. Revise con la consola del navegador abierta que no haya errores, que el cambio con la tecla
   **T** vaya y vuelva sin dejar nada colgado, y que en modo público no aparezca nada privado.
4. `npm test` revisa que el manifiesto sea válido y que `world.js` exporte una clase con la
   interfaz completa.
