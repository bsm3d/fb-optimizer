/**
 * =================================================================
 *  FB Optimizer - content.js  v1.1
 *  Author  : Benoît (BSM) Saint-Moulin - bsm3d.com
 *  License : MIT
 * =================================================================
 *
 *  The CSS file hides elements at document_start (before first paint).
 *  This script handles elements injected dynamically by React after
 *  initial load, and drives the per-block reveal/hide.
 *
 *  REVEAL MODEL
 *  ------------
 *  The static CSS rules for toggleable rubrics are gated behind
 *  attributes on <html> (:root): e.g. `:root:not([data-fbopt-reels-off])`.
 *  By default the attribute is absent → the rule is active → hidden with
 *  no flash. When a block is switched OFF, this script sets the matching
 *  `data-fbopt-<key>-off` attribute → the CSS stops hiding → content is
 *  revealed. The master switch uses `data-fbopt-off` (disables all gates).
 *  JS-hidden nodes carry `data-fbopt="<marker>"`; revealing strips it.
 *
 *  CPU STRATEGY
 *  ------------
 *  - Observer on document.body only (not documentElement)
 *  - Pre-filter: skip batches with no added element nodes
 *  - Scan only the subtrees of newly added nodes, not the full DOM
 *  - rAF throttle: max 1 scan per frame
 *  - Safety net: full DOM scan every 5s while visible
 *  - Auto-pause when tab is hidden
 *  - "Already hidden" is tracked by the data-fbopt attribute itself, so a
 *    revealed node can be re-hidden later (no stale WeakSet).
 *
 *  BLOCKS
 *  ------
 *  bl-reels        → Reels & short videos (feed cards + carousels + nav)
 *  bl-ads          → Sponsored posts + "Paid partnership" branded content
 *  bl-stories      → Stories
 *  bl-pymk         → People You May Know
 *  bl-marketplace  → Marketplace suggestions in feed
 *  bl-suggested    → Suggested for you / pages / groups from unfollowed sources
 *  bl-creator      → Creator & pro tools (Professional dashboard, Business
 *                    Suite, Ads Center / Ad Center, "Create ad" / "Boost post")
 *  bl-tracking     → fbevents.js & co. (handled by declarativeNetRequest)
 * =================================================================
 */

"use strict";

// -----------------------------------------------------------------
// Text helpers - robust against FB's obfuscation tricks
// -----------------------------------------------------------------

// Strip zero-width / bidi control characters FB sometimes injects into
// labels ("S​ponsored") and collapse whitespace.
const ZERO_WIDTH = /[​-‏‪-‮⁠﻿]/g;

function clean(str) {
  return (str || "").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
}

// innerText is layout-aware: it already ignores display:none / visibility:hidden
// decoy letters FB scatters inside the "Sponsored" label, so reading it + clean()
// defeats the common letter-salad obfuscation.
function txt(el) {
  return clean(el && el.innerText);
}

function startsWithAny(str, prefixes) {
  for (let i = 0; i < prefixes.length; i++) {
    if (str.startsWith(prefixes[i])) return true;
  }
  return false;
}

// -----------------------------------------------------------------
// Localized text sets for header/button detection
// -----------------------------------------------------------------

const REEL_TEXTS = new Set([
  "Reels", "Reels and short videos", "Reels et vidéos courtes",
  "Reels e video brevi", "Reels und Kurzvideos",
  "Reels y videos cortos", "Reels e vídeos curtos",
  "Short videos", "Vidéos courtes"
]);

const SPONSORED_TEXTS = new Set([
  "Sponsored", "Sponsored ·", "Sponsorisé", "Sponsorisée",
  "Patrocinado", "Patrocinada", "Gesponsert", "Sponsorizzato",
  "Publicité", "Suggested post"
]);

// "Paid partnership with <brand>" - variable suffix, matched by prefix.
const PAID_PARTNERSHIP = [
  "Paid partnership", "Partenariat rémunéré", "Partenariat payé",
  "Partenariat payant", "Bezahlte Partnerschaft", "Werbepartnerschaft",
  "Contenuto sponsorizzato", "Colaboración pagada", "Parceria paga",
  "Collaborazione a pagamento"
];

