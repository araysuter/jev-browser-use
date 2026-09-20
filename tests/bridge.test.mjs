import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, decide, createSession, availableActions, discoverActions, reviewForm, approveSubmission, fillTextBatch } from '../skills/jev-browser-use/bridge.mjs';
import { sanitizePayload } from '../skills/jev-browser-use/lib/privacy.mjs';
import { selectContext } from '../skills/jev-browser-use/lib/state.mjs';
import { writeMetrics } from '../skills/jev-browser-use/lib/telemetry.mjs';

const origin = 'https://example.com';
const page = (body, path = '/settings') => `Browser tab: 1, Title: "Settings", URL: "${origin}${path}".\n0 AXWebArea Settings\n${body}`;
const form = () => page('1 text field Name, Value: Old\n2 text field Region, Value: East\n3 button Save');
let directory, envFile, fetchOriginal, requests;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'jev-test-'));
  envFile = join(directory, 'credentials.env');
  await writeFile(envFile, 'TYPESAFE_API_KEY=unit-credential-not-real\nOPENROUTER_API_KEY=unit-openrouter-not-real\n', { mode: 0o600 });
  fetchOriginal = globalThis.fetch;
  requests = [];
});
afterEach(async () => { globalThis.fetch = fetchOriginal; await rm(directory, { recursive: true, force: true }); });
function mockDecisions(choices = ['DONE'], options = {}) {
  let i = 0;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); requests.push({ url, body, init });
    const selected = choices[Math.min(i++, choices.length - 1)];
    const choice = typeof selected === 'function' ? selected(body) : selected;
    const criteria = body.questions.next.criteria;
    assert.ok(Object.hasOwn(criteria, choice), `Choice ${choice} absent`);
    return { ok: true, json: async () => ({ model: url.includes('openrouter') ? 'typesafe/jev-1.13' : 'jev-1.13', answers: { next: {
      type: 'choice', choice, confidence: options.confidence ?? 1,
      probabilities: Object.fromEntries(Object.keys(criteria).map(k => [k, k === choice ? 1 : 0])),
    } }, ...(options.noUsage ? {} : { usage: { input_tokens: 100, output_tokens: 5 } }) }) };
  };
}
const choose = name => body => Object.keys(body.questions.next.criteria).find(k => body.questions.next.criteria[k] === `Click ${name}`) ?? 'BLOCKED';
function tab(initial, onAction = () => {}) {
  return { state: initial, calls: [], async getAXState() { return this.state; }, async click(index) { this.calls.push(['click', index]); onAction(this, index); },
    async pressKey(...args) { this.calls.push(['pressKey', ...args]); onAction(this); }, async scroll(...args) { this.calls.push(['scroll', ...args]); onAction(this); },
    async reload() { this.calls.push(['reload']); onAction(this); },
    async setValue(index, value) { this.calls.push(['setValue', index, value]); this.state = this.state.replace(new RegExp(`^${index} (.*), Value:.*$`, 'm'), (_, prefix) => `${index} ${prefix}, Value: ${value}`); onAction(this, index); } };
}
const opts = extra => ({ envFile, allowedOrigins: [origin], goal: 'Open preferences', policy: { click: true }, logging: false, ...extra });

