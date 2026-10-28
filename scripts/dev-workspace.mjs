import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Read the same package-level .env file as Drizzle and the Fastify service.
// Without this preflight, a PostgreSQL DATABASE_URL defined only in .env
// is invisible here and can trigger an unintended db:push against PostgreSQL.
const backendEnv = resolve('apps', 'backend', '.env');
if (existsSync(backendEnv)) process.loadEnvFile(backendEnv);

// Local-only schema synchronization. Shared PostgreSQL migrations are deliberate.
if(!process.env.DATABASE_URL?.trim()){
  const preflight=spawnSync('pnpm',['--filter','@utomator/backend','db:push'],
    {stdio:'inherit',env:process.env,shell:process.platform==='win32'});
  if(preflight.error||preflight.status!==0){
    console.error('SQLite schema setup failed. Run pnpm --filter @utomator/backend db:push.');
    process.exit(preflight.status||1);
  }
}
// Keep both services in one foreground session so a failed process is visible.
const commands = [
  ['frontend', ['--filter', '@utomator/frontend', 'exec', 'next', 'dev', '--turbopack', '--hostname', '127.0.0.1']],
  ['backend', ['--filter', '@utomator/backend', 'dev']],
];
const children = [];
let stopping = false;
let firstExit = 0;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  firstExit = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  // Child close events keep the parent alive until shutdown.
}
for (const [label, args] of commands) {
  const env = { ...process.env };
  // A dev shell with NODE_ENV=test must not silently disable the server.
  if (env.NODE_ENV === 'test') delete env.NODE_ENV;
  const child = spawn('pnpm', args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  children.push(child);
  child.on('error', (error) => { console.error('[' + label + '] failed to launch:', error); stop(1); });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error('[' + label + '] exited unexpectedly:', code ?? signal);
      stop(code || 1);
    }
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
process.on('exit', () => { process.exitCode = firstExit; });
