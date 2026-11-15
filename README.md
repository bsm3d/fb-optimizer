# FB Optimizer

A Firefox extension that removes Reels, ads, Stories, suggested-creator content
and trackers from Facebook, for a faster and cleaner feed.

- Manifest V3 (Firefox)
- No data collection, no remote servers, no analytics
- Stable selectors only (aria / href / data attributes), never obfuscated class names

Author: Benoit (BSM) Saint-Moulin, https://www.bsm3d.com

## Features

Eight independent toggles (master switch + per-block), all on by default:

| Block | What it hides |
|---|---|
| Reels & short videos | Feed cards, creator carousels, nav entries |
| Sponsored posts | Sponsored ads + "Paid partnership" branded content |
| Stories | The Stories tray |
| People You May Know | Friend-suggestion blocks |
| Marketplace in feed | Marketplace injections (never the Marketplace page itself) |
| Suggested for you & pages | Suggested posts, pages and groups from sources you do not follow |
| Creator & pro tools | Professional dashboard, Meta Business Suite, Ad Center, "Create ad" / "Boost post" |
| Tracking pixel | Blocks fbevents.js and FB SDK scripts loaded by third-party sites |

Hiding is resilient to Facebook's label obfuscation: label text is cleaned
(zero-width / bidi characters stripped) and read via `innerText`, which already
ignores the hidden decoy letters scattered inside the "Sponsored" label.

## How it works

- **DOM hiding** (`src/fb-optimizer.css` + `src/content.js`): the CSS hides
  stable selectors at `document_start` (before first paint, no flash); the
  content script catches elements injected dynamically by React, using a
  CPU-optimized MutationObserver. Each toggleable block is gated behind an
  attribute on `<html>`, so turning a block off genuinely reveals its content.
- **Tracker blocking** (`src/rules.json` + `src/background.js`): a
  `declarativeNetRequest` static ruleset blocks FB tracking scripts
  (`fbevents.js`, `all.js`, `sdk.js`, `signals`) loaded by third-party sites,
  while excluding facebook.com as initiator so FB can still load its own SDK.
  The background event page enables/disables the ruleset according to the
  master switch and the tracking toggle.

## Install (temporary, unsigned)

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select `src/manifest.json`

A temporary add-on is removed when Firefox restarts. For a permanent install the
XPI must be signed through addons.mozilla.org (or `web-ext sign`).

## Develop

Requires [web-ext](https://github.com/mozilla/web-ext) (via `npx`, no install needed).

Lint:

```bash
npx -y web-ext lint --source-dir src
```

Run in a fresh Firefox profile with hot reload:

```bash
npx -y web-ext run --source-dir src
```

Build a package:

```bash
npx -y web-ext build --source-dir src --ignore-files README.md
```

## Project structure

```
src/
  manifest.json        Manifest V3, id fb-optimizer@bsm3d.com
  background.js        Event page: toggles the DNR ruleset
  rules.json           declarativeNetRequest tracker rules
  content.js           Dynamic DOM hiding (MutationObserver)
  fb-optimizer.css     Static hiding at document_start, gated per block
  popup.html / popup.js  Popup UI: master switch + 8 block toggles, counters
  icons/               16 / 32 / 48 / 128
```

## Compatibility

Firefox 140+ (desktop), Firefox for Android 142+.

## Privacy

The extension stores only your toggle preferences and a local block counter in
`storage.local`. Nothing is sent anywhere. The counter reflects DOM hides only;
trackers blocked by `declarativeNetRequest` are not counted (the API does not
report matches in production), so the number understates the real work.

## License

MIT, see [LICENSE](LICENSE).
