# Atalaya · Kit de temas

Todo lo necesario para **diseñar un tema de Atalaya** sin tener un servidor: la interfaz real de
Atalaya, un simulador que reproduce en bucle unos minutos grabados de un servidor de verdad (en
**modo público**: sin nombres, dominios ni IPs) y la guía completa.

Un tema cambia **el mundo** (cómo se ven el servidor, las cuentas, los servicios, las visitas, los
ataques y los agentes de Claude Code) **y el HUD** (cómo se ven y dónde van los paneles).

## Los temas que ya vienen

| Tema | Técnica | Mundo |
|---|---|---|
| `ciudad` | 2D, PixiJS | Ciudad isométrica en pixel art: distritos, edificios, robots e invasores |
| `villa` | 2D, PixiJS | RPG de casillas: castillo, pueblos amurallados, aldeanos, slimes y magos |
| `raid` | 2D, PixiJS | Banda de MMO: héroes con vida y maná, números de combate y El Intruso |
| `oficina` | 2D, PixiJS | Piso de oficina isométrico estilo hotel virtual, con globos de diálogo |
| `castillo` | 2D, PixiJS | Castillo gótico de costado: candelabros, vitrales, murciélagos y espectros |
| `ciudad3d` | 3D, three.js | La ciudad de noche: torres que crecen con la memoria |
| `acuario` | 3D, three.js | Una pared de peceras: una por cuenta, con la placa de sus peces |
| `ops` | 3D, three.js | Mesa táctica holográfica con fichas de sector |
| `planta` | 3D, three.js | Fábrica con paleta PICO-8: máquinas, cintas y drones |
| `terminal` | Solo HTML | Consola de fósforo verde con ventanas de texto |

Sirven de ejemplo y de punto de partida: copie el más parecido al que quiere hacer.

## Empezar

Requisito: [Node.js](https://nodejs.org) 20 o superior. No hay nada que instalar.

```sh
npm start                 # o: node sim/server.js
```

- Pantalla: <http://localhost:4000/?theme=oficina>
- Escenarios (caídas, ataques, permisos, despliegues, picos de visitas): <http://localhost:4000/sim>
- Tecla **T**: pasar al tema siguiente · **?**: leyenda del tema · **D**: modo director
- Para ver la versión de teléfono: la ventana angosta, o las herramientas de dispositivo del navegador.

## Crear un tema

1. Copie un tema parecido: `cp -r web/themes/oficina web/themes/mi-tema`.
2. En `web/themes/mi-tema/theme.json` cambie `id` (igual al nombre de la carpeta), `name`, `author`
   y `description`.
3. Abra <http://localhost:4000/?theme=mi-tema> y recargue cada vez que guarde.
4. `npm run check` revisa que el tema esté completo y cumpla las reglas.

La guía está en [docs/TEMAS.md](docs/TEMAS.md): qué datos recibe el mundo, qué significa cada
evento, cómo reacomodar el HUD, el motor 3D compartido, las placas que nombran cada proyecto, los
favicons y cómo se ve en teléfonos y tablets.

## Reglas de Atalaya

- **Pixel art como acento, textos nítidos.** Nunca bajar la resolución de todo el lienzo. Nada de
  emojis, en ningún lado.
- **Inspirado, no copiado.** Géneros sí (RPG, MMO, táctico, terminal…); nombres, logos, sprites,
  fuentes o marcos de un juego existente, no.
- **Cada proyecto se ubica sin hacer clic**: una placa o lista por cuenta, o nombres al acercarse.
- **Licencias claras.** Arte propio, CC0 o fuentes SIL OFL, cada recurso de terceros en `credits`.
- **Sin red externa.** Todo lo que use el tema va dentro de su carpeta.
- **Colores con significado** y **legible en una TV a tres metros**.

## Entregar un tema

Trabaje en una rama (`tema/<id>`) y abra un pull request con la carpeta `web/themes/<id>/` y una
captura. Solo esa carpeta: lo demás del kit se regenera desde Atalaya y cualquier cambio se pisa.
Antes de publicar un tema, acuerde con NERACOSU cómo se licencia y cómo se lo acredita.

## Qué hay aquí

```
web/              la interfaz de Atalaya (igual a la versión indicada en package.json)
web/themes/       los temas: aquí va el suyo
web/js/stage3d.js motor compartido de los temas 3D
web/js/layout.js  agrupar por cuenta, repartir en filas y armar placas (2D y 3D)
sim/              el simulador: servidor, grabación y respuestas de los paneles
docs/TEMAS.md     la guía para crear temas
test/             la revisión automática de temas (npm run check)
licenses/         licencias de las librerías y fuentes incluidas
```

---

© 2026 Neri Colón · NERACOSU. Todos los derechos reservados. Uso limitado a diseñar temas para
Atalaya.
