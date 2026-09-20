# Provider setup

Both TypeSafe and OpenRouter are supported. No automatic provider fallback occurs.

From a checkout, run `node scripts/install.mjs` in an interactive terminal. The wizard offers provider/model selection, creating a private local credential file with hidden input, or reusing an existing private dotenv file. Existing configuration and keys are never overwritten. Use `--configure-only` if a plugin is already installed, to avoid a duplicate standalone skill. Use `--no-config` to install runtime files before a key is available.

The public command is documented in the repository's INSTALL.md. Never request a key in chat, pass it as a command-line argument, or display a dotenv file.

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
- Transport failures: at most one retry by default, within the chunk budget.
- First connection test: use a synthetic goal and browser state, not a private authenticated page. State clearly that it is a live paid API request when arranging the test.
- Default context cap is 28,000 UTF-8 request bytes including instructions, choices and history, conservatively below the current 32K context window; no character/4 token assumption is made. If the task cannot fit, return to Astra. Model-specific token counts come from the provider when present.

References: [TypeSafe](https://docs.typesafe.ai/introduction), [OpenRouter Jev](https://openrouter.ai/~typesafe/jev-latest).
