// Texto de cada cuenta para los temas: el que va debajo de su nombre (distrito, pueblo, grupo, sector...).
//  - en privado: "cPanel <cuenta> · <dominio principal>"
//  - en publico: cuantos servicios y sitios tiene
//  - cuentas especiales (sistema, contenedores, nube, hostings): que son
export function plural(n, uno, varios) { return `${n} ${n === 1 ? uno : varios}`; }
export function accountCaption(a, nApps, nSites) {
  const id = a.id || '';
  if (id === '_sys') return plural(nApps, 'servicio de systemd', 'servicios de systemd');
  if (id === '_docker') return plural(nApps, 'contenedor', 'contenedores');
  if (id === '_web') return plural(nSites, 'sitio del servidor', 'sitios del servidor');
  if (id.startsWith('_vercel-')) return plural(nApps, 'proyecto en Vercel', 'proyectos en Vercel');
  if (id.startsWith('_supa-')) return plural(nApps, 'base de datos', 'bases de datos');
  if (id.startsWith('_dev-')) return 'Claude Code remoto';
  if (id.startsWith('_host-')) return `Hosting compartido · ${plural(nSites, 'sitio', 'sitios')}`;
  if (a.cpanel) return `${a.panel || 'cuenta'} ${a.cpanel}${a.main ? ' · ' + a.main : ''}`;
  return `${plural(nApps, 'servicio', 'servicios')} · ${plural(nSites, 'sitio', 'sitios')}`;
}
// cuantos servicios y sitios tiene cada cuenta en el estado
export function countsByAccount(state) {
  const c = {};
  for (const a of state.apps || []) (c[a.account] = c[a.account] || { apps: 0, sites: 0 }).apps++;
  for (const s of state.sites || []) (c[s.account] = c[s.account] || { apps: 0, sites: 0 }).sites++;
  return c;
}