test('fresh navigation succeeds with usage and independent verification', async () => {
  const t = tab(page('1 button Settings'), t => { t.state = page('2 heading Preferences'); });
  mockDecisions(['a0', 'DONE']);
  const result = await run(t, opts());
  assert.equal(result.status, 'needs_verification'); assert.equal(result.metrics.inputTokens, 200); assert.equal(result.metrics.executedActions, 1);
});
test('keyboard and default scroll use the current two-argument API', async () => {
  const t = tab(page('1 heading First'), t => { t.state = page('2 heading Second'); });
  mockDecisions(['a0', 'DONE']);
  await run(t, opts({ policy: {}, controls: [{ op: 'scroll', direction: 'down' }] }));
  assert.deepEqual(t.calls[0], ['pressKey', null, 'PageDown']);
  t.calls = []; t.state = page('1 heading First'); mockDecisions(['a0', 'DONE']);
  await run(t, opts({ policy: { keys: ['Escape'] } }));
  assert.deepEqual(t.calls[0], ['pressKey', null, 'Escape']);
});
test('explicit aliases cannot bypass deny rules and unsafe keys are unavailable', async () => {
  const state = page('1 button Delete\n2 button Settings');
  assert.deepEqual(availableActions(state, [{ op: 'click', name: 'Alias', aliases: ['Delete'] }], { denyNames: [/delete/i] }), []);
  assert.deepEqual(discoverActions(state, { keys: ['Enter', 'Return', 'Space', 'super+s'] }), []);
  assert.throws(() => availableActions(state, [{ op: 'press', key: 'Enter' }]));
  mockDecisions(['DONE']); const t = tab(state);
  await run(t, opts({ controls: [{ op: 'click', name: 'Alias', aliases: ['Delete'] }], policy: { denyNames: [/delete/i] } }));
  assert.equal(t.calls.length, 0); assert.ok(!JSON.stringify(requests[0].body.questions.next.criteria).includes('Alias'));
});
test('submission requires review even with broad discovery', async () => {
  mockDecisions(); const t = tab(form());
  assert.equal((await run(t, opts())).status, 'approval_required'); assert.equal(requests.length, 0); assert.deepEqual(t.calls, []);
});
test('valid review grants one submission, never a replay', async () => {
  const t = tab(form()); const review = await reviewForm(t, opts());
  const approval = approveSubmission(t, { review, name: 'Save' });
  assert.throws(() => approveSubmission(t, { review, name: 'Save' }));
  mockDecisions([choose('Save')]);
  const result = await run(t, opts({ approval }));
  assert.equal(result.status, 'approval_required'); assert.equal(t.calls.length, 1);
  await run(t, opts({ approval })); assert.equal(t.calls.length, 1);
});
test('changed fields, destinations, or cross-tab approval cannot submit', async () => {
  for (const mutation of [s => s.replace('Old', 'Changed'), s => s.replace('/settings', '/other')]) {
    const t = tab(form()); const approval = approveSubmission(t, { review: await reviewForm(t, opts()), name: 'Save' });
    t.state = mutation(t.state); mockDecisions(); await run(t, opts({ approval })); assert.equal(t.calls.length, 0);
    const other = tab(form()); await run(other, opts({ approval })); assert.equal(other.calls.length, 0);
  }
});
test('approval never overrides a denied action or an attempted action error', async () => {
  const t = tab(form()); const review = await reviewForm(t, opts()); const approval = approveSubmission(t, { review, name: 'Save' });
  mockDecisions(); await run(t, opts({ approval, policy: { click: true, denyNames: ['Save'] } })); assert.equal(t.calls.length, 0);
  t.click = async () => { t.calls.push('attempt'); throw new Error('private details'); };
  mockDecisions([choose('Save')]); assert.equal((await run(t, opts({ approval }))).status, 'action_error');
  await run(t, opts({ approval })); assert.equal(t.calls.length, 1);
});
test('explicit navigation on a form remains available but submit names stay gated', async () => {
  const t = tab(form() + '\n4 tab Overview', t => { t.state = page('1 heading Overview'); });
  mockDecisions([choose('Overview'), 'DONE']);
  await run(t, opts({ controls: [{ op: 'click', name: 'Overview', kind: 'navigation' }, { op: 'click', name: 'Save', kind: 'navigation' }] }));
  assert.deepEqual(t.calls, [['click', 4]]);
});
test('batch fills exact host values and requires fresh review', async () => {
  const t = tab(form());
  const result = await fillTextBatch(t, opts({ expectedState: t.state, fields: [{ name: 'Name', value: 'Literal $& name' }, { name: 'Region', value: 'West' }] }));
  assert.equal(result.status, 'needs_review'); assert.equal(result.completed, 2); assert.ok(t.state.includes('Literal $& name'));
  mockDecisions(); assert.equal((await run(t, opts())).status, 'approval_required');
});
test('batch validates all fields before writing and stops for new warnings', async () => {
  const t = tab(form()); const state = t.state;
  assert.equal((await fillTextBatch(t, opts({ expectedState: state, fields: [{ name: 'Name', value: 'New' }, { name: 'Missing', value: 'x' }] }))).status, 'field_unavailable');
  assert.equal(t.calls.length, 0);
  const changing = tab(form(), t => { t.state += '\n8 alert Changed by server'; });
  const result = await fillTextBatch(changing, opts({ expectedState: changing.state, fields: [{ name: 'Name', value: 'New' }, { name: 'Region', value: 'West' }] }));
  assert.equal(result.status, 'form_changed'); assert.equal(changing.calls.length, 1);
});
test('uncertainty gets exactly three progressively broader requests', async () => {
  const state = page(Array.from({ length: 100 }, (_, i) => `${i + 1} text Context ${i}`).join('\n') + '\n101 button Settings');
  const t = tab(state); mockDecisions(['BLOCKED']);
  const result = await run(t, opts());
  assert.equal(result.status, 'blocked'); assert.equal(requests.length, 3); assert.equal(result.metrics.contextExpansions, 2);
  const lengths = requests.map(r => r.body.state.browser.length);
  assert.ok(lengths[0] < lengths[1] && lengths[1] < lengths[2]); assert.equal(t.calls.length, 0);
});
test('low confidence also escalates three times without acting', async () => {
  mockDecisions(['a0'], { confidence: 0.2 }); const t = tab(page('1 button Settings'));
  assert.equal((await run(t, opts())).status, 'low_confidence'); assert.equal(requests.length, 3); assert.equal(t.calls.length, 0);
});
test('failed click is not repeated; navigation cycles terminate', async () => {
  const stuck = tab(page('1 button Settings')); mockDecisions([choose('Settings')]);
  await run(stuck, opts()); assert.equal(stuck.calls.length, 1);
  const cycling = tab(page('1 button A'), t => { t.state = t.state.includes('button A') ? page('1 button B') : page('1 button A'); });
  mockDecisions(['a0']); const result = await run(cycling, opts());
  assert.equal(result.handoff, 'cycle'); assert.equal(cycling.calls.length, 4);
});
test('AX reindexing resolves current target without stale clicks', async () => {
  const t = tab(page('1 button Settings'), t => { t.state = page('5 heading Preferences'); }); let reads = 0;
  t.getAXState = async () => { if (++reads === 2) t.state = page('7 button Settings'); return t.state; };
  mockDecisions(['a0', 'DONE']); await run(t, opts()); assert.deepEqual(t.calls, [['click', 7]]);
});
test('page changes during a decision never execute its old target', async () => {
  const t = tab(page('1 button Settings')); mockDecisions(['a0']); const f = globalThis.fetch;
  globalThis.fetch = async (...args) => { const result = await f(...args); t.state += '\n8 alert New warning'; return result; };
  await run(t, opts()); assert.equal(t.calls.length, 0);
});
test('provider authorization and quota errors are terminal and sanitized', async () => {
  for (const status of [401, 403, 429]) {
    let count = 0; globalThis.fetch = async () => { count++; return { ok: false, status, text: async () => 'SECRET RESPONSE' }; };
    const result = await run(tab(page('1 button Settings')), opts()); assert.equal(result.status, 'decision_error'); assert.equal(count, 1); assert.ok(!JSON.stringify(result).includes('SECRET RESPONSE'));
  }
});
test('both adapters preserve selected provider and parse usage', async () => {
  for (const provider of ['typesafe', 'openrouter']) {
    mockDecisions(); const result = await run(tab(page('1 heading Done')), opts({ provider }));
    assert.equal(result.status, 'needs_verification'); assert.equal(result.provider, provider); assert.equal(result.metrics.outputTokens, 5);
  }
  assert.ok(requests.some(r => r.url.includes('openrouter.ai/api/alpha/decisions')));
});
test('missing usage is explicitly unknown', async () => {
  mockDecisions(['DONE'], { noUsage: true }); const result = await run(tab(page('1 heading Done')), opts());
  assert.equal(result.metrics.inputTokens, null); assert.equal(result.metrics.missingUsage, 1);
});
test('unsafe credential permissions stop before network access', async () => {
  await chmod(envFile, 0o644); mockDecisions();
  assert.equal((await run(tab(page('1 button Settings')), opts())).handoff, 'credential_permissions'); assert.equal(requests.length, 0);
});
test('sanitizes secrets in state, goal, history, and action descriptions', async () => {
  mockDecisions();
  await decide({ envFile, goal: 'Open unit-credential-not-real', state: page('1 text field Password, Value: secretpass\n2 text field API key, Value: unknownformat'),
    actions: [{ description: 'Click sk-abcdefghijklmnopqrstuv' }], history: [{ action: 'token=sk-abcdefghijklmnopqrstuv' }] });
  const wire = JSON.stringify(requests[0].body);
  for (const secret of ['unit-credential-not-real', 'secretpass', 'unknownformat', 'sk-abcdefghijklmnopqrstuv']) assert.ok(!wire.includes(secret));
  assert.ok(wire.includes('[hidden]'));
});
test('ambiguous sensitive text stops before transmitting', async () => {
  mockDecisions(); const result = await run(tab(page('1 text My password is somewhere in this prose\n2 button Settings')), opts());
  assert.equal(result.status, 'sensitive_context'); assert.equal(requests.length, 0);
  assert.throws(() => sanitizePayload({ goal: 'Use the secret from earlier' }));
});
test('large irrelevant pages can be focused; essential overflow hands back', async () => {
  const state = page('1 button Settings\n' + Array.from({ length: 2000 }, (_, i) => `${i + 2} text irrelevant row ${i}`).join('\n'));
  assert.ok(state.length > 24000); assert.ok(selectContext(state, availableActions(state, [{ op: 'click', name: 'Settings' }])).length < 24000);
  mockDecisions(); assert.equal((await run(tab(state), opts())).status, 'needs_verification');
  const huge = page('1 heading ' + 'x'.repeat(40000));
  assert.equal((await run(tab(huge), opts())).status, 'context_limit');
});
test('session retains progress and host checkpoint, reset clears it', async () => {
  const t = tab(page('1 button Settings'), t => { t.state = page('2 heading Preferences'); });
  const session = createSession(t, opts()); mockDecisions(['a0', 'BLOCKED']); await session.run({});
  session.checkpoint('Reached preferences'); mockDecisions(['DONE']); const result = await session.run({});
  assert.equal(result.sessionMetrics.executedActions, 1); assert.equal(requests.at(-1).body.state.checkpoint, 'Reached preferences');
  session.reset(); assert.equal(session.metrics().decisions, 0);
});
test('metadata logging excludes arbitrary content, rotates old files, and cannot fail work', async () => {
  const directory = join(envFile, '..', 'logs'); await mkdir(directory);
  await writeFile(join(directory, '2020-01-01.jsonl'), 'old'); await writeFile(join(directory, 'keep.txt'), 'keep');
  const ok = await writeMetrics({ status: 'needs_verification', provider: 'typesafe', model: 'jev-1.13', state: 'PRIVATE PAGE', history: ['PRIVATE HISTORY'], error: 'PRIVATE ERROR', metrics: { inputTokens: 5, extra: 'PRIVATE METRIC' } }, { directory });
  assert.equal(ok, true); const files = await readdir(directory); assert.ok(!files.includes('2020-01-01.jsonl')); assert.ok(files.includes('keep.txt'));
  const content = await readFile(join(directory, files.find(f => f.endsWith('.jsonl'))), 'utf8'); assert.ok(!content.includes('PRIVATE')); assert.equal(JSON.parse(content).inputTokens, 5);
  assert.equal(await writeMetrics({}, { directory: envFile }), false);
});
test('real CUA focus footer changes do not stop an otherwise exact batch', async () => {
  const t = tab(form() + '\n\nThe focused UI element is 0 AXWebArea Settings');
  const setValue = t.setValue.bind(t);
  t.setValue = async (index, value) => { await setValue(index, value); t.state = t.state.replace(/^The focused UI element is .*$/m, `The focused UI element is ${index} text field (settable) Description: Field, Value: ${value}`); };
  const result = await fillTextBatch(t, opts({ expectedState: t.state, fields: [{ name: 'Name', value: 'New' }, { name: 'Region', value: 'West' }] }));
  assert.equal(result.completed, 2); assert.equal(result.status, 'needs_review');
});
test('multiline sensitive values and generic token labels are redacted', () => {
  const result = sanitizePayload({ browser: '1 text area API key, Value: lineone\nlinetwo\n2 text field Token, Value: anotherunknown\n3 button Settings' });
  const text = JSON.stringify(result.value);
  for (const secret of ['lineone', 'linetwo', 'anotherunknown']) assert.ok(!text.includes(secret));
  assert.ok(text.includes('Settings'));
});
test('empty native text fields without a Value suffix accept exact batched text', async () => {
  const t = tab(page('1 text field (settable) Description: Name\n2 button Save'));
  t.setValue = async (index, value) => { t.state = page(`1 text field (settable) Description: Name, Value: ${value}\n2 button Save`); };
  const result = await fillTextBatch(t, opts({ expectedState: t.state, fields: [{ name: 'Name', value: 'New' }] }));
  assert.equal(result.status, 'needs_review'); assert.equal(result.completed, 1);
});
test('observed changed state permanently invalidates an approval even if later restored', async () => {
  const t = tab(form()); const approval = approveSubmission(t, { review: await reviewForm(t, opts()), name: 'Save' });
  t.state = form().replace('Old', 'Unexpected'); mockDecisions(); await run(t, opts({ approval }));
  t.state = form(); await run(t, opts({ approval })); assert.equal(t.calls.length, 0);
});
test('leaving an allowed origin stops further decisions', async () => {
  const t = tab(page('1 button Settings'), t => { t.state = page('1 button Settings').replace(origin, 'https://elsewhere.example'); });
  mockDecisions(['a0']); const result = await run(t, opts()); assert.equal(result.status, 'origin_changed'); assert.equal(requests.length, 1);
});
test('transport retry is bounded and decision schema is validated', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('private transport text'); };
  const result = await run(tab(page('1 button Settings')), opts()); assert.equal(calls, 2); assert.equal(result.handoff, 'transport'); assert.ok(!JSON.stringify(result).includes('private transport'));
  mockDecisions(['DONE']); const real = globalThis.fetch;
  globalThis.fetch = async (...args) => { const r = await real(...args); const body = await r.json(); body.answers.next.probabilities.DONE = 0.2; return { ok: true, json: async () => body }; };
  assert.equal((await run(tab(page('1 button Settings')), opts())).handoff, 'schema');
});
