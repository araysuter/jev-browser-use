"""Exercise real terminal echo behavior with a synthetic credential, never a real key."""
import os
import pty
import select
import subprocess
import time

master, slave = pty.openpty()
code = "import {readHiddenCredential} from './scripts/install.mjs'; const value=await readHiddenCredential(); console.log(value==='synthetic-hidden-test'?'HIDDEN_INPUT_PASS':'FAIL');"
process = subprocess.Popen(['node', '--input-type=module', '-e', code], stdin=slave, stdout=slave, stderr=slave)
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
            if b'stored locally' in data and not sent:
                os.write(master, b'synthetic-hidden-test\r')
                sent = True
        if process.poll() is not None and not readable:
            break
    assert sent and b'HIDDEN_INPUT_PASS' in data and b'synthetic-hidden-test' not in data
finally:
    if process.poll() is None:
        process.terminate()
    process.wait()
    os.close(master)
