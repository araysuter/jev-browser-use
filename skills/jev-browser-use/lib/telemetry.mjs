import { mkdir, open, readdir, unlink, lstat, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const defaultLogDirectory = () => join(homedir(), '.local', 'state', 'jev-browser-use', 'logs');
const outcomes = new Set(['needs_verification','blocked','low_confidence','no_progress','loading_timeout','decision_error','action_error','budget','step_limit','context_limit','sensitive_context','origin_changed','origin_unavailable','observation_error','approval_required','approval_invalid']);
const number = value => Number.isFinite(value) && value >= 0 ? value : null;

// Explicit field allowlist: never serialize an outcome/history object wholesale.
export async function writeMetrics(outcome, { directory = defaultLogDirectory(), now = new Date() } = {}) {
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryInfo = await lstat(directory);
    if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory() || (process.platform !== 'win32' && directoryInfo.uid !== process.getuid())) return false;
    await chmod(directory, 0o700);
    const day = now.toISOString().slice(0, 10);
    const cutoff = now.getTime() - 30 * 86400000;
    for (const name of await readdir(directory)) {
      if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && Date.parse(name.slice(0, 10)) < cutoff) await unlink(join(directory, name));
    }
    const record = {
      timestamp: now.toISOString(),
      provider: ['typesafe', 'openrouter'].includes(outcome.provider) ? outcome.provider : null,
      model: /^(?:~?typesafe\/)?jev-[a-z0-9.-]{1,80}$/.test(outcome.model ?? '') ? outcome.model : null,
      outcome: outcomes.has(outcome.status) ? outcome.status : 'other',
      elapsedMs: number(outcome.elapsedMs),
      ...Object.fromEntries(['apiMs', 'decisions', 'executedActions', 'decisionRetries', 'contextExpansions', 'handoffs', 'inputTokens', 'outputTokens', 'missingUsage'].map(key => [key, number(outcome.metrics?.[key])])),
    };
    const file = await open(join(directory, `${day}.jsonl`), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try {
      const info = await file.stat();
      if (!info.isFile() || (process.platform !== 'win32' && info.uid !== process.getuid())) return false;
      await file.chmod(0o600);
      await file.writeFile(JSON.stringify(record) + '\n');
    } finally { await file.close(); }
    return true;
  } catch { return false; }
}
