// Run one script file inside Zotero through the bridge, for a host that has no
// MCP tools of its own (see README.md beside this file).
//
//   node exec.mjs <script.js>
//
// The file is sent as `zotero_execute_js` code with `awaitPromise`, so a kit
// script's `(async () => { … })()` resolves and its JSON string is printed.
// ZOTERO_RDP_HOST / ZOTERO_RDP_PORT pick the bridge, MCP_SERVER_DIR the
// installed server (default this folder).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [file] = process.argv.slice(2);
if (!file) {
  console.error('usage: node exec.mjs <script.js>');
  process.exit(2);
}
const code = readFileSync(file, 'utf8');
const serverDir = process.env.MCP_SERVER_DIR ?? new URL('.', import.meta.url).pathname;
const entry = join(serverDir, 'node_modules/@introfini/mcp-server-zotero-dev/dist/index.js');

const server = spawn(process.execPath, [entry], {
  cwd: serverDir,
  env: { ...process.env, ZOTERO_RDP_HOST: process.env.ZOTERO_RDP_HOST ?? '127.0.0.1', ZOTERO_RDP_PORT: process.env.ZOTERO_RDP_PORT ?? '6100' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const pending = new Map();
let nextId = 1;
const send = (payload) => server.stdin.write(JSON.stringify(payload) + '\n');
const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
  });

createInterface({ input: server.stdout }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const waiter = msg.id !== undefined ? pending.get(msg.id) : undefined;
  if (!waiter) return;
  pending.delete(msg.id);
  msg.error ? waiter.reject(new Error(JSON.stringify(msg.error))) : waiter.resolve(msg.result);
});
const stderr = [];
server.stderr.on('data', (chunk) => stderr.push(String(chunk)));

const timer = setTimeout(() => {
  console.error('TIMEOUT 180s\n' + stderr.join(''));
  server.kill();
  process.exit(1);
}, 180_000);

try {
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'openreader-kit', version: '1.0.0' } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const result = await request('tools/call', { name: 'zotero_execute_js', arguments: { code, awaitPromise: true } });
  console.log(
    (result?.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n'),
  );
  clearTimeout(timer);
  server.kill();
  process.exit(0);
} catch (error) {
  console.error('MCP error: ' + error.message + '\n' + stderr.join(''));
  clearTimeout(timer);
  server.kill();
  process.exit(1);
}
