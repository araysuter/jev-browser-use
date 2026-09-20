import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configurePermissions,restorePermissions,permissionConfig,permissionPaths} from '../scripts/permissions.mjs';
import {install,createCredentialFile} from '../scripts/install.mjs';
import {uninstall} from '../scripts/uninstall.mjs';

test('install, configure, uninstall and reinstall preserve credentials and restore original settings', async()=>{
 const home=await mkdtemp(join(tmpdir(),'jev-lifecycle-'));
 try {
  const paths=permissionPaths(home);
  await mkdir(join(home,'.codex'));
  const before='model = "example"\n[sandbox_workspace_write]\nnetwork_access = false # keep comment\nwritable_roots = [\n "/existing", # retain\n]\n[projects."/work"]\ntrust_level = "trusted"\n';
  await writeFile(paths.config,before);
  const envFile=await createCredentialFile({home,provider:'openrouter',apiKey:'synthetic-key-only'});
  const first=await install({home,config:{provider:'openrouter',model:'~typesafe/jev-latest',envFile}});
  assert.equal((await configurePermissions({home})).status,'configured');
  const after=await readFile(paths.config,'utf8');
  assert.ok(after.includes('network_access = true # keep comment'));
  assert.ok(after.includes('"/existing", # retain'));
  assert.ok(after.includes(JSON.stringify(paths.logs)));
  assert.equal((await stat(paths.state)).mode & 0o777,0o600);
  assert.equal((await configurePermissions({home})).status,'already_configured');
  assert.equal(await readFile(paths.config,'utf8'),after);
  await writeFile(join(first.target,'personal-note'),'keep');
  assert.equal((await uninstall({home})).status,'restored');
  assert.equal(await readFile(paths.config,'utf8'),before);
  assert.equal(await readFile(join(first.target,'personal-note'),'utf8'),'keep');
  await assert.rejects(stat(join(first.target,'SKILL.md')));
  assert.ok(await readFile(envFile,'utf8'));
  await install({home});
  assert.ok(await readFile(join(first.target,'SKILL.md'),'utf8'));
 } finally {await rm(home,{recursive:true,force:true});}
});
test('uninstall retains later user edits; new config is removed only when unchanged',async()=>{
 const home=await mkdtemp(join(tmpdir(),'jev-permissions-'));
 try {
  const paths=permissionPaths(home);
  await configurePermissions({home});
  await restorePermissions({home});
  await assert.rejects(stat(paths.config));
  await configurePermissions({home});
  const edited=(await readFile(paths.config,'utf8'))+'\n# user edit\n';
  await writeFile(paths.config,edited);
  assert.equal((await restorePermissions({home})).status,'changed_preserved');
  assert.equal(await readFile(paths.config,'utf8'),edited);
  await assert.rejects(configurePermissions({home}));
 } finally {await rm(home,{recursive:true,force:true});}
});
test('permission edits reject unsupported layouts and symlink config',async()=>{
 for(const text of ['sandbox_workspace_write.network_access = false','["sandbox_workspace_write"]\nnetwork_access = false','[sandbox_workspace_write]\nnetwork_access = "false"','x="""multiline"""']) assert.throws(()=>permissionConfig(text,'/logs'));
 const home=await mkdtemp(join(tmpdir(),'jev-symlink-'));
 try {
  await mkdir(join(home,'.codex'));
  await writeFile(join(home,'untouched'),'original');
  await symlink(join(home,'untouched'),permissionPaths(home).config);
  await assert.rejects(configurePermissions({home}));
  assert.equal(await readFile(join(home,'untouched'),'utf8'),'original');
 } finally {await rm(home,{recursive:true,force:true});}
});
