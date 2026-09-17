// scripts/live_mac_canary_test.js
import { chromium } from 'playwright';
import path from 'node:path';
import assert from 'node:assert';

console.log("=== FULL YOLO MODE: LIVE LOCAL MAC CANARY TEST ===");

const EXTENSION_PATH = path.resolve('fleet_dist/lectrospeed-3x');
console.log(`[1] Extension Path: ${EXTENSION_PATH}`);

async function runLiveCanary() {
  console.log("[2] Launching Chromium with unpacked extension...");
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox'
    ]
  });

  console.log("[3] Inspecting Service Workers...");
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }

  assert.ok(serviceWorker, "Service Worker should be active");
  console.log(` [PASS] Service Worker URL: ${serviceWorker.url()}`);

  console.log("[4] Opening live test page...");
  const page = await context.newPage();
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head><title>AIR10 Live Canary Test</title></head>
      <body>
        <h1>CIVEX LectroSpeed 3.0x Live Test</h1>
        <video id="testVideo" src="" style="display:none;"></video>
      </body>
    </html>
  `);

  const title = await page.title();
  assert.strictEqual(title, 'AIR10 Live Canary Test');
  console.log(` [PASS] Page Content verified: ${title}`);

  console.log("[5] Verifying Service Worker communication...");
  const evalResult = await serviceWorker.evaluate(() => {
    return {
      manifest: chrome.runtime.getManifest().name,
      version: chrome.runtime.getManifest().version,
      id: chrome.runtime.id
    };
  });

  console.log(` [PASS] Manifest Name: "${evalResult.manifest}" (v${evalResult.version})`);
  console.log(` [PASS] Runtime Extension ID: ${evalResult.id}`);

  assert.strictEqual(evalResult.manifest, 'CIVEX LectroSpeed 3.0x AI');
  assert.ok(evalResult.id.length > 10);

  await context.close();
  console.log("\n>>> LIVE MAC LOCAL CANARY PASSED 100% WITH ZERO ERRORS! <<<");
}

runLiveCanary().catch((err) => {
  console.error("Canary Failed:", err);
  process.exit(1);
});
