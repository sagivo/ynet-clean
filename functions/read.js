import { extract, render } from "./extract.js";

const OK = /^https:\/\/(www\.)?ynet\.co\.il\/[A-Za-z0-9_\-\/.%]+$/;
const htmlHeaders = { "content-type": "text/html; charset=utf-8", "referrer-policy": "no-referrer" };

export async function onRequestGet({ request }) {
  const u = new URL(request.url).searchParams.get("u") || "";
  if (!OK.test(u)) return new Response("כתובת לא תקינה", { status: 400, headers: htmlHeaders });
  const cache = caches.default;
  const key = new Request("https://reader.cache/" + encodeURIComponent(u));
  const hit = await cache.match(key);
  if (hit) return hit;
  let r;
  try {
    r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; ynet-clean reader)", "accept-language": "he" }, redirect: "follow" });
  } catch { r = null; }
  if (!r || !r.ok) return new Response(`<meta charset="utf-8"><p dir="rtl">לא הצלחנו לטעון את הכתבה. <a href="${u}">פתח באתר המקורי</a></p>`, { status: 502, headers: htmlHeaders });
  if (!OK.test(r.url)) return new Response("redirect blocked", { status: 400 });
  const a = extract(await r.text());
  const params = new URL(request.url).searchParams;
  const flashTitle = params.get("ft") || "";
  const flashText = params.get("fs") || "";
  if (!a.blocks.some((b) => b.t === "p") && flashTitle) {
    a.title = flashTitle;
    a.blocks.unshift({ t: "p", s: flashText || flashTitle });
  }
  const res = new Response(render(a, u), { headers: { ...htmlHeaders, "cache-control": "public, max-age=300" } });
  await cache.put(key, res.clone());
  return res;
}
