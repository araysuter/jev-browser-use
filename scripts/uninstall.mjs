#!/usr/bin/env node
import { lstat, rm, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { restorePermissions } from './permissions.mjs';

export async function uninstall({home = homedir()} = {}) {
  const target = join(home, '.agents', 'skills', 'jev-browser-use');
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isDirectory() || (process.platform !== 'win32' && info.uid !== process.getuid())) throw new Error('Unsafe install directory');
    for (const name of ['SKILL.md','bridge.mjs','lib','references','agents','LICENSE']) await rm(join(target,name), {recursive:true,force:true});
    try { await rmdir(target); } catch (error) { if (error.code !== 'ENOTEMPTY') throw error; }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return await restorePermissions({home});
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('Usage: node scripts/uninstall.mjs\nRemoves the standalone skill and restores unchanged setup-managed Codex permissions. Preserves credentials, logs, source checkout, and unrelated files. Does not uninstall a native marketplace plugin.');
  else if (process.argv.length > 2) { console.error('Unknown option. Use --help.'); process.exitCode=1; }
  else uninstall().then(result => {
    console.log('Standalone skill removed. Credentials, settings, logs and source checkout preserved.');
    console.log(result.status === 'changed_preserved' ? 'Codex settings changed since setup: permissions were preserved. Review config.toml and the private permissions-backup.json before removing the Jev log root or restoring network access.' : `Permission restoration: ${result.status}.`);
    console.log('Restart Codex before testing a reinstall.');
  }).catch(() => { console.error('Uninstall could not finish. Check local file permissions; no credentials were printed.'); process.exitCode=1; });
}
