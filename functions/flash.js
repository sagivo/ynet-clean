const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
const htmlHeaders = { "content-type": "text/html; charset=utf-8", "referrer-policy": "no-referrer" };
const safeImage = (u) => /^https:\/\/(?:[a-z0-9-]+\.)*yit\.co\.il\//i.test(u) ? u : "";
const safeStory = (u) => /^https:\/\/(?:www\.)?ynet\.co\.il\/[A-Za-z0-9_\-\/.%]+$/.test(u) ? u : "";

export async function onRequestGet({ request }) {
  const p = new URL(request.url).searchParams;
  if (!p.has("ft")) {
    let rows = "";
    let error = "";
    try {
      const r = await fetch("https://www.ynet.co.il/Integration/StoryRss1854.xml", { headers: { "user-agent": "Mozilla/5.0 (compatible; ynet-clean RSS reader)", "accept-language": "he" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const xml = await r.text();
      const field = (b, name) => {
        const m = b.match(new RegExp(`<${name}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${name}>`, "i"));
        return (m ? (m[1] ?? m[2] ?? "") : "").trim();
      };
      const decode = (v) => v.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
      const fmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
        const b = m[1];
        const title = decode(field(b, "title"));
        const link = field(b, "link");
        const desc = decode(field(b, "description").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
        const date = new Date(field(b, "pubDate"));
        if (!title || !/^https:\/\/(www\.)?ynet\.co\.il\//.test(link)) continue;
        const params = new URLSearchParams({ ft: title, fs: desc || title, fd: Number.isNaN(+date) ? "" : fmt.format(date), fo: "ynet", fu: link });
        rows += `<article><a href="/flash?${params}">${esc(title)}</a>${desc ? `<p>${esc(desc)}</p>` : ""}<time>${Number.isNaN(+date) ? "" : fmt.format(date)}</time></article>`;
      }
      if (!rows) error = "אין מבזקים זמינים כרגע.";
    } catch { error = "לא ניתן לטעון מבזקים כרגע. נסו שוב בעוד כמה דקות."; }
    return new Response(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>מבזקים | ynet נקי</title><link rel="stylesheet" href="/style.css?v=flashes-20261002"><style>.flash-list{max-width:720px;margin:12px auto;padding:0 12px}.flash-list h2{font-size:20px;color:var(--ac);margin:8px 0 14px}.flash-list article{padding:12px 0;border-bottom:1px solid var(--ln)}.flash-list article>a{font-weight:700;color:inherit;text-decoration:none;font-size:17px}.flash-list p{margin:5px 0;color:var(--mut);font-size:15px}.flash-list time{font-size:13px;color:var(--mut)}</style></head><body><header><h1><a href="/">ynet נקי</a><span class="tag">בלי ספאם, רק תוכן</span></h1></header><main class="flash-list"><nav><a href="/">‹ חזרה לראשי</a></nav><h2>מבזקים</h2>${rows || `<p>${esc(error)}</p>`}</main></body></html>`, { headers: { ...htmlHeaders, "cache-control": "public, max-age=180" } });
  }
  const title = p.get("ft") || "מבזק";
  const text = p.get("fs") || title;
  const img = safeImage(p.get("fi") || "");
  const time = p.get("fd") || "";
  const source = p.get("fo") || "ynet";
  const story = safeStory(p.get("fu") || "");
  return new Response(`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>${esc(title)} | מבזק | ynet נקי</title><link rel="stylesheet" href="/style.css?v=compact"><style>
.flash-view{max-width:720px;margin:18px auto;padding:0 12px}.flash-card{background:color-mix(in srgb,var(--ln) 68%,var(--bg));border-radius:4px;padding:14px 16px;color:var(--fg)}.flash-head{display:flex;align-items:flex-start;gap:12px}.flash-title{font-size:22px;line-height:1.35;font-weight:750;margin:0;flex:1}.flash-thumb{width:92px;height:92px;object-fit:cover;border-radius:2px;flex:none;background:var(--ln)}.flash-copy{font-size:19px;line-height:1.55;margin:16px 0 12px;white-space:pre-line;overflow-wrap:anywhere}.flash-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;color:var(--mut);font-size:14px;border-top:1px solid var(--ln);padding-top:10px}.flash-source{font-size:15px}.flash-nav{display:flex;justify-content:space-between;align-items:center;margin:16px 2px;color:var(--mut);font-weight:650}.flash-nav a{color:inherit;text-decoration:none}.flash-source-link{color:var(--mut);font-size:14px;margin:12px 0 0}.flash-source-link a{color:inherit}@media(max-width:600px){.flash-view{margin:10px auto;padding:0 10px}.flash-card{padding:12px}.flash-title{font-size:20px;line-height:1.35}.flash-thumb{width:82px;height:82px}.flash-copy{font-size:18px;line-height:1.55;margin:14px 0 10px}}
</style></head><body><header><h1><a href="/">ynet נקי</a></h1></header><main class="flash-view"><nav class="flash-nav"><a href="/">‹ לכל המבזקים</a><span>מבזקים</span></nav><article class="flash-card"><div class="flash-head"><h1 class="flash-title">${esc(title)}</h1>${img ? `<img class="flash-thumb" src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : ""}</div><p class="flash-copy">${esc(text)}</p><div class="flash-meta"><span class="flash-source">(${esc(source)})</span><time>${esc(time)}</time></div>${story ? `<p class="flash-source-link"><a href="${esc(story)}" rel="noopener noreferrer">למבזק המקורי ב-ynet</a></p>` : ""}</article></main></body></html>`, { headers: { ...htmlHeaders, "cache-control": "public, max-age=300" } });
}
