// Extract the readable article from a ynet article page (Draft.js body).
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
const text = (h) => decode(h.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, ""));
const safeImg = (u) => (/^https:\/\/[a-z0-9.-]*yit\.co\.il\//i.test(u) ? u : "");

function inlineHtml(h) {
  // keep bold spans and links' text only
  let out = "";
  const re = /<span[^>]*style="[^"]*font-weight:\s*bold[^"]*"[^>]*>([\s\S]*?)<\/span>(?=<span|<\/div>|$)|<span data-offset-key[^>]*>([\s\S]*?)<\/span>(?=<span|<\/div>|$)/g;
  const t = text(h);
  return esc(t).trim();
}

export function extract(html) {
  const meta = (p) => {
    const m = html.match(new RegExp(`<meta property="${p}" content="([^"]*)"`));
    return m ? decode(m[1]) : "";
  };
  const h1 = (html.match(/<h1 class="mainTitle">([\s\S]*?)<\/h1>/) || [])[1];
  const title = h1 ? text(h1).trim() : meta("og:title");
  const sub = (html.match(/class="subTitle"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
  const subtitle = sub ? text(sub).trim() : meta("og:description");
  let published = "", author = "";
  const ld = html.match(/<script type="application\/ld\+json">\s*(\{[\s\S]*?"@type":\s*"NewsArticle"[\s\S]*?\})\s*<\/script>/);
  if (ld) {
    try { const j = JSON.parse(ld[1]); published = j.datePublished || ""; author = j.author?.name || ""; } catch {}
  }
  const start = html.indexOf('id="ArticleBodyComponent"');
  let blocks = [];
  if (start >= 0) {
    let seg = html.slice(start);
    const end = seg.search(/class="[^"]*(?:ArticleFooter|articleFooter|RelatedArticles|taboola|TaboolaWrapper)/);
    if (end > 0) seg = seg.slice(0, end);
    const re = /<(div|figure|h[1-6]|ul|ol|blockquote)\b[^>]*data-block="true"[^>]*>/g;
    const starts = [...seg.matchAll(re)];
    starts.forEach((m, i) => {
      const chunk = seg.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : m.index + 20000);
      const cls = (m[0].match(/class="([^"]*)"/) || [])[1] || "";
      if (m[1] === "figure") {
        const img = (chunk.match(/<img[^>]+src="([^"]+)"/) || [])[1];
        const alt = (chunk.match(/class="ImageCaption"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
        const credit = (chunk.match(/class="ImageCredit"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
        if (img && safeImg(decode(img)))
          blocks.push({ t: "img", src: decode(img), cap: [alt, credit].filter(Boolean).map((x) => text(x).trim()).join(" ") });
        return;
      }
      let body = chunk.slice(m[0].length).replace(/<(script|style)[\s\S]*?<\/\1>/g, "").replace(/<figure[\s\S]*$/, "");
      const close = m[1] === "div" ? body.indexOf("</div></div>") : body.indexOf("</" + m[1] + ">");
      if (close >= 0) body = body.slice(0, close);
      const t = text(body.replace(/<\/div>\s*<div/g, "\n<div")).trim();
      if (!t || /^(פנייה לכתב|מצאתם טעות)/.test(t) || /^פנייה לכתב\/ת/.test(t)) return;
      if (/^h[1-6]$/.test(m[1]) || /pHeader|header/i.test(cls)) blocks.push({ t: "h", s: t });
      else blocks.push({ t: "p", s: t });
    });
  }
  const lead = safeImg(decode((meta("og:image") || "")));
  return { title, subtitle, published, author, blocks, lead };
}

export function render(a, url) {
  const date = a.published ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "full", timeStyle: "short" }).format(new Date(a.published)) : "";
  let body = "";
  for (const b of a.blocks) {
    if (b.t === "p") body += `<p>${esc(b.s).replace(/\n/g, "<br>")}</p>`;
    else if (b.t === "h") body += `<h2>${esc(b.s)}</h2>`;
    else if (b.t === "img") body += `<figure><img src="${esc(b.src)}" alt="" loading="lazy" referrerpolicy="no-referrer">${b.cap ? `<figcaption>${esc(b.cap)}</figcaption>` : ""}</figure>`;
  }
  const hasText = a.blocks.some((b) => b.t === "p");
  if (!hasText) body += `<p class="note">לא הצלחנו לחלץ את תוכן הכתבה (ייתכן שמדובר בכתבה מיוחדת, וידאו או תוכן למנויים).</p>`;
  const lead = !a.blocks.some((b) => b.t === "img") && a.lead ? `<figure><img src="${esc(a.lead)}" alt="" referrerpolicy="no-referrer"></figure>` : "";
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">
<title>${esc(a.title)} | ynet נקי</title>
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/reader.css?v=font-18px-20261003-adjust"></head><body>
<header><h1><a href="/">ynet נקי</a></h1></header>
<main class="reader"><article>
<h1 class="title">${esc(a.title)}</h1>
${a.subtitle ? `<p class="sub">${esc(a.subtitle)}</p>` : ""}
<div class="meta">${esc([a.author, date].filter(Boolean).join(" · "))}</div>
${lead}${body}
<p class="orig"><a href="${esc(url)}" rel="noopener noreferrer">לכתבה המקורית ב-ynet</a></p>
</article></main></body></html>`;
}
