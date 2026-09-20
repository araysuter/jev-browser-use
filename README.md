# Jev Browser Use

Jev navigates. Astra writes, reviews, and verifies.

This fork of [wy-coliney/jev-browser-use](https://github.com/wy-coliney/jev-browser-use) conserves host-model usage by keeping routine browser decisions in a bounded Jev loop using Codex's existing Computer Use connection. Both OpenRouter and direct TypeSafe are supported. No additional browser driver or runtime npm dependencies are required.

## Setup

With Node.js 22+ and Git installed, run in an interactive terminal:

```sh
npx --yes --package=github:araysuter/jev-browser-use jev-browser-use-setup
```

Choose a provider and create a private local credential file using hidden input, or select an existing one. Keys and settings stay outside the repo. Existing configuration is preserved. See [installation](INSTALL.md) for plugin setup, updates and prerelease branches. The command becomes available on the default branch when this version is merged.

Start a fresh Codex task. The skill is intended as the preferred route for suitable browser navigation; installation does not forcibly intercept every action. Computer Use must already be available.

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
