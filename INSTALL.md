# Install and configure

Requirements: Node.js 22+, Git, Codex with Computer Use, and an OpenRouter or TypeSafe key. No runtime npm dependencies or extra browser driver.

## First installation

Run in your own interactive terminal, from any directory:

```sh
git clone https://github.com/araysuter/jev-browser-use.git "$HOME/.jev-browser-use" && node "$HOME/.jev-browser-use/scripts/install.mjs"
```

The source checkout stays in hidden `~/.jev-browser-use`. If it already exists, use the update command below instead of cloning over it.

The wizard:

1. Installs the standalone skill at `~/.agents/skills/jev-browser-use`.
2. Asks for provider/model (OpenRouter is the default). Paste a hidden API key, or press Enter to choose an existing credential file. Existing settings and keys are preserved.
3. Explains and asks before configuring Codex network and logging permissions. Answer **y** to apply them. Declining leaves permissions unchanged and Jev may remain blocked.
4. Asks you to restart Codex and verify from a fresh task.

New keys live at `~/.config/jev-browser-use/openrouter.env` or `typesafe.env`, with user-only permissions. Settings live alongside them in `config.json`. These are local plaintext files, not an encrypted vault. Never paste keys into chat. Installation makes no paid provider request.

## What permission setup changes

Jev's decision requests run inside the Computer Use runtime. A browser can load websites while this runtime has no outbound network access. Similarly, its logging folder can be outside the writable sandbox.

With your consent, setup edits `~/.codex/config.toml`, keeping unrelated settings:

```toml
[sandbox_workspace_write]
network_access = true
writable_roots = ["/absolute/path/to/your/home/.local/state/jev-browser-use/logs"]
```

**This enables outbound networking for workspace-write tasks generally, not only Jev or OpenRouter.** It does not enable full-access mode or change the approval policy. Existing writable roots are retained. Setup creates the log directory with user-only permissions and saves a private rollback snapshot at `~/.config/jev-browser-use/permissions-backup.json`.

The automatic editor handles ordinary bare-key sandbox tables and arrays. It refuses ambiguous layouts such as quoted/dotted sandbox tables or multiline strings. If setup reports that it cannot configure permissions, manually merge the two settings above into your existing table, retaining your actual absolute path and existing roots; do not add a duplicate table. Consult [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

Managed policies, permission profiles, and app overrides may take precedence. Setup cannot grant access against an enforced host policy. Do not disable sandboxing to hide a failed check.

## Verify in the actual runtime

**Restart Codex and start a fresh task.** Ask:

> Use $jev-browser-use to run its live doctor check, then test navigation on example.com if the checks pass.

The doctor sends one small paid synthetic provider request without private browser text. It reports runtime version, credentials, logging, and provider connection. All three checks should be `ok` before treating setup as verified. Skill discovery, successful provider connection, and successful browser navigation are separate checks. Installing a skill does not intercept every browser action.

Optional terminal diagnostics:

```sh
node "$HOME/.jev-browser-use/scripts/doctor.mjs"
node "$HOME/.jev-browser-use/scripts/doctor.mjs" --live
```

The first checks credentials/logging without a provider request; the second adds a paid synthetic request. **Terminal success does not prove browser-runtime access.** If the fresh task still reports `network_dns` or `network_denied`, inspect its effective network permissions. `logging: unavailable` indicates a failed log write; inspect the effective writable roots. Logs exclude page text, URLs, key values, screenshots, and raw errors.

## Updates

```sh
git -C "$HOME/.jev-browser-use" pull --ff-only && node "$HOME/.jev-browser-use/scripts/install.mjs"
```

Run Git commands against the hidden source checkout, not `~/.agents/skills/jev-browser-use` (the installed skill is not a Git repository). Settings and keys survive updates. Permission setup is idempotent; if you edited Codex config since setup, it preserves your edits and asks for manual review.

## Uninstall and reinstall

Fetch the latest scripts first, then uninstall:

```sh
git -C "$HOME/.jev-browser-use" pull --ff-only && node "$HOME/.jev-browser-use/scripts/uninstall.mjs"
```

Uninstall removes the standalone skill's files and restores the original Codex permission configuration **only if unchanged since setup**. If you edited config afterward, it leaves it untouched and reports that manual review is required; it never restores an old whole-file backup over your newer edits. Unrelated files at the skill root are retained. Credentials, settings, logs, and the hidden source checkout are preserved, so you do not need to paste your key again.

Reinstall:

```sh
node "$HOME/.jev-browser-use/scripts/install.mjs"
```

Answer **y** to the explained permission setup, then restart Codex and run the fresh-task doctor/navigation test above. Uninstall is not a credential purge.

## Other installation modes

`node scripts/install.mjs --no-config` copies only skill files without prompting or editing Codex permissions. Run interactive setup later. `--configure-only` runs credential and permission setup for an existing native plugin without installing a duplicate standalone skill. `--help` lists options.

An optional npm entry point is packaged: `npx --yes --package=github:araysuter/jev-browser-use jev-browser-use-setup`. Some npm installations prohibit Git packages; use clone-and-run rather than weakening those settings.

For a native plugin, use one route, not both:

```sh
codex plugin marketplace add araysuter/jev-browser-use
codex plugin add jev-browser-use@jev-browser-use
node "$HOME/.jev-browser-use/scripts/install.mjs" --configure-only
```

First clone the hidden source checkout if needed, and check `codex plugin --help` for availability. The standalone uninstall script does not remove marketplace plugins; uninstall those through Codex plugin management. You may still run the script to restore its managed permissions. Restart after changes.

For development, `npm test` uses synthetic observations and mocked providers. See [provider configuration](skills/jev-browser-use/references/provider-configuration.md) and [workflow](skills/jev-browser-use/references/workflow.md).
