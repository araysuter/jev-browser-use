import { readFile, writeFile, mkdir, lstat, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const digest = text => createHash('sha256').update(text).digest('hex');
export const permissionPaths = (home = homedir()) => ({
  config: join(home, '.codex', 'config.toml'),
  state: join(home, '.config', 'jev-browser-use', 'permissions-backup.json'),
  logs: join(home, '.local', 'state', 'jev-browser-use', 'logs'),
});
async function privatePath(path, directory = false) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || (process.platform !== 'win32' && info.uid !== process.getuid())) throw new Error('Unsafe setup path');
  return info;
}
async function optionalRead(path) {
  try { await privatePath(path); return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// A deliberately narrow editor: preserve other TOML verbatim and refuse ambiguous syntax.
// Network booleans and array insertion do not require interpreting unrelated settings.
export function permissionConfig(text, logDirectory) {
  if (/'''|"""/.test(text) || /^\s*(?:"sandbox_workspace_write"|'sandbox_workspace_write'|sandbox_workspace_write\s*[.=])/m.test(text)) throw new Error('Unsupported TOML layout; configure permissions manually');
  const lines = text.split('\n');
  const headers = lines.flatMap((line, i) => /^\s*\[/.test(line) ? [{line, i}] : []);
  const matches = headers.filter(({line}) => /^\s*\[sandbox_workspace_write\]\s*(?:#.*)?$/.test(line));
  if (matches.length > 1 || headers.some(({line}) => /sandbox_workspace_write/.test(line) && !/^\s*\[sandbox_workspace_write\]\s*(?:#.*)?$/.test(line))) throw new Error('Unsupported sandbox table');
  let start = matches[0]?.i;
  if (start === undefined) {
    return text + (text.endsWith('\n') ? '' : '\n') + '\n[sandbox_workspace_write]\nnetwork_access = true\nwritable_roots = [' + JSON.stringify(logDirectory) + ']\n';
  }
  const end = headers.find(h => h.i > start)?.i ?? lines.length;
  const section = lines.slice(start + 1, end);
  if (section.some(line => /^\s*["'](?:network_access|writable_roots)["']/.test(line))) throw new Error('Unsupported quoted permission key');
  const network = section.flatMap((line,i) => /^\s*network_access\s*=/.test(line) ? [i] : []);
  if (network.length > 1) throw new Error('Duplicate network setting');
  if (network.length) {
    const i = network[0];
    if (!/^\s*network_access\s*=\s*(?:true|false)\s*(?:#.*)?$/.test(section[i])) throw new Error('Unsupported network setting');
    section[i] = section[i].replace(/(=\s*)(?:true|false)/, '$1true');
  } else section.unshift('network_access = true');
  const roots = section.flatMap((line,i) => /^\s*writable_roots\s*=/.test(line) ? [i] : []);
  if (roots.length > 1) throw new Error('Duplicate writable roots');
  if (roots.length) {
    const i = roots[0];
    if (!/^\s*writable_roots\s*=\s*\[/.test(section[i])) throw new Error('Unsupported writable roots');
    // Insert at array start; TOML allows trailing commas, comments and multiline arrays.
    section[i] = section[i].replace(/(=\s*\[)/, (_, prefix) => prefix + JSON.stringify(logDirectory) + ', ');
  } else section.unshift('writable_roots = [' + JSON.stringify(logDirectory) + ']');
  return [...lines.slice(0,start+1), ...section, ...lines.slice(end)].join('\n');
}

export async function configurePermissions({home = homedir()} = {}) {
  const paths = permissionPaths(home);
  await mkdir(dirname(paths.config), {recursive:true, mode:0o700});
  await privatePath(dirname(paths.config), true);
  await mkdir(dirname(paths.state), {recursive:true, mode:0o700});
  const stateDir = await privatePath(dirname(paths.state), true);
  if (process.platform !== 'win32' && (stateDir.mode & 0o077)) throw new Error('Private setup directory required');
  const current = await optionalRead(paths.config);
  const existing = await optionalRead(paths.state);
  if (existing) {
    const saved = JSON.parse(existing);
    if (digest(current ?? '') !== saved.afterHash) throw new Error('Codex config changed since setup; review permissions manually');
    return {status:'already_configured'};
  }
  const next = permissionConfig(current ?? '', paths.logs);
  await mkdir(paths.logs, {recursive:true, mode:0o700});
  const logInfo = await privatePath(paths.logs, true);
  if (process.platform !== 'win32' && (logInfo.mode & 0o077)) throw new Error('Private log directory required');
  await writeFile(paths.state, JSON.stringify({before:current, afterHash:digest(next)}), {mode:0o600,flag:'wx'});
  // Refuse to overwrite a file changed during setup.
  if (await optionalRead(paths.config) !== current) throw new Error('Codex config changed during setup');
  await writeFile(paths.config, next, {mode:0o600});
  return {status:'configured'};
}

export async function restorePermissions({home = homedir()} = {}) {
  const paths = permissionPaths(home);
  const raw = await optionalRead(paths.state);
  if (!raw) return {status:'not_managed'};
  const saved = JSON.parse(raw);
  const current = await optionalRead(paths.config);
  if (digest(current ?? '') !== saved.afterHash) return {status:'changed_preserved'};
  if (saved.before === null) await rm(paths.config);
  else await writeFile(paths.config, saved.before, {mode:0o600});
  await rm(paths.state);
  return {status:'restored'};
}
