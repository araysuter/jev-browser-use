"""Exercise the public setup/uninstall commands with an isolated home and no real keys."""
import json
import os
import pty
import select
import subprocess
import tempfile
import time
import tomllib
from pathlib import Path

with tempfile.TemporaryDirectory(prefix='jev-cli-') as directory:
    home = Path(directory)
    settings = home / '.config/jev-browser-use'
    settings.mkdir(parents=True, mode=0o700)
    credential = settings / 'openrouter.env'
    credential.write_text('OPENROUTER_API_KEY=synthetic-cli-only\n')
    credential.chmod(0o600)
    config = settings / 'config.json'
    config.write_text(json.dumps(dict(provider='openrouter', model='~typesafe/jev-latest', envFile=str(credential))))
    config.chmod(0o600)
    env = dict(os.environ, HOME=directory)
    env.pop('CODEX_HOME', None)
    master, slave = pty.openpty()
    child = subprocess.Popen(['node', 'scripts/install.mjs'], stdin=slave, stdout=slave, stderr=slave, env=env)
    os.close(slave)
    data = b''
    sent = False
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            readable, _, _ = select.select([master], [], [], 0.1)
            if readable:
                try:
                    chunk = os.read(master, 4096)
                except OSError:
                    break
                if not chunk:
                    break
                data += chunk
                if b'Configure these Codex permissions? [y/N]:' in data and not sent:
                    os.write(master, b'y\r')
                    sent = True
            if child.poll() is not None and not readable:
                break
        assert sent and child.wait(timeout=5) == 0
    finally:
        if child.poll() is None:
            child.terminate()
        child.wait()
        os.close(master)
    permissions = tomllib.loads((home / '.codex/config.toml').read_text())
    assert permissions['sandbox_workspace_write']['network_access'] is True
    assert str(home / '.local/state/jev-browser-use/logs') in permissions['sandbox_workspace_write']['writable_roots']
    assert b'synthetic-cli-only' not in data
    subprocess.run(['node','scripts/uninstall.mjs'], env=env, check=True, capture_output=True)
    assert not (home / '.agents/skills/jev-browser-use/SKILL.md').exists()
    assert not (home / '.codex/config.toml').exists()
    assert credential.exists() and config.exists()
    subprocess.run(['node','scripts/install.mjs','--no-config'], env=env, check=True, capture_output=True)
    assert (home / '.agents/skills/jev-browser-use/SKILL.md').exists()
    assert not (home / '.codex/config.toml').exists()
