// Dev-only UI evidence: screenshots of the running dev server through headless Chromium's
// DevTools protocol (Node 22 built-in WebSocket; no new dependency). Demo mode only.
// Usage: node scripts/mvp/screenshot.mjs <url> <out.png> <width> <height> [clickText...]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, out, width = '390', height = '1400', ...clicks] = process.argv.slice(2);
const CH = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CH, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Emulation.setDeviceMetricsOverride', { width: +width, height: +height, deviceScaleFactor: 1, mobile: +width < 600 });
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(9000);
  for (const text of clicks) {
    await send('Runtime.evaluate', { expression: `(() => { const el = [...document.querySelectorAll('button')].find(b => b.innerText.includes(${JSON.stringify(text)})); if (el) el.click(); return !!el; })()` });
    await sleep(2500);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(`saved ${out}`);
  ws.close();
} finally { chrome.kill('SIGKILL'); }
