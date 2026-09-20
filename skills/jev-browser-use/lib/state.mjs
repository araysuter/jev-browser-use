import { createHash } from 'node:crypto';

export class HandoffError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export const clickRoles = new Set(['button', 'link', 'checkBox', 'checkbox', 'radio button', 'radioButton', 'menu item', 'menuItem', 'tab']);
export const textRoles = new Set(['text field', 'text area', 'textField', 'textArea', 'combo box', 'comboBox', 'secure text field']);
export const safeKeys = new Set(['Escape', 'Tab', 'Shift+Tab', 'PageUp', 'PageDown', 'Home', 'End']);
export const submissionName = /\b(save|submit|send|publish|deploy|delete|remove|purchase|buy|pay|confirm|approve|authorize|grant|create|apply|enable|disable|revoke|invite|accept|continue|next|finish|done|update|connect|install)\b/i;

export function parseState(state) {
  return state.split('\n').flatMap((line, lineNumber) => {
    const m = line.trim().match(/^(\d+) (secure text field|text field|text area|combo box|radio button|menu item|[\w]+)(?: \([^)]*\))? (?:Description: )?(.*)$/);
    if (!m) return [];
    const name = m[3];
    const valueAt = name.indexOf(', Value:');
    return [{ index: Number(m[1]), role: m[2], name,
      label: valueAt < 0 ? name : name.slice(0, valueAt),
      hasValue: valueAt >= 0, value: valueAt < 0 ? (['text field', 'text area', 'textField', 'textArea'].includes(m[2]) ? '' : undefined) : name.slice(valueAt + 8).replace(/^ /, ''), lineNumber }];
  });
}

export function matchesName(observed, expected) {
  return observed === expected || observed?.startsWith(`${expected}, Value:`);
}

export function matchesPattern(name, pattern) {
  if (pattern instanceof RegExp) { pattern.lastIndex = 0; return pattern.test(name); }
  return typeof pattern === 'string' && matchesName(name, pattern);
}

export function checkState(state, allowedOrigins) {
  const url = state.match(/^Browser tab:.* URL: "([^"]+)"\./m)?.[1];
  let origin;
  try { origin = new URL(url).origin; } catch { throw new HandoffError('origin_unavailable'); }
  if (!allowedOrigins?.includes(origin)) throw new HandoffError('origin_changed');
  return url;
}

// Ignore AX index renumbering and the duplicated focus footer. Keep page values, warnings and destination.
export function fingerprint(state) {
  return createHash('sha256').update(state.replace(/^The focused UI element is .*$/gm, '').replace(/^(\s*)\d+ /gm, '$1')).digest('hex');
}

export function requiresApproval(action, state, policy = {}) {
  if (action.op !== 'click') return false;
  const names = [action.name, action.observedName].filter(Boolean);
  if (action.kind === 'submit' || names.some(n => submissionName.test(n)) ||
      (policy.requireCodexNames ?? []).some(p => names.some(n => matchesPattern(n, p)))) return true;
  // Unknown buttons/links on forms are not assumed to be harmless navigation.
  return action.kind !== 'navigation' && parseState(state).some(e => textRoles.has(e.role));
}

export function permitted(action, policy = {}) {
  if (action.op === 'press') return safeKeys.has(action.key);
  if (action.op !== 'click') return true;
  const names = [action.name, action.observedName].filter(Boolean);
  if ((policy.denyNames ?? []).some(p => names.some(n => matchesPattern(n, p)))) return false;
  return !policy.allowNames?.length || policy.allowNames.some(p => names.some(n => matchesPattern(n, p)));
}

export function actionKey(action) {
  return JSON.stringify([action.op, action.observedName ?? action.name, action.direction, action.amount,
    action.key, action.targetName, action.point]);
}

// Preserve structural ancestors and safety context, then widen around matches.
// Never silently truncate mandatory context; an oversized request hands back.
export function selectContext(state, actions, level = 0, focusNames = []) {
  if (level === 2) return state;
  const lines = state.split('\n');
  const keep = new Set();
  const essential = /\b(project|account|organization|tenant|workspace|warning|error|alert|dialog|heading|selected|invalid|required|denied|permission|failed|text field|text area|combo box|secure text field)\b/i;
  const indices = new Set(actions.flatMap(a => [a.index, typeof a.target === 'number' ? a.target : undefined]).filter(Number.isInteger));
  const seeds = [];
  lines.forEach((line, i) => {
    const index = Number(line.trim().match(/^(\d+) /)?.[1]);
    if (i < 12 || essential.test(line) || indices.has(index) || focusNames.some(n => line.includes(n))) seeds.push(i);
  });
  const radius = level === 0 ? 3 : 15;
  for (const i of seeds) {
    for (let j = Math.max(0, i - radius); j <= Math.min(lines.length - 1, i + radius); j++) keep.add(j);
    let indent = lines[i].search(/\S/);
    for (let j = i - 1; j >= 0 && indent > 0; j--) {
      const parentIndent = lines[j].search(/\S/);
      if (parentIndent >= 0 && parentIndent < indent) { keep.add(j); indent = parentIndent; }
    }
  }
  let previous = -1;
  return [...keep].sort((a, b) => a - b).map(i => {
    const prefix = i > previous + 1 ? '[unrelated page content omitted]\n' : '';
    previous = i;
    return prefix + lines[i];
  }).join('\n');
}
