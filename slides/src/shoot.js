// shoot.js <preview.html> <outdir> [slides] — overflow report + one PNG per slide, via the installed Edge
const { chromium } = require("playwright-core");
const path = require("path");

(async () => {
  const [file, outdir, only] = process.argv.slice(2);
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/hasan/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1.5 });
  const url = "file:///" + path.resolve(file).split(path.sep).join("/");
  await page.goto(url);
  const report = await page.evaluate(() => JSON.parse(document.getElementById("report").textContent || "[]"));
  console.log(JSON.stringify({ overflows: report }, null, 1));
  const n = await page.evaluate(() => document.querySelectorAll(".slide").length);
  const wanted = only ? only.split(",").map(Number) : Array.from({ length: n }, (_, i) => i + 1);
  for (const i of wanted) {
    await page.goto(url + "?slide=" + i);
    await page.screenshot({ path: path.join(outdir, "s" + String(i).padStart(2, "0") + ".png") });
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
