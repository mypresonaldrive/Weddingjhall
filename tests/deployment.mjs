import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

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
 const flow = await run(process.execPath, ['tests/booking-flow.mjs'], { env: { ...process.env, TEST_URL: base + '/api' } });
 console.log(flow.stdout.trim());
 const menus = await run(process.execPath, ['tests/food-menus.mjs'], { env: { ...process.env, TEST_URL: base + '/api' } });
 console.log(menus.stdout.trim());
 const packages = await run(process.execPath, ['tests/packages.mjs'], { env: { ...process.env, TEST_URL: base + '/api' } });
 console.log(packages.stdout.trim());
 const login = await fetch(base + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'owner@gatherhall.demo', password: 'Welcome123!' }),
 });
 const cookie = login.headers.get('set-cookie').split(';')[0];
 const read = () => fetch(base + '/api/data', { headers: { Cookie: cookie } }).then(r => r.json());
 const registered = await fetch(base + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'New owner', organization: 'Fresh venue', email: 'new-owner@example.com', password: 'Testing123!' }),
 });
 assert.equal(registered.status, 200);
 const newLogin = await fetch(base + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'new-owner@example.com', password: 'Testing123!' }),
 });
 const newCookie = newLogin.headers.get('set-cookie').split(';')[0];
 const newData = await (await fetch(base + '/api/data', { headers: { Cookie: newCookie } })).json();
 assert.equal(newData.plans.length, 4); assert.equal(newData.addons.length, 8); assert.equal(newData.bookings.length, 0);
 const before = await read();
 await stop();
 await start();
 assert.deepEqual(await read(), before, 'Data and sessions should survive process restarts.');
 await stop();
 // Simulate older catalog data: pristine fixtures may gain reference inclusions,
 // but customized service descriptions and explicit empty lists must be respected.
 const fixture = new DatabaseSync(path.join(dir, 'gatherhall.sqlite'));
 const change = (id, update) => {
  const row = fixture.prepare('SELECT body FROM records WHERE id=?').get(id);
  const body = JSON.parse(row.body); update(body);
  fixture.prepare('UPDATE records SET body=? WHERE id=?').run(JSON.stringify(body),id);
 };
 change('t1-addon-0', row => { delete row.features; });
 change('t1-addon-1', row => { delete row.features; row.description='My own custom service agreement'; });
 change('t1-addon-2', row => { row.features=[]; });
 change('t1-plan-1', row => { delete row.menus; });
 change('t1-plan-2', row => { delete row.menus;row.description='My own custom model'; });
 change('t1-plan-3', row => { row.menus=[]; });
 fixture.close();
 await start();
 const upgraded=await read();
 assert.deepEqual(upgraded.addons.find(a=>a.id==='t1-addon-0').features,before.addons.find(a=>a.id==='t1-addon-0').features);
 assert.equal(upgraded.addons.find(a=>a.id==='t1-addon-1').features,undefined);
 assert.deepEqual(upgraded.addons.find(a=>a.id==='t1-addon-2').features,[]);
 assert.deepEqual(upgraded.plans.find(a=>a.id==='t1-plan-1').menus,before.plans.find(a=>a.id==='t1-plan-1').menus);
 assert.equal(upgraded.plans.find(a=>a.id==='t1-plan-2').menus,undefined);
 assert.deepEqual(upgraded.plans.find(a=>a.id==='t1-plan-3').menus,[]);
 await stop();
 console.log('PASS: safe service-inclusion and food-menu upgrades for legacy catalog entries.');
 console.log('PASS: production static assets, custom port/data directory, public health check, graceful SIGTERM, and restart persistence.');
} finally {
 if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
 await rm(dir, { recursive: true, force: true });
}
