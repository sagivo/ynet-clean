const BASE = "https://www.ynet.co.il/Integration/";
const htmlHeaders = { "content-type": "application/json; charset=utf-8", "referrer-policy": "no-referrer" };
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function decode(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
const text = (s) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const safeStory = (u) => /^https:\/\/(?:www\.)?ynet\.co\.il\/[A-Za-z0-9_\-\/.%]+$/.test(u) && /\/article\/[A-Za-z0-9]+$/.test(u);
const safeImage = (u) => /^https:\/\/(?:[a-z0-9-]+\.)*yit\.co\.il\//i.test(u);
async function fetchHome() {
  const bust = `ynet-clean-live=${Date.now()}`;
  const r = await fetch(`https://www.ynet.co.il/home/0,7340,L-8,00.html?${bust}`, { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "accept-language": "he" }, signal: AbortSignal.timeout(18000) });
  if (!r.ok) throw new Error(`home HTTP ${r.status}`);
  const h = await r.text();
  const marks = [...h.matchAll(/class="rightTitleText"[^>]*>([\s\S]*?)<\//g)].map((m) => ({ pos: m.index, name: text(m[1]) }));
  const bounds = [{ pos: 0, name: "TOP" }, ...marks, { pos: h.length, name: "END" }];
  const out = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const seg = h.slice(bounds[i].pos, bounds[i + 1].pos);
    const byId = new Map();
    if (bounds[i].name === "TOP") {
      const hero = seg.match(/<div[^>]*class="[^"]*top-story-multi[^"]*"[\s\S]*?<h1[^>]*data-tb-title[^>]*>([\s\S]*?)<\/h1>/i);
      if (hero) {
        const start = hero.index;
        const tail = seg.indexOf("</div></div></div></div></span></div>", start);
        const region = seg.slice(start, tail > -1 ? tail : start + 20000);
        const link = region.match(/href="(https:\/\/(?:www\.|pplus\.)?ynet\.co\.il\/[^"#?]*?\/article\/([A-Za-z0-9]+))(?:#[^"]*)?"/);
        const image = region.match(/<img[^>]+src="(https:[^"]+)"/);
        const subtitle = region.match(/class="slotSubTitle"[^>]*>([\s\S]*?)<\/[^>]+>/);
        const title = text(hero[1]);
        if (link && title && safeStory(link[1].replace(/^https:\/\/pplus\./, "https://www."))) byId.set(link[2], { link: link[1].replace(/^https:\/\/pplus\./, "https://www."), title, img: image && safeImage(decode(image[1])) ? decode(image[1]) : "", summary: subtitle ? text(subtitle[1]) : "" });
      }
    }
    for (const m of seg.matchAll(/<a\b[^>]*href="(https:\/\/(?:www\.|pplus\.)?ynet\.co\.il\/[^"#?]*?\/article\/([A-Za-z0-9]+))[^\"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
      const [, href, id, inner] = m;
      const link = href.replace(/^https:\/\/pplus\./, "https://www.");
      if (!safeStory(link)) continue;
      const item = byId.get(id) || { link, title: "", img: "", summary: "" };
      const img = inner.match(/<img[^>]+src="(https:[^"]+)"/);
      if (!item.img && img && safeImage(decode(img[1]))) item.img = decode(img[1]);
      const sub = inner.match(/class="slotSubTitle"[^>]*>([\s\S]*?)<\/[^>]+>/);
      if (!item.summary && sub) item.summary = text(sub[1]);
      if (!item.title) {
        const title = inner.match(/data-tb-title[^>]*>([\s\S]*?)<\/(?:span|h\d)>/);
        item.title = text(title ? title[1] : inner.replace(/<img\b[^>]*>/g, ""));
      }
      byId.set(id, item);
    }
    const items = [...byId.values()].filter((x) => x.title && safeStory(x.link));
    if (items.length) out.push({ name: bounds[i].name, items });
  }
  if (!out.length) throw new Error("no homepage stories parsed");
  return out;
}
// RSS flashes may have an empty description. Hydrate the latest four from
// their published full article body before replacing the static accordions.
async function addFlashText(item) {
  let summary = item.summary;
  try {
    const r = await fetch(item.link, { headers: { "user-agent": "Mozilla/5.0 (compatible; ynet-clean RSS reader)", "accept-language": "he" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (!r.ok || !safeStory(r.url || item.link)) throw new Error("flash detail unavailable");
    const html = await r.text();
    const match = html.match(/"articleBody"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const articleBody = match ? JSON.parse('"' + match[1] + '"') : "";
    if (articleBody) summary = text(articleBody);
    if (!summary || summary === item.title) {
      const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
      if (description) summary = text(description);
    }
  } catch {
    // Retain a useful RSS description if the detail source is unavailable.
  }
  // Never replace working static flashes with title-only live cards.
  if (!summary || summary === item.title) throw new Error("flash full text unavailable");
  return { ...item, summary };
}
async function fetchFlashes() {
  const r = await fetch(BASE + "StoryRss1854.xml", { headers: { "user-agent": "Mozilla/5.0 (compatible; ynet-clean RSS reader)", "accept-language": "he" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`flash RSS HTTP ${r.status}`);
  const xml = await r.text(), items = [];
  const field = (b, name) => { const m = b.match(new RegExp(`<${name}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${name}>`, "i")); return (m ? (m[1] ?? m[2] ?? "") : "").trim(); };
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const b = m[1], title = decode(field(b, "title")), link = field(b, "link");
    if (!title || !safeStory(link)) continue;
    const raw = field(b, "description"), image = raw.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
    const summary = text(raw.replace(/<img\b[^>]*>/gi, " "));
    const date = new Date(field(b, "pubDate"));
    items.push({ title, link, summary, img: image && safeImage(image[1]) ? image[1] : "", date: Number.isNaN(+date) ? "" : date.toISOString() });
  }
  if (!items.length) throw new Error("no flash RSS items parsed");
  return Promise.all(items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)).slice(0, 4).map(addFlashText));
}
export async function onRequestGet() {
  const cache = caches.default;
  const key = new Request("https://home-data.cache/v2/full-flashes");
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const [categories, flashes] = await Promise.all([fetchHome(), fetchFlashes()]);
    const response = new Response(JSON.stringify({ fetchedAt: new Date().toISOString(), categories, flashes }), { headers: { ...htmlHeaders, "cache-control": "public, max-age=300, s-maxage=300" } });
    await cache.put(key, response.clone());
    return response;
  } catch {
    return new Response(JSON.stringify({ error: "live homepage unavailable" }), { status: 502, headers: { ...htmlHeaders, "cache-control": "no-store" } });
  }
}
