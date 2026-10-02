// Fetches ynet RSS feeds and renders a clean static Hebrew site into dist/.
import { mkdir, writeFile, copyFile } from "node:fs/promises";

const BASE = "https://www.ynet.co.il/Integration/";
const SECTIONS = [
  { slug: "index", id: "StoryRss2", name: "חדשות" },
  { slug: "digital", id: "StoryRss544", name: "דיגיטל" },
  { slug: "flash", id: "StoryRss1854", name: "מבזקים" },
  { slug: "economy", id: "StoryRss6", name: "כלכלה" },
  { slug: "sport", id: "StoryRss3", name: "ספורט" },
  { slug: "culture", id: "StoryRss538", name: "תרבות" },
  { slug: "law", id: "StoryRss190", name: "משפט" },
  { slug: "health", id: "StoryRss1208", name: "בריאות" },
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${name}>`));
  return m ? (m[1] ?? m[2] ?? "").trim() : "";
}

function parse(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const title = decode(tag(b, "title"));
    const link = tag(b, "link");
    const desc = tag(b, "description");
    const img = (desc.match(/<img[^>]+src=['"]([^'"]+)['"]/) || [])[1] || "";
    const summary = decode(desc.replace(/<div>[\s\S]*?<\/div>/, "").replace(/<[^>]+>/g, "")).trim();
    const date = new Date(tag(b, "pubDate"));
    if (title && /^https:\/\/(www\.)?ynet\.co\.il\//.test(link))
      items.push({ title, link, summary, img: /^https:\/\//.test(img) ? img : "", date });
  }
  return items;
}

async function fetchFeed(id) {
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + id + ".xml", {
        headers: { "user-agent": "Mozilla/5.0 (compatible; ynet-clean RSS reader)" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const items = parse(await r.text());
      if (!items.length) throw new Error("no items");
      return items;
    } catch (e) { err = e; await new Promise((r) => setTimeout(r, 1500)); }
  }
  throw new Error(`${id}: ${err}`);
}

const tz = "Asia/Jerusalem";
const fmtTime = new Intl.DateTimeFormat("he-IL", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
const fmtDay = new Intl.DateTimeFormat("he-IL", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

function page(section, items, built, flashItems = []) {
  const nav = SECTIONS.map(
    (s) => `<a href="${s.slug === "index" ? "./" : s.slug + ".html"}"${s.slug === section.slug ? ' aria-current="page"' : ""}>${s.name}</a>`
  ).join("");
  let out = "", lastDay = "";
  for (const [idx, it] of items.entries()) {
    const k = dayKey(it.date);
    if (k !== lastDay) { out += `<h2>${esc(fmtDay.format(it.date))}</h2>`; lastDay = k; }
    out += `<article><a class="t" href="/read?u=${encodeURIComponent(it.link)}">`;
    if (it.img) out += `<img src="${esc(it.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="52" height="52">`;
    out += `<span class="b"><span class="h">${esc(it.title)}</span>`;
    if (it.summary) out += `<span class="s">${esc(it.summary)}</span>`;
    out += `<time datetime="${it.date.toISOString()}">${fmtTime.format(it.date)}</time></span></a></article>`;
    if (section.slug === "index" && idx === 1) {
      out += `<section class="flashes"><h2>מבזקים אחרונים</h2>${flashItems.map((f) => `<a href="/read?u=${encodeURIComponent(f.link)}"><span>${esc(f.title)}</span><time>${fmtTime.format(f.date)}</time></a>`).join("")}</section>`;
    }
  }
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${section.name} | ynet נקי</title>
<link rel="stylesheet" href="/style.css?v=compact"></head><body>
<header><h1>ynet נקי</h1><nav>${nav}</nav></header>
<main>${out}</main>
<footer>עודכן ${esc(fmtDay.format(built))} ${fmtTime.format(built)}. כותרות ותקצירים מ-RSS של ynet; הכתבות נטענות מ-ynet בזמן קריאה.</footer>
</body></html>`;
}

const css = `:root{color-scheme:light dark;--bg:#fff;--fg:#111;--mut:#666;--ln:#e5e5e5;--ac:#c00}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--mut:#999;--ln:#2a2a2a;--ac:#ff6b6b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.45 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--ln);padding:8px 12px}
h1{margin:0 0 4px;font-size:20px;color:var(--ac)}
nav{display:flex;gap:14px;overflow-x:auto;white-space:nowrap}
nav a{color:var(--mut);text-decoration:none;padding:4px 0;font-size:16px}
nav a[aria-current]{color:var(--fg);font-weight:700;border-bottom:2px solid var(--ac)}
main{max-width:760px;margin:0 auto;padding:0 12px}
h2{font-size:14px;color:var(--mut);margin:20px 0 4px;font-weight:600}
article{border-bottom:1px solid var(--ln)}
.t{display:flex;gap:9px;padding:8px 0;color:inherit;text-decoration:none;align-items:flex-start}
.t img{flex:none;width:52px;height:52px;object-fit:cover;border-radius:4px;background:var(--ln)}
.b{display:flex;flex-direction:column;gap:2px;min-width:0}
.h{font-weight:700;font-size:17px;line-height:1.35}.s{color:var(--mut);font-size:14px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
time{color:var(--mut);font-size:13px}
.t:visited .h{color:var(--mut)}
.flashes{margin:8px 0 12px;padding:10px 12px;background:color-mix(in srgb,var(--ln) 45%,var(--bg));border-radius:8px}.flashes h2{margin:0 0 4px;color:var(--ac)}.flashes a{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--ln);color:inherit;text-decoration:none;font-weight:600}.flashes time{white-space:nowrap}
@media(max-width:600px){.s{display:none}.t{gap:8px;padding:7px 0}.t img{width:48px;height:48px}.h{font-size:16px;line-height:1.3}h2{margin:13px 0 3px}}
footer{max-width:760px;margin:24px auto;padding:0 12px;color:var(--mut);font-size:13px}`;

await mkdir("dist", { recursive: true });
const built = new Date();
const flashItems = (await fetchFeed("StoryRss1854")).sort((a, b) => b.date - a.date).slice(0, 4);
let ok = 0;
for (const s of SECTIONS) {
  try {
    const items = (await fetchFeed(s.id)).sort((a, b) => b.date - a.date);
    await writeFile(`dist/${s.slug === "index" ? "index" : s.slug}.html`, page(s, items, built, flashItems));
    ok++; console.log(`${s.name}: ${items.length} items`);
  } catch (e) { console.error("FAILED", s.name, String(e)); }
}
if (!ok) { console.error("No feeds fetched"); process.exit(1); }
await writeFile("dist/style.css", css);
await copyFile("reader.css", "dist/reader.css");
await writeFile("dist/_headers", "/*\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Cache-Control: public, max-age=300\n");