const PYMK_TEXTS = new Set([
  "People You May Know", "People you may know", "Suggestions d'amis",
  "Persone che potresti conoscere",
  "Personen, die du kennen könntest",
  "Personas que quizás conozcas"
]);

// Suggested feed content coming from pages / creators / groups you don't follow.
// NOTE: bare "Suggested"/"Suggestions" are intentionally excluded - FB reuses
// those labels on legitimate sections (friend suggestions, search).
const SUGGESTED_TEXTS = new Set([
  "Suggested for you", "Suggéré pour vous", "Suggestions pour vous",
  "Suggerito per te", "Für dich vorgeschlagen", "Sugerido para ti",
  "Sugerido para você",
  "Pages you may like", "Pages que vous pourriez aimer",
  "Pages suggérées", "Suggested pages",
  "Groups you may like", "Groupes que vous pourriez aimer",
  "Suggested groups", "Groupes suggérés",
  "People and Pages you may know"
]);

const MARKETPLACE_TEXTS = new Set([
  "Marketplace", "Items for sale near you",
  "Articles à vendre près de chez vous"
]);

// Creator / pro tooling - distinctive multi-word labels only (no generic
// single words like "Promote"/"Monetization", which hit legitimate UI).
const CREATOR_TEXTS = new Set([
  "Professional dashboard", "Tableau de bord professionnel",
  "Your professional dashboard",
  "Meta Business Suite", "Business Suite",
  "Ad Center", "Centre de publicités",
  "Ads Manager", "Gestionnaire de publicités",
  "Creator tools", "Outils de création"
]);

// -----------------------------------------------------------------
// Stable CSS selectors (no obfuscated React classes)
// -----------------------------------------------------------------

const REEL_SELECTORS = [
  'a[aria-label="reel"]',
  '[data-type="hscroll-child"]:has(a[aria-label="reel"])',
  'a[href^="/reel/"]',
  'a[href^="/reels/"]',
  '[data-pagelet*="Reels"]',
  '[data-pagelet*="reels"]',
  '[aria-label="Reels"][role="region"]',
  '[aria-label="Reels and short videos"]',
  '[role="navigation"] a[href*="/reel"]',
  '[role="tablist"] [href*="reel"]',
  '[data-tab-key="reels"]',
  'li:has(> a[href^="/reel/"])',
  'li:has(> a[href^="/reels/"])'
];

const STORY_SELECTORS = [
  '[data-pagelet*="Stories"]',
  '[aria-label="Stories"][role="region"]'
];

const PYMK_SELECTORS = [
  '[data-pagelet*="PeopleYouMayKnow"]',
  '[data-pagelet*="FriendSuggestions"]'
];

const MARKETPLACE_SELECTORS = [
  '[data-pagelet*="Marketplace"]'
];

// Creator / pro links are matched by their (stable) href - specific paths only.
const CREATOR_SELECTORS = [
  'a[href*="professional_dashboard"]',
  'a[href*="business.facebook.com"]',
  'a[href*="/adsmanager"]',
  'a[href*="/ads/manager"]',
  'a[href*="/ad_center"]'
];

// Promo controls with a specific aria-label.
const CREATOR_PROMO_SELECTORS = [
  'div[role="button"][aria-label="Create ad"]',
  'a[aria-label="Create ad"]',
  'div[role="button"][aria-label="Boost post"]'
];

// Map block key → data-fbopt marker value (used for reveal). bl-tracking is a
// network block and intentionally has no DOM marker.
const BLOCK_MARKERS = {
  "bl-reels":       "reel",
  "bl-ads":         "ad",
  "bl-stories":     "stories",
  "bl-pymk":        "pymk",
  "bl-marketplace": "marketplace",
  "bl-suggested":   "suggested",
  "bl-creator":     "creator"
};

// Block key → <html> gate attribute suffix (matches fb-optimizer.css).
// Only rubrics that have static CSS rules need a gate.
const CSS_GATES = {
  "bl-reels":       "reels",
  "bl-ads":         "ads",
  "bl-stories":     "stories",
  "bl-pymk":        "pymk",
  "bl-marketplace": "marketplace",
  "bl-creator":     "creator"
};

