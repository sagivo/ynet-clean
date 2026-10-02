// Fetches ynet RSS feeds and renders a clean static Hebrew site into dist/.
import { mkdir, writeFile, copyFile } from "node:fs/promises";

const BASE = "https://www.ynet.co.il/Integration/";
const SECTIONS = [
  { slug: "news", id: "StoryRss2", name: "חדשות" },
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
    const enclosure = (b.match(/<enclosure[^>]+url=["']([^"']+)["']/i) || [])[1] || "";
    const imageCaption = (desc.match(/<img[^>]+(?:alt|title)=["']([^"']*)["']/i) || [])[1] || "";
    const rawText = desc.replace(/<img\b[^>]*>/gi, " ").replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ");
    const summary = decode(rawText).replace(/\s+/g, " ").trim() || decode(imageCaption).trim();
    const date = new Date(tag(b, "pubDate"));
    const image = img || enclosure;
    if (title && /^https:\/\/(www\.)?ynet\.co\.il\//.test(link))
      items.push({ title, link, summary, img: /^https:\/\//.test(image) ? image : "", source: decode(tag(b, "author")) || "ynet", date });
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

// Flash RSS often has only a headline and image. Fetch each linked article at
// build time and use its published articleBody as the expandable flash text.
async function addFlashText(item) {
  try {
    const r = await fetch(item.link, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; ynet-clean RSS reader)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const html = await r.text();
    const match = html.match(/"articleBody"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const articleBody = match ? JSON.parse('"' + match[1] + '"') : "";
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
    const text = decode(articleBody || description.replace(/&quot;/g, '"'))
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text ? { ...item, summary: text } : item;
  } catch (e) {
    console.error("flash text fetch failed", item.link, String(e));
    return item;
  }
}

// Parse ynet's real homepage into ordered per-block story lists.
async function fetchHome() {
  try {
    const r = await fetch("https://www.ynet.co.il/home/0,7340,L-8,00.html", {
      headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "accept-language": "he" },
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const h = await r.text();
    const marks = [...h.matchAll(/class="rightTitleText"[^>]*>([\s\S]*?)<\//g)].map((m) => ({ pos: m.index, name: decode(m[1].replace(/<[^>]+>/g, "")).trim() }));
    const bounds = [{ pos: 0, name: "TOP" }, ...marks, { pos: h.length, name: "END" }];
    const blocks = new Map();
    for (let i = 0; i < bounds.length - 1; i++) {
      const seg = h.slice(bounds[i].pos, bounds[i + 1].pos);
      const byId = new Map();
      for (const m of seg.matchAll(/<a\b[^>]*href="(https:\/\/www\.ynet\.co\.il\/[^"#?]*?\/article\/([A-Za-z0-9]+))[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
        const [, link, id, inner] = m;
        const e = byId.get(id) || { link, title: "", img: "", summary: "" };
        const img = (inner.match(/<img[^>]+src="(https:[^"]+)"/) || [])[1];
        if (img && !e.img) e.img = decode(img);
        const sub = inner.match(/class="slotSubTitle"[^>]*>([\s\S]*?)<\/[^>]+>/);
        const summary = sub ? decode(sub[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "";
        if (summary && !e.summary) e.summary = summary;
        if (!e.title) {
          const t = inner.match(/data-tb-title[^>]*>([\s\S]*?)<\/(?:span|h\d)>/);
          const txt = decode((t ? t[1] : inner).replace(/<img\b[^>]*>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
          if (txt) e.title = txt;
        }
        byId.set(id, e);
      }
      const list = [...byId.values()].filter((e) => e.title);
      if (list.length) blocks.set(bounds[i].name, [...(blocks.get(bounds[i].name) || []), ...list]);
    }
    return blocks;
  } catch (e) { console.error("ynet homepage fetch failed", String(e)); return null; }
}

const tz = "Asia/Jerusalem";
const fmtTime = new Intl.DateTimeFormat("he-IL", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
const fmtDay = new Intl.DateTimeFormat("he-IL", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

const flashRow = (f) => `<details class="fl"><summary><span>${esc(f.title)}</span><time>${fmtTime.format(f.date)}</time></summary><div class="fb">${f.img ? `<img src="${esc(f.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}${f.summary && f.summary !== f.title ? `<p>${esc(f.summary)}</p>` : ""}<a href="/read?u=${encodeURIComponent(f.link)}">לכתבה המלאה ‹</a></div></details>`;

function page(section, items, built, flashItems = [], feeds = new Map(), home = null) {
  const nav = [{ slug: "index", name: "ראשי" }, ...SECTIONS].map(
    (s) => `<a href="${s.slug === "index" ? "./" : s.slug + ".html"}"${s.slug === section.slug ? ' aria-current="page"' : ""}>${s.name}</a>`
  ).join("");
  let out = "", lastDay = "";
  for (const [idx, it] of items.entries()) {
    const k = dayKey(it.date);
    if (k !== lastDay) { out += `<h2>${esc(fmtDay.format(it.date))}</h2>`; lastDay = k; }
    out += `<article><a class="t" href="/read?u=${encodeURIComponent(it.link)}">`;
    if (it.img) out += `<img src="${esc(it.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="60" height="60">`;
    out += `<span class="b"><span class="h">${esc(it.title)}</span>`;
    if (it.summary) out += `<span class="s">${esc(it.summary)}</span>`;
    out += `<time datetime="${it.date.toISOString()}">${fmtTime.format(it.date)}</time></span></a></article>`;
    if (section.slug === "index" && idx === 1) {
      out += `<section class="flashes"><h2>מבזקים אחרונים</h2>${flashItems.map(flashRow).join("")}</section>`;
    }
  }
  if (section.slug === "index") {
    // Ynet mobile homepage, checked 2026-10-02. Only categories available
    // in this site's tabs are included; their order and block sizes match Ynet.
    const TABS = { "חדשות": "news", "כלכלה וצרכנות": "economy", "ספורט": "sport", "תרבות ובידור": "culture", "בריאות וכושר": "health", "דיגיטל": "digital", "פסק דין": "law" };
    const FALLBACK = ["news", "economy", "sport", "culture", "health", "digital", "law"];
    const blocks = [];
    if (home && home.size) {
      for (const [name, items] of home) {
        const label = name === "TOP" ? "חדשות" : name;
        const last = blocks[blocks.length - 1];
        if (name === "TOP") { blocks.push({ name: label, items: [...items] }); continue; }
        if (label === "חדשות" && last && last.name === "חדשות") { last.items.push(...items); continue; }
        blocks.push({ name: label, items: [...items] });
      }
    } else {
      for (const slug of FALLBACK) blocks.push({ name: SECTIONS.find((x) => x.slug === slug).name, items: (feeds.get(slug) || []).slice(0, 8) });
    }
    out = blocks.map(({ name, items: list0 }) => {
      const slug = TABS[name] || "";
      const seen = new Set();
      const list = list0.filter((it) => !seen.has(it.link) && seen.add(it.link));
      const heading = slug ? `<a href="${slug}.html">${esc(name)}</a><a class="all-category" href="${slug}.html">לכל הכותרות ‹</a>` : `<span>${esc(name)}</span>`;
      const rows = list.map((it, i) => {
        if (name === "חדשות" && i === 0) return `<article class="lead-story"><a href="/read?u=${encodeURIComponent(it.link)}">${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}<span class="b"><span class="h">${esc(it.title)}</span>${it.summary ? `<span class="lead-summary">${esc(it.summary)}</span>` : ""}</span></a></article>`;
        return `<article><a class="t" href="/read?u=${encodeURIComponent(it.link)}">${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="60" height="60">` : ""}<span class="b"><span class="h">${esc(it.title)}</span></span></a></article>`;
      });
      if (name === "חדשות" && flashItems.length) rows.splice(5, 0,
        `<section class="flashes"><h2>מבזקים אחרונים</h2>${flashItems.map(flashRow).join("")}</section>`);
      return `<section class="home-category" data-category="${slug || "x"}"><h2 class="category-heading">${heading}</h2>${rows.join("") || `<p class="feed-unavailable">הכותרות אינן זמינות כרגע</p>`}</section>`;
    }).join("");
  }
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${section.name} | ynet נקי</title>
<link rel="stylesheet" href="/style.css?v=thumbs-20261002"></head><body>
<header><h1>ynet נקי<span class="tag">בלי ספאם, רק תוכן</span></h1><nav>${nav}</nav></header>
<main>${out}</main>
<footer>עודכן ${esc(fmtDay.format(built))} ${fmtTime.format(built)}. כותרות ותקצירים מ-RSS של ynet; הכתבות נטענות מ-ynet בזמן קריאה.</footer>
</body></html>`;
}

const css = `:root{color-scheme:light dark;--bg:#fff;--fg:#111;--mut:#666;--ln:#e5e5e5;--ac:#c00}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--mut:#999;--ln:#2a2a2a;--ac:#ff6b6b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.45 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--ln);padding:8px 12px}
h1{margin:0 0 4px;font-size:20px;color:var(--ac);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}h1 .tag{margin-inline-start:8px;font-size:12px;font-weight:400;color:var(--mut)}
nav{display:flex;gap:14px;overflow-x:auto;white-space:nowrap}
nav a{color:var(--mut);text-decoration:none;padding:4px 0;font-size:16px}
nav a[aria-current]{color:var(--fg);font-weight:700;border-bottom:2px solid var(--ac)}
main{max-width:760px;margin:0 auto;padding:0 12px}
h2{font-size:14px;color:var(--mut);margin:20px 0 4px;font-weight:600}
article{border-bottom:1px solid var(--ln)}
.t{display:flex;gap:9px;padding:8px 0;color:inherit;text-decoration:none;align-items:flex-start}
.t img{flex:none;width:60px;height:60px;object-fit:cover;border-radius:4px;background:var(--ln)}
.b{display:flex;flex-direction:column;gap:2px;min-width:0}
.h{font-weight:700;font-size:17px;line-height:1.35}.s{color:var(--mut);font-size:14px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
time{color:var(--mut);font-size:13px}
.t:visited .h{color:var(--mut)}
.home-category{margin:12px 0 18px}.category-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:2px solid var(--ac);padding-bottom:5px;margin:0;font-size:17px;color:var(--fg)}.category-heading a{color:inherit;text-decoration:none}.category-heading .all-category{font-size:12px;color:var(--mut);font-weight:400}.home-category .t{align-items:center}.lead-story>a{display:block;padding:8px 0;color:inherit;text-decoration:none}.lead-story>a>img{display:block;width:100%;height:min(56.25vw,33vh,280px);max-height:280px;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:var(--ln)}.lead-story .b{display:flex;flex-direction:column;gap:4px;padding:7px 0}.lead-story .h{font-size:21px;line-height:1.3}.lead-summary{font-size:15px;line-height:1.5;color:var(--mut)}.feed-unavailable{color:var(--mut);font-size:14px}.headlines{margin:8px 0 10px;padding:7px 9px;background:color-mix(in srgb,var(--ln) 35%,var(--bg));border-radius:6px}.headlines h2{margin:0 0 3px;color:var(--ac);font-size:13px}.headlines a{display:block;padding:4px 0;border-top:1px solid var(--ln);font-size:14px;line-height:1.3;font-weight:650;color:inherit;text-decoration:none}.news-heading{margin-top:8px!important}.flashes{margin:6px 0 8px;padding:6px 9px;background:color-mix(in srgb,var(--ln) 35%,var(--bg));border-radius:6px}.flashes h2{margin:0 0 2px;color:var(--ac);font-size:12px}.flashes a{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;border-top:1px solid var(--ln);color:inherit;text-decoration:none;font-weight:500;font-size:12px;line-height:1.2}.flashes a span{min-width:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden;text-overflow:ellipsis}.flashes time{white-space:nowrap;font-size:12px}.flashes details{border-top:1px solid var(--ln)}.flashes summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;min-height:44px;cursor:pointer;list-style:none;font-weight:600;font-size:15px;line-height:1.35}.flashes summary::-webkit-details-marker{display:none}.flashes summary span{min-width:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden}.flashes details[open] summary span{-webkit-line-clamp:unset;font-weight:700}.flashes .fb{padding:6px 0 10px;font-size:15px;line-height:1.5}.flashes .fb img{display:block;width:100%;max-height:220px;object-fit:cover;border-radius:6px;margin-bottom:6px}.flashes .fb p{margin:0 0 6px}.flashes .fb a{display:inline;border:0;padding:0;font-size:13px;color:var(--ac)}
@media(max-width:600px){.s{display:none}.t{gap:8px;padding:7px 0}.t img{width:56px;height:56px}.h{font-size:16px;line-height:1.3}h2{margin:13px 0 3px}}
footer{max-width:760px;margin:24px auto;padding:0 12px;color:var(--mut);font-size:13px}`;

await mkdir("dist", { recursive: true });
const built = new Date();
const flashItems = await Promise.all((await fetchFeed("StoryRss1854")).sort((a, b) => b.date - a.date).slice(0, 4).map(addFlashText));
const home = await fetchHome();
console.log("ynet home blocks:", home ? [...home].map(([k, v]) => k + "=" + v.length).join(", ") : "none");
const feeds = new Map();
for (const s of SECTIONS) {
  try {
    const items = (await fetchFeed(s.id)).sort((a, b) => b.date - a.date);
    feeds.set(s.slug, items);
    await writeFile(`dist/${s.slug}.html`, page(s, items, built, flashItems));
    console.log(`${s.name}: ${items.length} items`);
  } catch (e) { console.error("FAILED", s.name, String(e)); }
}
if (!feeds.size) { console.error("No feeds fetched"); process.exit(1); }
await writeFile("dist/index.html", page({slug:"index",name:"ראשי"}, [], built, flashItems, feeds, home));
await writeFile("dist/style.css", css);
await copyFile("reader.css", "dist/reader.css");
await writeFile("dist/_headers", "/*\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Cache-Control: public, max-age=300\n");
