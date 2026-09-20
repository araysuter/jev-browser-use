import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute } from 'node:path';
import { parseEnv } from 'node:util';
import { HandoffError } from './state.mjs';

const label = /\b(password|passwd|passphrase|secret|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|token|otp|verification[ _-]?code|recovery[ _-]?code|private[ _-]?key|client[ _-]?secret|authorization|credential)\b/i;
const known = /\b(?:sk-(?:or-v1-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;

export async function readCredential(envFile, keyName) {
  if (typeof envFile !== 'string' || !isAbsolute(envFile)) throw new HandoffError('credential_missing');
  let file;
  try {
    file = await open(envFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await file.stat();
    if (!info.isFile() || (process.platform !== 'win32' && ((info.mode & 0o077) || info.uid !== process.getuid()))) {
      throw new HandoffError('credential_permissions');
    }
    const env = parseEnv(await file.readFile('utf8'));
    const key = env[keyName] ?? env[keyName.toLowerCase()];
    if (!key) throw new HandoffError('credential_missing');
    return key;
  } catch (error) {
    if (error instanceof HandoffError) throw error;
    throw new HandoffError('credential_unavailable');
  } finally { await file?.close(); }
}

// Deterministic heuristics, not a DLP guarantee. Ambiguous sensitive prose fails closed.
export function sanitizePayload(payload, secrets = []) {
  let redactions = 0;
  function sanitizeString(input) {
    let text = input;
    for (const secret of secrets.filter(Boolean)) {
      if (text.includes(secret)) { text = text.split(secret).join('[hidden]'); redactions++; }
    }
    text = text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, () => { redactions++; return '[hidden private key]'; });
    text = text.replace(known, () => { redactions++; return '[hidden]'; });
    text = text.replace(/\bBearer\s+[^\s"',}]+/gi, () => { redactions++; return 'Bearer [hidden]'; });
    let redactContinuation = false;
    return text.split('\n').map(line => {
      if (redactContinuation && line.trim() && !/^\s*\d+ \w/.test(line) && !line.startsWith('The focused UI element')) { redactions++; return '[hidden continuation]'; }
      redactContinuation = false;
      if (!label.test(line) && !/secure text field/i.test(line)) return line;
      // AX field values and explicit key/value assignments can be isolated.
      const value = line.match(/^(.*?, Value:\s*)(.*)$/i);
      if (value) { redactContinuation = true; redactions++; return `${value[1]}[hidden]`; }
      const assignment = line.match(/^(.*?\b(?:password|passwd|passphrase|secret|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|token|otp|verification[ _-]?code|recovery[ _-]?code|client[ _-]?secret|authorization|credential)\b\s*[=:]\s*)(.+)$/i);
      if (assignment) { redactions++; return `${assignment[1]}[hidden]`; }
      // Labels without values are safe; free text about secrets is not sent.
      if (/^\s*\d+ (?:secure text field|text field|text area|combo box|button|link|heading)\b/i.test(line) && !/[=:]/.test(line)) return line;
      if (line.includes('[hidden')) return line;
      throw new HandoffError('sensitive_context');
    }).join('\n');
  }
  function visit(value) {
    if (typeof value === 'string') return sanitizeString(value);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => {
      const cleanKey = sanitizeString(key);
      if (label.test(key) && v !== null && v !== undefined) { redactions++; return [cleanKey, '[hidden]']; }
      return [cleanKey, visit(v)];
    }));
    return value;
  }
  return { value: visit(payload), redactions };
}

export function sensitiveField(name) { return label.test(name); }
