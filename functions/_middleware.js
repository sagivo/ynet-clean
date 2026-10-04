import { onRequestGet as getHomeData } from "./home-data.js";

const esc = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const validLink = (u) => /^https:\/\/(?:www\.)?ynet\.co\.il\/[A-Za-z0-9_\-\/.%]+$/.test(u) && /\/article\/[A-Za-z0-9]+$/.test(u);
const image = (url) => /^https:\/\/(?:[a-z0-9-]+\.)*yit\.co\.il\//i.test(url) ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : "";
const readUrl = (u) => "/read?u=" + encodeURIComponent(u);
const labels = { "חדשות": "news", "כלכלה וצרכנות": "economy", "ספורט": "sport", "תרבות ובידור": "culture", "בריאות וכושר": "health", "דיגיטל": "digital", "פסק דין": "law" };
const clock = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
const time = (value) => { const date = new Date(value); return Number.isNaN(+date) ? "" : clock.format(date); };
function flash(item) {
  return `<details class="fl"><summary><span>${esc(item.title)}</span><time>${time(item.date)}</time></summary><div class="fb">${image(item.img)}${item.summary && item.summary !== item.title ? `<p>${esc(item.summary)}</p>` : ""}<a href="${readUrl(item.link)}">לכתבה המלאה ‹</a></div></details>`;
}
function story(item, lead) {
  const title = `<span class="b"><span class="h">${esc(item.title)}</span>${lead && item.summary ? `<span class="lead-summary">${esc(item.summary)}</span>` : ""}</span>`;
  return `<article${lead ? ' class="lead-story"' : ""}><a${lead ? "" : ' class="t"'} href="${readUrl(item.link)}">${image(item.img)}${title}</a></article>`;
}
export function renderHome(data) {
  if (!Array.isArray(data.categories) || !Array.isArray(data.flashes)) throw new Error("invalid live homepage");
  const blocks = [];
  for (const block of data.categories) {
    if (!Array.isArray(block.items)) throw new Error("invalid homepage block");
    const name = block.name === "TOP" ? "חדשות" : block.name;
    const last = blocks.at(-1);
    if (block.name !== "TOP" && name === "חדשות" && last?.name === name) last.items.push(...block.items);
    else blocks.push({ name, items: [...block.items] });
  }
  let count = 0;
  const html = blocks.map(({ name, items }) => {
    const seen = new Set();
    const list = items.filter(item => item.title && validLink(item.link) && !seen.has(item.link) && seen.add(item.link));
    if (!list.length) return "";
    count += list.length;
    const slug = labels[name] || "";
    const heading = slug ? `<a href="${slug}.html">${esc(name)}</a><a class="all-category" href="${slug}.html">לכל הכותרות ‹</a>` : `<span>${esc(name)}</span>`;
    const rows = list.map((item, i) => story(item, name === "חדשות" && i === 0));
    const flashes = data.flashes.filter(item => item.title && item.summary && validLink(item.link));
    if (name === "חדשות" && flashes.length) rows.splice(5, 0, `<section class="flashes"><h2>מבזקים אחרונים</h2>${flashes.map(flash).join("")}</section>`);
    return `<section class="home-category" data-category="${slug || "x"}"><h2 class="category-heading">${heading}</h2>${rows.join("")}</section>`;
  }).join("");
  if (!count || !html.includes('class="lead-story"')) throw new Error("live lead unavailable");
  return html;
}
export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if ((path !== "/" && path !== "/index.html") || context.request.method !== "GET") return context.next();
  const baseline = await context.next();
  if (!baseline.ok || !baseline.headers.get("content-type")?.includes("text/html")) return baseline;
  let html, updated;
  try {
    const response = await getHomeData();
    if (!response.ok) throw new Error("live source unavailable");
    const data = await response.json();
    html = renderHome(data);
    const date = new Date(data.fetchedAt);
    updated = "עודכן לפי ynet: " + new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long" }).format(date) + ", " + time(data.fetchedAt) + ". הכתבות נטענות מ-ynet בזמן קריאה.";
  } catch {
    // Source outage: serve the complete static baseline, with no later swap.
  }
  const rewriter = new HTMLRewriter().on("script", { element(element) { element.remove(); } });
  if (html) {
    rewriter.on("main", { element(element) { element.setInnerContent(html, { html: true }); } });
    rewriter.on("footer", { element(element) { element.setInnerContent(esc(updated), { html: true }); } });
  }
  const output = rewriter.transform(baseline);
  const headers = new Headers(output.headers);
  headers.delete("etag");
  headers.delete("last-modified");
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-home-render", html ? "live" : "static-fallback");
  return new Response(output.body, { status: output.status, headers });
}
