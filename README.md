# Atalaya · Kit de temas

Todo lo necesario para **diseñar un tema de Atalaya** sin tener un servidor: la interfaz real de
Atalaya, un simulador que reproduce en bucle unos minutos grabados de un servidor de verdad (en
**modo público**: sin nombres, dominios ni IPs) y la guía completa.

Un tema cambia **el mundo** (cómo se ven el servidor, las cuentas, los servicios, las visitas, los
ataques y los agentes de Claude Code) **y el HUD** (cómo se ven y dónde van los paneles).

| Tema | Mundo |
|---|---|
| `ciudad` | Ciudad isométrica: distritos, edificios, robots |
| `ops` | Radar táctico: base, sectores, contactos amigos y hostiles |
| `villa` | RPG de casillas: castillo, pueblos, aldeanos, slimes y magos |

## Empezar

Requisito: [Node.js](https://nodejs.org) 20 o superior. No hay nada que instalar.

```sh
npm start                 # o: node sim/server.js
```

- Pantalla: <http://localhost:4000/?theme=villa>
- Escenarios (caídas, ataques, permisos, despliegues, picos de visitas): <http://localhost:4000/sim>
- Tecla **T**: pasar al tema siguiente · **?**: leyenda del tema · **D**: modo director

## Crear un tema

1. Copie un tema parecido al que quiere: `cp -r web/themes/villa web/themes/mi-tema`.
2. En `web/themes/mi-tema/theme.json` cambie `id` (igual al nombre de la carpeta), `name`, `author`
   y `description`.
3. Abra <http://localhost:4000/?theme=mi-tema> y recargue cada vez que guarde.
4. `npm run check` revisa que el tema esté completo y cumpla las reglas.

La guía está en [docs/TEMAS.md](docs/TEMAS.md): qué datos recibe el mundo, qué significa cada
evento, cómo reacomodar el HUD y ejemplos de los tres temas.

## Reglas de Atalaya

- **Pixel art.** Nada de emojis, en ningún lado.
- **Inspirado, no copiado.** Géneros sí (RPG, MMO, táctico, terminal…); nombres, logos, sprites,
  fuentes o marcos de un juego existente, no.
- **Licencias claras.** Arte propio, CC0 o fuentes SIL OFL, cada recurso de terceros en `credits`.
- **Sin red externa.** Todo lo que use el tema va dentro de su carpeta.
- **Colores con significado** y **legible en una TV a tres metros**.

## Entregar un tema

Trabaje en una rama (`tema/<id>`) y abra un pull request con la carpeta `web/themes/<id>/` y una
captura. Solo esa carpeta: lo demás del kit se regenera desde Atalaya y cualquier cambio se pisa.
Antes de publicar un tema, acuerde con NERACOSU cómo se licencia y cómo se lo acredita.

## Qué hay aquí

```
web/            la interfaz de Atalaya (igual a la versión indicada en package.json)
web/themes/     los temas: aquí va el suyo
sim/            el simulador: servidor, grabación y respuestas de los paneles
docs/TEMAS.md   la guía para crear temas
test/           la revisión automática de temas (npm run check)
licenses/       licencias de las librerías y fuentes incluidas
```

---

© 2026 Neri Colón · NERACOSU. Todos los derechos reservados. Uso limitado a diseñar temas para
Atalaya.
