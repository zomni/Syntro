const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const frontendUrl = process.env.SYNTRO_FRONTEND_URL || "http://localhost:8081";
const apiUrl = process.env.SYNTRO_API_URL || "http://localhost:5001";
const username = process.env.SYNTRO_TEST_USER || "admin@example.com";
const password = process.env.SYNTRO_TEST_PASSWORD;
const statePath = path.join(process.env.TEMP || ".", "syntro-playwright-state.json");
const outputPath = path.join(process.env.TEMP || ".", "syntro-stage1-measurements.json");

const throttle = async (page, slow) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Emulation.setCPUThrottlingRate", { rate: slow ? 4 : 1 });
  await client.send("Network.emulateNetworkConditions", slow
    ? { offline: false, latency: 400, downloadThroughput: 375 * 1024, uploadThroughput: 75 * 1024 }
    : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
};

const loginAndSaveState = async (browser) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${apiUrl}/Auth/Login`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name=Username]").fill(username);
  await page.locator("input[name=Password]").fill(password);
  await page.locator("#login-form button[type=submit]").click();
  await page.waitForTimeout(500);
  await context.storageState({ path: statePath });
  await context.close();
};

const runScenario = async (browser, name, slow, reload = false) => {
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(String(error)));
  await throttle(page, slow);
  let start = Date.now();
  await page.goto(`${frontendUrl}/`, { waitUntil: "domcontentloaded" });
  let domContentLoaded = Date.now() - start;
  if (reload) {
    await page.waitForTimeout(1000);
    requests.length = 0;
    start = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    domContentLoaded = Date.now() - start;
  }
  const overlay = page.locator("#map-loading-overlay");
  await overlay.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  await overlay.waitFor({ state: "hidden", timeout: slow ? 15000 : 5000 }).catch(() => {});
  const load = await page.evaluate(() => Math.round(performance.getEntriesByType("navigation")[0]?.duration || 0));
  const overlayHidden = await overlay.isHidden().catch(() => false);
  const auxLoading = await page.locator("#map.map-auxiliary-loading").count();
  const interactive = await page.locator("#map path.leaflet-interactive").count();
  const rooms = await page.locator("#map path.manual-room-polygon").count();
  const markers = await page.locator("#map .map-static-marker-icon").count();
  let popupOpened = false;
  let popupText = "";
  let popupTextAfterAuxiliary = "";
  let roomsAfterAuxiliary = rooms;
  const firstFeature = page.locator("#map path.leaflet-interactive").first();
  if (await firstFeature.count()) {
    await firstFeature.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
    popupOpened = await page.locator(".leaflet-popup").count() > 0;
    popupText = await page.locator(".leaflet-popup").innerText().catch(() => "");
    await page.waitForTimeout(slow ? 12000 : 1200);
    roomsAfterAuxiliary = await page.locator("#map path.manual-room-polygon").count();
    popupTextAfterAuxiliary = await page.locator(".leaflet-popup").innerText().catch(() => "");
  }
  const result = {
    name,
    domContentLoaded,
    load,
    requests: requests.length,
    sessionRequests: requests.filter((url) => url.includes("/api/auth/session")).length,
    sessionRequestUrls: requests.filter((url) => url.includes("/api/auth/session")),
    overlayHidden,
    auxiliaryIndicatorVisible: auxLoading > 0,
    interactive,
    rooms,
    roomsAfterAuxiliary,
    markers,
    popupOpened,
    popupText: popupText.slice(0, 160),
    popupTextAfterAuxiliary: popupTextAfterAuxiliary.slice(0, 240),
    errors,
  };
  if (overlayHidden && (interactive === 0 || !popupOpened || !popupTextAfterAuxiliary.includes("sectores"))) {
    throw new Error(`Interacción temprana inválida en ${name}: ${JSON.stringify(result)}`);
  }
  await context.close();
  return result;
};

const main = async () => {
  if (!password) throw new Error("Define SYNTRO_TEST_PASSWORD for the authenticated measurement.");
  const browser = await chromium.launch({ headless: true });
  if (!fs.existsSync(statePath)) await loginAndSaveState(browser);
  const measurements = [];
  measurements.push(await runScenario(browser, "cold-cache", false));
  measurements.push(await runScenario(browser, "hot-cache", false, true));
  measurements.push(await runScenario(browser, "slow-network-cpu4x", true));

  await loginAndSaveState(browser);
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();
  await throttle(page, true);
  const captureStart = Date.now();
  await page.goto(`${frontendUrl}/`, { waitUntil: "domcontentloaded" });
  for (const delay of [500, 1000, 2000, 4000]) {
    await page.waitForTimeout(Math.max(0, delay - (Date.now() - captureStart)));
    await page.screenshot({ path: path.join(process.env.TEMP || ".", `syntro-stage1-${delay}ms.png`), fullPage: true });
  }
  await context.close();
  fs.writeFileSync(outputPath, JSON.stringify(measurements, null, 2));
  console.log(JSON.stringify(measurements, null, 2));
  await browser.close();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
