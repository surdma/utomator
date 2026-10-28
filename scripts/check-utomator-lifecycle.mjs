import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = resolve('apps', 'backend');
const child = spawn(process.execPath, ['dist/server.js'], {
  cwd, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, UTOMATOR_PORT: '3197', NODE_ENV: 'test' },
});
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += String(chunk).slice(0, 3000); });
try {
  let healthy = false;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error('Server exited early: ' + child.exitCode + '\n' + output);
    try {
      const response = await fetch('http://127.0.0.1:3197/health');
      if (response.ok && (await response.json()).status === 'ok') { healthy = true; break; }
    } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert(healthy, 'Server never became healthy: ' + output);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(child.exitCode, null, 'Server must remain running after startup');
  console.log('Utomator stayed healthy after startup and handled /health.');
} finally {
  child.kill('SIGTERM');
}
