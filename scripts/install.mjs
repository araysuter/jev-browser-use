#!/usr/bin/env node
import { cp, mkdir, realpath, stat, writeFile, chmod, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { readCredential } from '../skills/jev-browser-use/lib/privacy.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const models = { typesafe: 'jev-latest', openrouter: '~typesafe/jev-latest' };
const keyNames = { typesafe: 'TYPESAFE_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
const runtimeFiles = ['SKILL.md', 'bridge.mjs', 'lib', 'references', 'agents'];
async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory() || (process.platform !== 'win32' && info.uid !== process.getuid())) throw new Error('Unsafe configuration directory');
  await chmod(path, 0o700);
}
export async function createCredentialFile({ home = homedir(), provider, apiKey }) {
  if (!Object.hasOwn(models, provider) || typeof apiKey !== 'string' || !/^[A-Za-z0-9._~+-]{8,}$/.test(apiKey)) throw new Error('Invalid provider or credential');
  const directory = join(home, '.config', 'jev-browser-use');
  await privateDirectory(directory);
  const path = join(directory, `${provider}.env`);
  // Never overwrite an existing key. Nothing returns or prints the supplied value.
  await writeFile(path, `${keyNames[provider]}=${JSON.stringify(apiKey)}\n`, { mode: 0o600, flag: 'wx' });
  return path;
}

/** Existing configuration and unrelated installed files survive updates. */
export async function install({ source = sourceRoot, home = homedir(), config, configureOnly = false } = {}) {
  source = await realpath(source);
  const target = join(home, '.agents', 'skills', 'jev-browser-use');
  const configPath = join(home, '.config', 'jev-browser-use', 'config.json');
  const canonicalTarget = await exists(target) ? await realpath(target) : resolve(target);
  const distance = relative(source, canonicalTarget);
  if (!distance || (!distance.startsWith('..') && !isAbsolute(distance))) throw new Error('Choose a source outside the installed skill directory');
  const preserveConfig = await exists(configPath);
  if (config && !preserveConfig) {
    if (!Object.hasOwn(models, config.provider)) throw new Error('Choose typesafe or openrouter');
    const pattern = config.provider === 'typesafe' ? /^jev-[a-z0-9.-]{1,80}$/ : /^(?:~?typesafe\/)?jev-[a-z0-9.-]{1,80}$/;
    if (!pattern.test(config.model ?? '')) throw new Error('Invalid Jev model');
    if (!isAbsolute(config.envFile ?? '')) throw new Error('Use an absolute credential file path');
    await readCredential(config.envFile, keyNames[config.provider]);
  }
  const skillSource = join(source, 'skills', 'jev-browser-use');
  for (const name of runtimeFiles) await stat(join(skillSource, name));
  await stat(join(source, 'LICENSE'));
  if (!configureOnly) {
    await mkdir(target, { recursive: true });
    for (const name of runtimeFiles) await cp(join(skillSource, name), join(target, name), { recursive: true });
    await cp(join(source, 'LICENSE'), join(target, 'LICENSE'));
  }
  if (config && !preserveConfig) {
    await privateDirectory(dirname(configPath));
    await writeFile(configPath, JSON.stringify({ provider: config.provider, model: config.model, envFile: config.envFile }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  return { target, configPath, configured: preserveConfig || Boolean(config), installed: !configureOnly };
}

async function ask(question) {
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await prompts.question(question)).trim(); } finally { prompts.close(); }
}
// readline handles editing and terminal mode; discard its echo while reading the key.
// Never accept a key as a command-line argument, environment dump, or chat message.
export async function readHiddenCredential() {
  const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const prompts = createInterface({ input: process.stdin, output: silent, terminal: true });
  process.stdout.write('Paste API key, or press Enter to use an existing credentials file (hidden; stored locally, never tested automatically): ');
  try { return (await prompts.question('')).trim(); }
  finally { prompts.close(); process.stdout.write('\n'); }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: jev-browser-use-setup [--no-config | --configure-only]\nInstalls the skill and guides local API-key setup. Existing configuration is preserved.\n--no-config installs without prompts. --configure-only configures an existing plugin without installing a duplicate skill.');
    return;
  }
  if (args.some(a => !['--no-config', '--configure-only'].includes(a)) || args.length > 1) throw new Error('Unknown or conflicting options');
  const configPath = join(homedir(), '.config', 'jev-browser-use', 'config.json');
  let config;
  if (!args.includes('--no-config') && !(await exists(configPath))) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Use an interactive terminal for setup, or --no-config');
    const provider = (await ask('Provider [openrouter / typesafe] (default openrouter): ')) || 'openrouter';
    if (!Object.hasOwn(models, provider)) throw new Error('Choose openrouter or typesafe');
    const model = (await ask(`Model [${models[provider]}]: `)) || models[provider];
    const apiKey = await readHiddenCredential();
    const path = join(homedir(), '.config', 'jev-browser-use', `${provider}.env`);
    let envFile;
    if (apiKey) {
      if (await exists(path)) throw new Error('Credential file already exists; rerun and press Enter to use it');
      envFile = await createCredentialFile({ provider, apiKey });
    } else {
      const defaultPath = await exists(path) ? path : '';
      envFile = (await ask(`Absolute path to your private dotenv file${defaultPath ? ` [${defaultPath}]` : ''}: `)) || defaultPath;
    }
    config = { provider, model, envFile };
  }
  const result = await install({ config, configureOnly: args.includes('--configure-only') });
  console.log(`${result.installed ? 'Skill installed.' : 'Plugin files unchanged.'} ${result.configured ? 'Local configuration present; provider connectivity has not been tested.' : 'Provider configuration pending; run setup interactively later.'} Start a fresh Codex task. Computer Use must already be available.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Setup failed. Check provider/model, private credential file permissions, and whether a credential file already exists. Use --help. No key values are printed.');
    process.exitCode = 1;
  });
}