// -----------------------------------------------------------------
// State
// -----------------------------------------------------------------

let isEnabled    = true;
let blockedCount = 0;
let observer     = null;
let rafPending   = false;
let persistTimer = null;
let idleTimer    = null;   // full-scan safety net every 5s

// Per-block preferences
let blocks = {
  "bl-reels":       true,
  "bl-ads":         true,
  "bl-stories":     true,
  "bl-pymk":        true,
  "bl-marketplace": true,
  "bl-suggested":   true,
  "bl-creator":     true,
  "bl-tracking":    true
};

// Stored reference so we can remove the listener cleanly on pagehide
const onVisibilityChange = () => {
  if (document.hidden) {
    stopObserver();
  } else if (isEnabled) {
    startObserver();
  }
};

// -----------------------------------------------------------------
// Init - load prefs from storage
// -----------------------------------------------------------------

const STORAGE_DEFAULTS = {
  enabled: true, count: 0,
  "bl-reels": true, "bl-ads": true, "bl-stories": true,
  "bl-pymk":  true, "bl-marketplace": true, "bl-suggested": true,
  "bl-creator": true, "bl-tracking": true
};

browser.storage.local.get(STORAGE_DEFAULTS).then(data => {
  isEnabled    = data.enabled;
  blockedCount = data.count;
  Object.keys(blocks).forEach(k => { blocks[k] = data[k]; });
  applyCssGates();             // reflect saved prefs onto the CSS gates
  if (isEnabled) startObserver();
});

// -----------------------------------------------------------------
// CSS gating - enable/disable the static stylesheet per block
// -----------------------------------------------------------------

function applyCssGates() {
  const de = document.documentElement;
  if (!de) return;

  // Master off → add data-fbopt-off (CSS :not([data-fbopt-off]) disables all).
  de.toggleAttribute("data-fbopt-off", !isEnabled);

  Object.keys(CSS_GATES).forEach(k => {
    // Attribute present = "this block is OFF" = CSS rule disabled.
    de.toggleAttribute(`data-fbopt-${CSS_GATES[k]}-off`, !blocks[k]);
  });
}

// -----------------------------------------------------------------
// Core: hide a single node
// -----------------------------------------------------------------

function hideNode(node, marker) {
  if (!node || !(node instanceof Element)) return;
  // The data-fbopt attribute is the single source of truth for "already
  // hidden" - so a node revealed earlier can be hidden again later.
  if (node.hasAttribute("data-fbopt")) return;

  node.style.setProperty("display", "none", "important");
  node.setAttribute("data-fbopt", marker || "1");
  blockedCount++;
}

// -----------------------------------------------------------------
// Reveal: show back elements for a given marker (when block toggled off)
// -----------------------------------------------------------------

function showByMarker(marker) {
  const sel = marker ? `[data-fbopt="${marker}"]` : "[data-fbopt]";
  document.querySelectorAll(sel).forEach(el => {
    el.style.removeProperty("display");
    el.removeAttribute("data-fbopt");
    // Removing the attribute also clears the "already hidden" guard, so the
    // node becomes eligible for hiding again if the block is turned back on.
  });
}

// -----------------------------------------------------------------
// Scan functions - each checks its block flag first
// -----------------------------------------------------------------

function scanReels(root) {
  if (!blocks["bl-reels"]) return;

  // Header text approach (carousel widget + sidebar button)
  root.querySelectorAll('h2[dir="auto"], h3[dir="auto"]').forEach(h => {
    if (!REEL_TEXTS.has(txt(h))) return;
    const card = findContainerCard(h);
    hideNode(card || h.parentElement || h, "reel");
  });

  root.querySelectorAll('div > span[dir="auto"]').forEach(span => {
    if (txt(span) !== "Reels") return;
    const btn = findSidebarButton(span);
    if (btn) hideNode(btn, "reel");
  });

  // Stable attribute selectors
  REEL_SELECTORS.forEach(sel => {
    try {
      root.querySelectorAll(sel).forEach(el => {
        if (el.hasAttribute("data-fbopt")) return;
        // Prefer the hscroll-child wrapper over the <a> itself
        if (el.getAttribute("aria-label") === "reel") {
          const hs = el.closest('[data-type="hscroll-child"]');
          if (hs) { hideNode(hs, "reel"); return; }
        }
        const card = findContainerCard(el);
        hideNode(card || el, "reel");
      });
    } catch (_) {
      // :has() silently fails on unsupported browsers (FF < 121)
    }
  });
}

