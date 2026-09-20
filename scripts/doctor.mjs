#!/usr/bin/env node
import {doctor,loadConfig} from '../skills/jev-browser-use/bridge.mjs';
if (process.argv.includes('--help')) console.log('Usage: node scripts/doctor.mjs [--live]\nChecks credentials and logging. --live makes one small paid synthetic provider request. Terminal success does not prove browser-runtime access.');
else if (process.argv.slice(2).some(arg=>arg !== '--live')) { console.error('Unknown option. Use --help.'); process.exitCode=1; }
else {
  try {
    const result = await doctor({...await loadConfig(),live:process.argv.includes('--live')});
    console.log(JSON.stringify({runtime:'terminal',...result}, null, 2));
    console.log('Repeat doctor inside a fresh Codex Computer Use runtime before considering setup verified.');
    if ([result.credentials,result.logging,result.providerConnection].some(value=>!['ok','not_tested'].includes(value))) process.exitCode=1;
  } catch { console.error('Configuration unavailable. Run setup.'); process.exitCode=1; }
}
