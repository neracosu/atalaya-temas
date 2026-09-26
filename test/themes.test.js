'use strict';
// Temas: cada carpeta de web/themes tiene un theme.json valido y un world.js con la interfaz completa.
// Uso: node test/themes.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../web/themes');
const ids = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory());
assert.ok(ids.includes('ciudad') && ids.includes('ops'), 'vienen los temas base');
const METHODS = ['init', 'update', 'onEvent', 'pick', 'clearSelection', 'setDirector', 'resetView', 'zoomBy', 'setInsets', 'destroy', 'navChanged'];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{1F000}-\u{1F2FF}]/u;
for (const id of ids) {
  const mf = path.join(dir, id, 'theme.json');
  assert.ok(fs.existsSync(mf), `${id}: falta theme.json (toda carpeta de web/themes es un tema)`);
  let m; try { m = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { assert.fail(`${id}: theme.json no es JSON válido (${e.message})`); }
  assert.strictEqual(m.id, id, `${id}: el id del manifiesto es el de la carpeta`);
  assert.ok(/^[a-z0-9][a-z0-9-]{0,30}$/.test(id), `${id}: id valido`);
  for (const k of ['name', 'description', 'author', 'version', 'license', 'world', 'rule']) assert.ok(m[k], `${id}: falta ${k}`);
  for (const k of ['ok', 'warn', 'crit', 'bg', 'ink']) assert.ok(/^#[0-9a-f]{6}$/i.test(m.palette[k] || ''), `${id}: paleta.${k}`);
  if (m.css) assert.ok(fs.existsSync(path.join(dir, id, m.css)), `${id}: falta ${m.css}`);
  // el mundo: la clase exportada (directa o reexportada) tiene la interfaz completa
  let src = fs.readFileSync(path.join(dir, id, m.world), 'utf8');
  const re = src.match(/from\s+'\/js\/([\w.-]+)'/);
  if (re && /export\s*\{[^}]*as default/.test(src)) src = fs.readFileSync(path.join(__dirname, '../web/js', re[1]), 'utf8');
  // los temas 3D heredan la interfaz del motor compartido
  if (/from\s+'\/js\/stage3d\.js'/.test(src)) src += '\n' + fs.readFileSync(path.join(__dirname, '../web/js/stage3d.js'), 'utf8');
  for (const fn of METHODS) assert.ok(new RegExp(`\\n\\s+(async\\s+)?${fn}\\s*\\(`).test(src), `${id}: al mundo le falta ${fn}()`);
  assert.ok(!/fetch\(\s*['"`]https?:/.test(src), `${id}: el mundo no se conecta a otros servidores`);
  // sin emojis en nada del tema
  for (const f of fs.readdirSync(path.join(dir, id)).filter(f => /\.(js|json|css)$/.test(f))) assert.ok(!EMOJI.test(fs.readFileSync(path.join(dir, id, f), 'utf8')), `${id}/${f}: sin emojis`);
  for (const c of m.credits || []) assert.ok(c.what && c.license, `${id}: cada credito con su licencia`);
}
console.log(`ok   temas: ${ids.join(', ')} con manifiesto, interfaz del mundo, sin emojis ni red externa`);