function scanSponsored(root) {
  if (!blocks["bl-ads"]) return;

  // aria-label on anchor tags - most reliable signal FB provides
  root.querySelectorAll('a[aria-label]').forEach(a => {
    const label = clean(a.getAttribute("aria-label"));
    if (!SPONSORED_TEXTS.has(label) && !startsWithAny(label, PAID_PARTNERSHIP)) return;
    const card = findFeedCard(a);
    hideNode(card || a, "ad");
  });

  // Span / header text fallback - limited to [role=feed] to avoid false positives.
  root.querySelectorAll(
    '[role="feed"] span[dir="auto"], [role="feed"] a[role="link"], [role="feed"] h4[dir="auto"]'
  ).forEach(el => {
    if (el.hasAttribute("data-fbopt")) return;
    const t = txt(el);
    if (!t) return;
    if (SPONSORED_TEXTS.has(t) || startsWithAny(t, PAID_PARTNERSHIP)) {
      const card = findFeedCard(el);
      hideNode(card || el, "ad");
    }
  });
}

function scanStories(root) {
  if (!blocks["bl-stories"]) return;
  STORY_SELECTORS.forEach(sel => {
    try {
      root.querySelectorAll(sel).forEach(el => hideNode(el, "stories"));
    } catch (_) {}
  });
}

function scanPYMK(root) {
  if (!blocks["bl-pymk"]) return;

  PYMK_SELECTORS.forEach(sel => {
    try {
      root.querySelectorAll(sel).forEach(el => hideNode(el, "pymk"));
    } catch (_) {}
  });

  root.querySelectorAll('h2[dir="auto"], h3[dir="auto"]').forEach(h => {
    if (!PYMK_TEXTS.has(txt(h))) return;
    const card = findContainerCard(h);
    hideNode(card || h.parentElement || h, "pymk");
  });
}

function scanMarketplace(root) {
  if (!blocks["bl-marketplace"]) return;
  // Never hide on the actual Marketplace page - only feed injections
  if (window.location.pathname.startsWith("/marketplace")) return;

  MARKETPLACE_SELECTORS.forEach(sel => {
    try {
      root.querySelectorAll(sel).forEach(el => hideNode(el, "marketplace"));
    } catch (_) {}
  });

  root.querySelectorAll('[role="feed"] h3[dir="auto"]').forEach(h => {
    if (!MARKETPLACE_TEXTS.has(txt(h))) return;
    const card = findContainerCard(h);
    hideNode(card || h.parentElement || h, "marketplace");
  });
}

function scanSuggested(root) {
  if (!blocks["bl-suggested"]) return;
  root.querySelectorAll(
    '[role="feed"] h2[dir="auto"], [role="feed"] h3[dir="auto"], [role="feed"] h4[dir="auto"]'
  ).forEach(h => {
    if (!SUGGESTED_TEXTS.has(txt(h))) return;
    const card = findFeedCard(h);
    hideNode(card || h.parentElement || h, "suggested");
  });

  // Carousel widgets (pages / groups you may like) carry a region label.
  // Scoped to role=region only (not complementary) to avoid hiding side columns.
  root.querySelectorAll('[role="region"][aria-label]').forEach(el => {
    if (el.hasAttribute("data-fbopt")) return;
    if (!SUGGESTED_TEXTS.has(clean(el.getAttribute("aria-label")))) return;
    hideNode(findContainerCard(el) || el, "suggested");
  });
}

