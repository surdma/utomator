import { buildApp } from './main.js';

const port = Number(process.env.UTOMATOR_PORT || 3101);
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('Invalid UTOMATOR_PORT');

const app = buildApp();
// Hosted workers run in separate process groups. If the gateway disappears,
// terminate this group, including browser subprocesses, rather than orphaning it.
if (process.env.UTOMATOR_INTERNAL_OWNER_ID && process.connected) {
  process.once('disconnect', () => {
    if (process.platform !== 'win32') {
      try { process.kill(-process.pid, 'SIGTERM'); return; } catch { /* fallback */ }
    }
    process.kill(process.pid, 'SIGTERM');
  });
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().then(() => { process.exitCode = 0; }); });
}
app.listen({ host: '127.0.0.1', port })
  .then((address) => { app.log.info({ address }, 'Automation API ready; open the Utomator frontend at /dashboard'); })
  .catch((error: unknown) => {
    app.log.error(error, 'Cannot start Utomator API');
    process.exitCode = 1;
  });
