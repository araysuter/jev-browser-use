# Install and configure

Requirements: Node.js 22+, Git, Codex with Computer Use and a reachable Chrome or in-app browser, and an OpenRouter or TypeSafe API key.

## One-command guided setup

Run this yourself in an interactive terminal:

```sh
npx --yes --package=github:araysuter/jev-browser-use jev-browser-use-setup
```

The wizard installs the standalone skill, asks which provider/model to use, and offers to create a local credentials file with hidden key entry or reuse an existing file. OpenRouter is the default; TypeSafe is equally supported. No key is passed on the command line or sent in chat. There are no runtime npm dependencies.

This command uses the repository's default branch. For a reviewed prerelease branch, append `#branch-name` to the GitHub package specification. Do not represent an unmerged branch as a released default-branch install.

New credentials are stored outside the repository at `~/.config/jev-browser-use/openrouter.env` or `typesafe.env`, with user-only POSIX permissions. Existing credentials and configuration are never overwritten. The file is plaintext, not an encrypted vault. Setup performs no paid API calls and no live browser task.

Start a fresh Codex task afterward. If the skill is not discovered, restart Codex or explicitly invoke `$jev-browser-use`. Installation does not intercept browser actions or install Computer Use.

## From a local checkout

```sh
git clone https://github.com/araysuter/jev-browser-use.git
cd jev-browser-use
node scripts/install.mjs
```

`node scripts/install.mjs --no-config` installs without credentials or prompts. Later, run the command without that flag to complete setup. `--help` lists options.

## Native plugin alternative

Use one route, not duplicate plugin and standalone installations:

```sh
codex plugin marketplace add araysuter/jev-browser-use
codex plugin add jev-browser-use@jev-browser-use
npx --yes --package=github:araysuter/jev-browser-use jev-browser-use-setup --configure-only
```

Check `codex plugin --help` first because availability depends on the Codex version. Restart Codex after plugin installation. The final command only configures credentials; it does not install another skill. If the CLI does not support plugins, use the standalone route.

## Updates and verification

Rerun the same setup command to update runtime files while preserving settings. The runtime consists of `SKILL.md`, `bridge.mjs`, `lib/`, `references/`, `agents/`, and `LICENSE`; copying only the bridge is insufficient.

Report installation, configuration, provider connectivity, and live browser validation separately. Before sending authenticated page text to a provider, follow the task's data-authorization rules. Secret filtering is heuristic, not a guarantee.

See [provider configuration](skills/jev-browser-use/references/provider-configuration.md) for the unchanged configuration schema and troubleshooting. For development, `npm test` exercises synthetic browser and provider fixtures without real keys or cloud changes.
