# Jev Browser Use

Jev navigates. Astra writes, reviews, and verifies.

This fork of [wy-coliney/jev-browser-use](https://github.com/wy-coliney/jev-browser-use) conserves host-model usage by keeping routine browser decisions in a bounded Jev loop using Codex's existing Computer Use connection. Both OpenRouter and direct TypeSafe are supported. No additional browser driver or runtime npm dependencies are required.

## Setup

With Node.js 22+ and Git installed, run in an interactive terminal:

```sh
git clone https://github.com/araysuter/jev-browser-use.git "$HOME/.jev-browser-use" && node "$HOME/.jev-browser-use/scripts/install.mjs"
```

Paste your API key at the hidden prompt, or press Enter to use an existing credentials file. Existing keys/settings are preserved. Then answer **y** if you want setup to configure Codex's required network and log-directory access. The prompt explains that network access applies to workspace-write tasks generally, not just Jev. Setup preserves the sandbox mode and approval policy.

**Restart Codex and start a fresh task**, then ask it to use `$jev-browser-use` to run the live doctor check and test navigation on example.com. A successful install alone does not establish browser-runtime connectivity. The live check makes one small paid synthetic API request. See [installation and troubleshooting](INSTALL.md) for details.

### Update

```sh
git -C "$HOME/.jev-browser-use" pull --ff-only && node "$HOME/.jev-browser-use/scripts/install.mjs"
```

### Uninstall

```sh
git -C "$HOME/.jev-browser-use" pull --ff-only && node "$HOME/.jev-browser-use/scripts/uninstall.mjs"
```

Removes the standalone skill and restores setup-managed permissions if Codex config has not changed since setup. Preserves API keys, settings, logs, source checkout, and later user configuration edits. Reinstall with `node "$HOME/.jev-browser-use/scripts/install.mjs"`, then restart Codex. Native marketplace plugins must be removed through Codex plugin management.

The skill is the preferred route for suitable navigation when available; it does not forcibly intercept browser actions. Computer Use must already be installed.

## Workflow

1. Astra defines the objective and permitted actions.
2. Jev navigates using observed controls.
3. Local code enters batches of exact Astra-authored text.
4. Astra reviews fresh form values, using a screenshot when useful.
5. Jev performs the specific, single-use approved submission and continues.
6. Astra independently verifies the final result.

Jev receives structured text, not screenshots. It cannot invent text, selectors, URLs or coordinates. Unknown or consequential controls require host review; required user confirmations still apply. Approval cannot override denied actions or changes to the reviewed page.

Uncertain navigation gets up to three decisions with progressively richer context. Repeated ineffective actions and cycles stop for Astra. Session progress survives handoffs; there is no learned route memory between tasks. Unsupported widgets and visual/semantic judgment remain with Astra.

## Privacy and measurements

Outgoing requests are filtered locally for recognizable secrets, sensitive field values and the configured provider key. Ambiguous sensitive content hands back without transmission. This is a heuristic safeguard, not guaranteed redaction or permission to share private pages. The selected provider receives the remaining request text.

Metadata-only logs are stored under `~/.local/state/jev-browser-use/logs`, retained for 30 days. They include provider-reported usage, timing, actions, retries and handoffs, never page content or credentials. Summaries are shown only when requested. These logs do not measure exact Astra subscription savings. No speedup is claimed without measurements on the workflow being tested.

## Development

```sh
npm test
```

Tests use synthetic browser observations and mocked provider responses. GitHub Actions runs them on Node 22 and 24. Live provider access, skill discovery and a watched browser task are separate acceptance checks. Start with a simple user-specified Cloudflare task and inspect the actual result and handoffs.

The [skill](skills/jev-browser-use/SKILL.md) documents runtime usage, [form workflow](skills/jev-browser-use/references/workflow.md) explains reviewed submission, and [provider configuration](skills/jev-browser-use/references/provider-configuration.md) documents credentials and endpoints.

MIT licensed. Independent integration, not an official OpenAI, OpenRouter or TypeSafe product.
