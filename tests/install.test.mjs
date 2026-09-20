import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, createCredentialFile } from '../scripts/install.mjs';

test('setup creates private credentials, copies all runtime files, and preserves existing configuration', async () => {
  const home = await mkdtemp(join(tmpdir(), 'jev-install-'));
  try {
    const envFile = await createCredentialFile({ home, provider: 'openrouter', apiKey: 'synthetic-key-for-tests' });
    assert.equal((await stat(envFile)).mode & 0o777, 0o600);
    await assert.rejects(createCredentialFile({ home, provider: 'openrouter', apiKey: 'never-overwrite-this' }));
    const result = await install({ home, config: { provider: 'openrouter', model: '~typesafe/jev-latest', envFile } });
    const config = await readFile(result.configPath, 'utf8');
    assert.ok(!config.includes('synthetic-key-for-tests'));
    for (const path of ['bridge.mjs', 'lib/state.mjs', 'lib/actions.mjs', 'lib/privacy.mjs', 'lib/telemetry.mjs', 'agents/openai.yaml', 'LICENSE']) assert.ok((await stat(join(result.target, path))).isFile());
    assert.ok((await import(`file://${result.target}/bridge.mjs`)).createSession);
    await writeFile(join(result.target, 'user-note.txt'), 'preserve');
    await install({ home, config: { provider: 'invalid' } });
    assert.equal(await readFile(result.configPath, 'utf8'), config);
    assert.equal(await readFile(join(result.target, 'user-note.txt'), 'utf8'), 'preserve');
  } finally { await rm(home, { recursive: true, force: true }); }
});
test('configure-only does not install a duplicate skill; unsafe key files are rejected', async () => {
  const home = await mkdtemp(join(tmpdir(), 'jev-config-'));
  try {
    const envFile = await createCredentialFile({ home, provider: 'typesafe', apiKey: 'synthetic-key-for-tests' });
    await chmod(envFile, 0o644);
    const config = { provider: 'typesafe', model: 'jev-latest', envFile };
    await assert.rejects(install({ home, config }));
    await chmod(envFile, 0o600);
    const result = await install({ home, config, configureOnly: true });
    assert.equal(result.installed, false); await assert.rejects(stat(result.target));
  } finally { await rm(home, { recursive: true, force: true }); }
});
test('hidden credential prompt never echoes an immediately pasted synthetic key', { skip: process.platform === 'win32' }, async () => {
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  await promisify(execFile)('python3', ['tests/hidden-input.py'], { timeout: 15000 });
});
