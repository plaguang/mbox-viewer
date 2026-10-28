import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.URL || "http://localhost:3007";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

(async () => {
  console.log(`\n🧪 Running Playwright E2E on ${BASE} ...\n`);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route(/googletagmanager|google-analytics|clarity\.ms|_vercel\/insights/i, (route) =>
    route.abort()
  );
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  // 1. 打开首页并验证 H1 与防统计污染
  await page.goto(BASE, { waitUntil: "load", timeout: 30000 });
  const h1 = await page.locator("h1").textContent();
  assert(
    h1 && h1.toLowerCase().includes("mbox viewer"),
    `Homepage H1 renders ("${h1?.trim()}")`
  );

  const isBlocked = await page.evaluate(
    () => navigator.webdriver === true && typeof window.gtag === "undefined"
  );
  assert(isBlocked, "Automated WebDriver session suppresses GA4 / Clarity / Vercel Analytics");

  // 2. 验证默认加载 3 封 Google Takeout MBOX 样本邮件
  const countBadge = await page.getByTestId("email-count-badge").textContent();
  assert(countBadge?.includes("3 / 3"), `Default sample archive loads 3 emails (${countBadge})`);

  // 3. 验证第 1 封邮件解码了 Quoted-Printable 正文与 Base64 CSV 附件
  const body1 = await page.getByTestId("active-email-body").textContent();
  assert(
    body1 && body1.includes("$4,850.00 USD"),
    "First email decodes Quoted-Printable payout body accurately"
  );

  const [attDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByTestId("download-attachment-0").click(),
  ]);
  const attPath = await attDownload.path();
  const attText = fs.readFileSync(attPath, "utf8");
  assert(
    attText.includes("Cloudflare Inc.") && attText.includes("892.50"),
    `Extracted Base64 MIME attachment (${attDownload.suggestedFilename()}) matches original CSV`
  );

  // 4. 点击切换第 2 封邮件（SAFE 投资协议）并导出为矢量 PDF (%PDF-1.4)
  await page.getByTestId("email-row-1").click();
  const subj2 = await page.getByTestId("active-email-subject").textContent();
  assert(
    subj2 && subj2.includes("Executed SAFE Agreement"),
    `Clicking 2nd message updates active subject ("${subj2?.trim()}")`
  );

  const [pdfDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByTestId("export-pdf-btn").click(),
  ]);
  const pdfBuf = fs.readFileSync(await pdfDownload.path());
  const pdfHeader = pdfBuf.subarray(0, 8).toString("utf8");
  assert(
    pdfHeader.startsWith("%PDF-1.4") && pdfBuf.length > 600,
    `Exported MBOX email to valid PDF (${pdfDownload.suggestedFilename()}, ${pdfBuf.length} bytes)`
  );

  // 5. 测试导出整个邮箱为 CSV 表格
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByTestId("export-csv-btn").click(),
  ]);
  const csvText = fs.readFileSync(await csvDownload.path(), "utf8");
  assert(
    csvText.includes("Message_ID,Date,From,To,Subject") && csvText.includes("Summit Ventures"),
    `Exported MBOX archive to RFC-4180 CSV spreadsheet (${csvText.length} chars)`
  );

  // 6. 测试搜索过滤功能
  await page.getByTestId("mbox-search-input").fill("SAFE Agreement");
  const filteredBadge = await page.getByTestId("email-count-badge").textContent();
  assert(
    filteredBadge?.includes("1 / 3"),
    `Keyword search filters mailbox list to 1 / 3 (${filteredBadge})`
  );

  // 7. 巡检全部 4 个 SEO 路由 + sitemap.xml + robots.txt
  for (const r of [
    "/",
    "/open-mbox-file",
    "/mbox-to-pdf",
    "/mbox-to-csv",
    "/sitemap.xml",
    "/robots.txt",
    "/llms.txt",
  ]) {
    const res = await page.goto(`${BASE}${r}`, { waitUntil: "load", timeout: 30000 });
    assert(res && res.status() === 200, `Route ${r} returns HTTP 200`);
  }

  await page.goto(`${BASE}/open-mbox-file?utm_source=copilot.com`, { waitUntil: "networkidle", timeout: 30000 });
  const aiAttr = await page.locator("html").getAttribute("data-ai-referral");
  assert(aiAttr === "microsoft:copilot", `GEOInflow AI referral attribution tagged html[data-ai-referral="${aiAttr}"]`);

  assert(consoleErrors.length === 0, `Zero runtime page errors (${consoleErrors.length})`);

  await browser.close();
  console.log(`\n📊 Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
