const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const htmlHeaders = { "content-type": "text/html; charset=utf-8", "referrer-policy": "no-referrer" };
const safeImage = (u) => /^https:\/\/(?:[a-z0-9-]+\.)*yit\.co\.il\//i.test(u) ? u : "";
const safeStory = (u) => /^https:\/\/(?:www\.)?ynet\.co\.il\/[A-Za-z0-9_\-\/.%]+$/.test(u) ? u : "";

export async function onRequestGet({ request }) {
  const p = new URL(request.url).searchParams;
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