function scanCreator(root) {
  if (!blocks["bl-creator"]) return;

  // Stable href-based links (left-rail shortcuts, ads/pro tools).
  CREATOR_SELECTORS.forEach(sel => {
    try {
      root.querySelectorAll(sel).forEach(a => {
        if (a.hasAttribute("data-fbopt")) return;
        const box = a.closest('li, [role="listitem"]') || a;
        hideNode(box, "creator");
      });
    } catch (_) {}
  });

  // Promo buttons with a specific aria-label.
  CREATOR_PROMO_SELECTORS.forEach(sel => {
    try {
      root.querySelectorAll(sel).forEach(el => hideNode(el, "creator"));
    } catch (_) {}
  });

  // Distinctive text labels - ONLY inside the navigation rail, so a stray
  // match in the feed/composer can't hide legitimate content.
  root.querySelectorAll(
    '[role="navigation"] a[role="link"], [role="navigation"] div[role="button"]'
  ).forEach(item => {
    if (item.hasAttribute("data-fbopt")) return;
    if (CREATOR_TEXTS.has(txt(item))) hideNode(item, "creator");
  });
}

// Run all scans on a given root element
function runAllScans(root) {
  scanReels(root);
  scanSponsored(root);
  scanStories(root);
  scanPYMK(root);
  scanMarketplace(root);
  scanSuggested(root);
  scanCreator(root);
  schedulePersist();
}

// -----------------------------------------------------------------
// DOM traversal helpers
// -----------------------------------------------------------------

// Walk up to find the feed "card" container for an element.
// Priority: data-pagelet > hscroll-child > article/li > div under feed
// Stops at role=feed/main, <main>, <body>
function findContainerCard(el) {
  let node  = el.parentElement;
  let depth = 0;

  while (node && depth < 16) {
    const tag     = node.tagName?.toLowerCase();
    const role    = node.getAttribute("role");
    const pagelet = (node.getAttribute("data-pagelet") || "").toLowerCase();
    const dtype   = node.getAttribute("data-type") || "";

    if (pagelet.includes("reel"))             return node;
    if (dtype === "hscroll-child")            return node;
    if (role === "feed" || role === "main")   break;
    if (tag  === "main" || tag === "body")    break;
    if (role === "article" || tag === "li")   return node;

    if (tag === "div") {
      const parentRole = node.parentElement?.getAttribute("role");
      if (parentRole === "feed" || parentRole === "main") return node;
    }

    node = node.parentElement;
    depth++;
  }
  return null;
}

// Walk up to find the article/div that is a direct child of [role=feed]
// Used for sponsored posts and suggested content
function findFeedCard(el) {
  let node  = el.parentElement;
  let depth = 0;

  while (node && depth < 20) {
    const role = node.getAttribute("role");
    const tag  = node.tagName?.toLowerCase();

    if (role === "article")                   return node;
    if (role === "feed" || role === "main")   break;
    if (tag  === "main" || tag === "body")    break;

    // div that is a direct child of [role=feed]
    if (tag === "div" && node.parentElement?.getAttribute("role") === "feed") {
      return node;
    }

    node = node.parentElement;
    depth++;
  }
  return null;
}

// Walk up to find a sidebar button/li/link - never goes past role=navigation
function findSidebarButton(span) {
  let node  = span.parentElement;
  let depth = 0;

  while (node && depth < 8) {
    const role = node.getAttribute("role");
    const tag  = node.tagName?.toLowerCase();

    if (role === "button" || role === "link")   return node;
    if (tag  === "li" || tag === "a")            return node;
    // Hard stop - we never want to hide the whole nav bar
    if (role === "navigation" || tag === "nav")  break;

    node = node.parentElement;
    depth++;
  }
  return null;
}

// -----------------------------------------------------------------
// MutationObserver - CPU-optimized
// -----------------------------------------------------------------

function mutationCallback(mutations) {
  // Pre-filter: collect only element nodes that were actually added
  // Ignoring attribute/characterData mutations and text nodes here
  // saves a lot of unnecessary rAF scheduling on FB's heavy re-renders
  let hasNewElements = false;

  for (let i = 0; i < mutations.length; i++) {
    const added = mutations[i].addedNodes;
    for (let j = 0; j < added.length; j++) {
      if (added[j].nodeType === 1) {   // ELEMENT_NODE only
        hasNewElements = true;
        break;
      }
    }
    if (hasNewElements) break;
  }

  if (!hasNewElements) return;  // all text / attribute noise → skip
  if (rafPending) return;

  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (!isEnabled) return;

    // Scan only the subtrees of newly added nodes - not the full DOM
    // This is the key CPU optimization vs a global querySelectorAll
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        const node = added[j];
        if (node.nodeType !== 1) continue;
        runAllScans(node);
      }
    }

    schedulePersist();
  });
}

