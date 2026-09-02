# Sami — the five things only you can do

Deadline: **Wednesday 2026-09-03, 1:00 p.m. PDT.** Nothing is submitted
without you. Everything else is being built and verified by Claude.

## 1. Create the empty public repo (2 min) — needed first

GitHub → New repository → name **`degreelume-webmcp`**, **Public**, no README,
no licence, no .gitignore (the repo already has all three). Then tell Claude
"repo exists" and it pushes. The licence file must be visible at the top of the
repo page — it will be, it is `LICENSE` in the root.

## 2. Turn WebMCP on in your Chrome (1 min)

Chrome 152 has the API behind a flag. Open

```
chrome://flags/#enable-webmcp-testing
```

set it to **Enabled**, relaunch. Then on any page, DevTools console:
`typeof document.modelContext` should print `"object"`.

Optional but better for judges: register the origin trial so visitors need no
flag. https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241
→ origin `https://assistant.degreelume.com` → copy the token → paste it to
Claude, who puts it in `index.html`.

Also install the **Model Context Tool Inspector** extension
(https://chromewebstore.google.com/detail/gbpdfapgefenggkahomfgkhfehlcenpd,
by a Chrome engineer) — it shows registered tools, lets you call them by hand,
and can let Gemini drive them; useful in the video if you do not have the
ChatGPT desktop app.

## 3. Record the demo (20–30 min of your time)

Script: `docs/DEMO_SCRIPT.md` (word for word, under 3 minutes, written against
the app that exists). Claude drives the screen; you narrate. Audio is required.
Record with the ChatGPT desktop app's built-in browser if you have it
(site-tools arrow in the address bar is the money shot), otherwise flagged
Chrome + the Tool Inspector.

## 4. Upload to YouTube (5 min)

Public (not unlisted). Title: "DegreeLume Assistant — a college counselor your
AI agent can call (WebMCP Challenge)". Paste the link to Claude.

## 5. Devpost (10 min)

https://webmcp.devpost.com → Register → accept the rules → Submit project.
Every field is pre-written in `docs/SUBMISSION.md`; paste them. Attach the
YouTube link, the repo URL and the live URL. Submit before 1:00 p.m. PDT.
**Do not edit the repo or the live site after submitting** — the rules say
changes during judging risk eligibility.

## Live URL

`https://assistant.degreelume.com` — Claude deploys this to a separate
Cloudflare Worker (`degreelume-webmcp`). It cannot touch degreelume.com.
