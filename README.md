# ynet-clean

Ad-free, static, Hebrew RTL front page built from ynet's public RSS feeds.
`node build.mjs` fetches the feeds and writes `dist/`. Cloudflare Pages: build command `node build.mjs`, output `dist`.
A GitHub Action triggers a Cloudflare deploy hook every 20 minutes to keep it fresh.

`functions/read.js` is a Cloudflare Pages Function: `/read?u=<ynet article url>` fetches the article live, extracts the body and renders a clean reader page (5 min edge cache). Only ynet.co.il URLs are accepted.
