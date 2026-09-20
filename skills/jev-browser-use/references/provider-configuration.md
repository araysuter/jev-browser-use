# Provider setup

Both TypeSafe and OpenRouter are supported. No automatic provider fallback occurs.

From a checkout, run `node scripts/install.mjs` in an interactive terminal. The wizard offers provider/model selection, creating a private local credential file with hidden input, or reusing an existing private dotenv file. Existing configuration and keys are never overwritten. Use `--configure-only` if a plugin is already installed, to avoid a duplicate standalone skill. Use `--no-config` to install runtime files before a key is available.

The public clone-and-run command is documented in the repository's INSTALL.md; an optional npx entry point is available where npm permits Git packages. Never request a key in chat, pass it as a command-line argument, or display a dotenv file.

## Existing format (unchanged)

`~/.config/jev-browser-use/config.json` stores only:

```json
{
  "provider": "openrouter",
  "model": "~typesafe/jev-latest",
  "envFile": "/absolute/path/to/private/credentials.env"
}
```

| Provider | Default model | Credential variable | Endpoint |
|---|---|---|---|
| OpenRouter | `~typesafe/jev-latest` | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/alpha/decisions` |
| TypeSafe | `jev-latest` | `TYPESAFE_API_KEY` | `https://api.typesafe.ai/v1/systemone` |

New files are created at `~/.config/jev-browser-use/openrouter.env` or `typesafe.env`. On POSIX systems credential files must be regular, owned by the current user, not symlinks, and inaccessible to group/other users (mode 0600 or stricter). Configuration directories are mode 0700. Existing shared files are rejected with `credential_permissions`; the user can intentionally restrict their file or create a separate private credential file. Windows users should use an account-private directory; POSIX mode checks do not provide Windows ACL enforcement.

Credentials are plaintext local files, not an encrypted vault. The key is used only in the provider authorization header and is removed from model input if encountered. Provider replies are validated; raw error bodies are never returned. Configuration presence does not prove connectivity or API access.

## Troubleshooting

- Missing configuration: rerun the wizard. Never search unrelated files for keys.
- Existing configuration: setup preserves it. Deliberate provider changes should edit the three non-secret settings, with the user's authorization.
- Authentication/quota/permissions/schema failures: stop and report the category; do not blindly retry or switch providers.
- DNS/network access: `network_dns` means hostname resolution failed; `network_denied` means the runtime reported a permission denial. These return immediately without retrying. The selected provider must be reachable from the Computer Use Node runtime itself. A successful connection from a terminal does not prove this. Check supported host network settings or contact the host support team; reinstalling the skill or changing keys does not grant network access. Do not bypass restrictions with another process or disable TLS verification.
- Transport failures: at most one retry by default, within the chunk budget.
- First connection test: use a synthetic goal and browser state, not a private authenticated page. State clearly that it is a live paid API request when arranging the test.
- Default context cap is 28,000 UTF-8 request bytes including instructions, choices and history, conservatively below the current 32K context window; no character/4 token assumption is made. If the task cannot fit, return to Astra. Model-specific token counts come from the provider when present.

References: [TypeSafe](https://docs.typesafe.ai/introduction), [OpenRouter Jev](https://openrouter.ai/~typesafe/jev-latest).

## Setup permissions and diagnostics

The interactive installer offers an explicit opt-in to update `~/.codex/config.toml`: enable `[sandbox_workspace_write].network_access` and add the private Jev log directory to `writable_roots`. This affects workspace-write tasks generally, not just this skill or a single provider domain. It keeps the sandbox mode and approval policy unchanged. The installer preserves other settings and stores a private rollback snapshot. Unsupported TOML layouts require manual configuration rather than a guessed rewrite.

Restart Codex and verify in a fresh Computer Use runtime with `doctor({...await loadConfig(), live:true})`. Managed policies, profiles, or app overrides may supersede config.toml. If access remains blocked, inspect that task's effective permissions; do not assume the wizard can override host policy. `logging: unavailable` means logs could not be written, not that no browser work occurred.

Terminal-only diagnostics: `node scripts/doctor.mjs`; add `--live` for one small paid synthetic provider check. Do not run that check automatically during installation. Logs include runtime version and an allowlisted failure category, never raw errors.

`node scripts/uninstall.mjs` removes the standalone skill and restores setup-managed Codex settings only if the config has not changed since setup. It keeps credentials, logs and the source checkout. If config changed, it leaves it untouched and reports the need for manual review. See the root INSTALL.md for complete commands and native-plugin differences.
