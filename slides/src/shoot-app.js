// shoot-app.js — fallback screenshots of the Acme Desk Search tab (Part 3), via the installed Edge.
//   node shoot-app.js <outdir> [baseUrl]
// Needs the app running (python run_checkpoint.py 03-retrieval) and Monday's index.
const { chromium } = require("playwright-core");
const path = require("path");

const SHOTS = [
  ["p1-firstweek-small", "What do I need to do in my first week?", "small"],
  ["p2-firstweek-parent", "What do I need to do in my first week?", "parent"],
  ["p3-billing-dense", "How many reviewers does a change to the billing code need?", "dense"],
  ["p4-billing-parent", "How many reviewers does a change to the billing code need?", "parent"],
];

(async () => {
  const [outdir, base = "http://localhost:8000"] = process.argv.slice(2);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--headless=new"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1.5 });
  // app.js (02 and 03, as committed on 12 Nov) has a raw line break inside join("..."), a syntax
  // error that stops the whole UI script. Serve it with "\n" instead; the file on disk is untouched.
  await page.route("**/static/app.js", async route => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/join\("\r?\n"\)/g, 'join("\\n")');
    await route.fulfill({ response: res, body });
  });
  await page.goto(base + "/login");
  await page.fill("#email", "intern@acme.test");
  await page.fill("#password", process.env.ACME_PASSWORD || "acme-class-2026");
  await Promise.all([page.waitForNavigation(), page.click("#loginForm button[type=submit], #loginForm button")]);
  for (const [name, q, strategy] of SHOTS) {
    await page.goto(base + "/ui#search");
    await page.waitForSelector("#searchQuery", { state: "visible" });
    await page.$eval("#searchOutput", el => { el.innerHTML = ""; });
    await page.fill("#searchQuery", q);
    await page.selectOption("#searchStrategy", strategy);
    await page.fill("#searchTopK", "3");
    await page.click("#searchForm button");
    await page.waitForSelector("#searchOutput details.chunk");
    // open the first two results, so the text and "Matched by the small chunk" show
    await page.$$eval("#searchOutput details.chunk", ds => ds.slice(0, 2).forEach(d => { d.open = true; }));
    await page.waitForTimeout(300);
    const out = await page.$("#searchOutput");
    const box = await out.boundingBox();
    const form = await page.$("#searchForm");
    const top = (await form.boundingBox()).y - 10;
    await page.screenshot({ path: path.join(outdir, name + ".png"),
      clip: { x: Math.max(0, box.x - 10), y: top, width: Math.min(1280, box.width + 20), height: Math.min(1100 - top, box.y + box.height - top + 10) } });
    console.log("saved", name);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