function startObserver() {
  if (observer) return;

  // Initial full scan (synchronous, before observer starts)
  runAllScans(document.body || document.documentElement);

  // Observe body, not documentElement - avoids <head> noise
  observer = new MutationObserver(mutationCallback);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree:   true
    // No attributes, no characterData - not needed, saves CPU
  });

  // Safety net: full DOM scan every 5s to catch edge cases where
  // FB sets aria attributes after node insertion (2-step injection)
  idleTimer = setInterval(() => {
    if (isEnabled) runAllScans(document.body || document.documentElement);
  }, 5000);
}

function stopObserver() {
  if (observer) {
    observer.takeRecords();  // flush pending callbacks before disconnect
    observer.disconnect();
    observer = null;
  }
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
  rafPending = false;
}

// -----------------------------------------------------------------
// Persistence - throttled to avoid 60 writes/sec
// -----------------------------------------------------------------

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    browser.storage.local.set({ count: blockedCount });
  }, 2000);
}

// -----------------------------------------------------------------
// Cleanup on page unload
// -----------------------------------------------------------------

document.addEventListener("visibilitychange", onVisibilityChange);

window.addEventListener("pagehide", () => {
  stopObserver();
  document.removeEventListener("visibilitychange", onVisibilityChange);

  // Final flush before the page is unloaded
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  browser.storage.local.set({ count: blockedCount });
}, { once: true });

// -----------------------------------------------------------------
// Message handler (from popup)
// -----------------------------------------------------------------

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {

    case "GET_STATUS":
      sendResponse({ enabled: isEnabled, count: blockedCount, blocks });
      break;

    case "SET_ENABLED":
      isEnabled = msg.value;
      browser.storage.local.set({ enabled: isEnabled });
      applyCssGates();
      if (isEnabled) {
        startObserver();
      } else {
        stopObserver();
        showByMarker(null);  // reveal everything JS hid
      }
      sendResponse({ ok: true });
      break;

    case "SET_BLOCKS": {
      Object.keys(msg.blocks).forEach(k => {
        const wasActive = blocks[k];
        const nowActive = msg.blocks[k];
        blocks[k] = nowActive;

        // If a block was just turned off → reveal its JS-hidden elements
        if (wasActive && !nowActive && BLOCK_MARKERS[k]) {
          showByMarker(BLOCK_MARKERS[k]);
        }
      });
      applyCssGates();  // switch the static CSS gates to match new prefs
      // Re-scan to apply newly enabled blocks
      if (isEnabled) runAllScans(document.body || document.documentElement);
      sendResponse({ ok: true });
      break;
    }

    case "RESET_COUNT":
      blockedCount = 0;
      browser.storage.local.set({ count: 0 });
      sendResponse({ ok: true });
      break;
  }

  return true;  // keep message channel open for async sendResponse
});

// -----------------------------------------------------------------
// Cross-tab sync - keep every open Facebook tab in step with the popup
// -----------------------------------------------------------------
//
// The popup messages only the active tab, so other tabs would keep stale
// state. storage.local is shared, so we reconcile from storage.onChanged.
// (Writes from this tab also fire here; the paths below are idempotent, and
// the frequent "count" write is ignored since it matches no case.)

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if ("enabled" in changes) {
    isEnabled = changes.enabled.newValue;
    applyCssGates();
    if (isEnabled) {
      startObserver();
    } else {
      stopObserver();
      showByMarker(null);
    }
  }

  let blocksChanged = false;
  Object.keys(BLOCK_MARKERS).forEach(k => {
    if (!(k in changes)) return;
    const nowActive = changes[k].newValue;
    // Block just turned off → reveal its JS-hidden elements
    if (blocks[k] && !nowActive) showByMarker(BLOCK_MARKERS[k]);
    blocks[k] = nowActive;
    blocksChanged = true;
  });

  if (blocksChanged) {
    applyCssGates();
    if (isEnabled) runAllScans(document.body || document.documentElement);
  }
});
