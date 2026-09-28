import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const run = promisify(execFile);
const dir = await mkdtemp(path.join(tmpdir(), 'gatherhall-deploy-'));
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
let child, exited, logs = '';
async function start() {
 child = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DATA_DIR: dir },
  stdio: ['ignore', 'pipe', 'pipe'],
 });
 exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
 child.stdout.on('data', chunk => { logs += chunk; });
 child.stderr.on('data', chunk => { logs += chunk; });
 for (let i = 0; i < 100; i++) {
  if (child.exitCode !== null) throw Error(logs);
  try { const response = await fetch(base + '/healthz'); if (response.ok) return; } catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
 }
 throw Error('Production server failed to become healthy: ' + logs);
}
async function stop() {
 child.kill('SIGTERM');
 const result = await exited;
 assert.equal(result.code, 0, logs);
 assert.equal(result.signal, null);
}
try {
 await start();
 const health = await fetch(base + '/healthz');
 assert.deepEqual(await health.json(), { status: 'ok' });
 assert.equal(health.headers.get('cache-control'), 'no-store');
 assert.equal(health.headers.get('x-powered-by'), null);
 const html = await (await fetch(base)).text();
 assert.ok(html.includes('<div id="root">'));
 assert.ok(!html.includes('/@vite/client'));
 const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
 assert.equal((await fetch(base + asset)).status, 200);
 assert.equal((await fetch(base + '/api/data')).status, 401);
 const { stdout } = await run(process.execPath, ['tests/api.mjs'], {
  env: { ...process.env, TEST_URL: base + '/api' },
 });
 console.log(stdout.trim());
 const login = await fetch(base + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'owner@gatherhall.demo', password: 'Welcome123!' }),
 });
 const cookie = login.headers.get('set-cookie').split(';')[0];
 const read = () => fetch(base + '/api/data', { headers: { Cookie: cookie } }).then(r => r.json());
 const before = await read();
 await stop();
 await start();
 assert.deepEqual(await read(), before, 'Data and sessions should survive process restarts.');
 await stop();
 console.log('PASS: production static assets, custom port/data directory, public health check, graceful SIGTERM, and restart persistence.');
} finally {
 if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
 await rm(dir, { recursive: true, force: true });
}
