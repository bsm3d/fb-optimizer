/**
 * FB Optimizer - background.js  v1.1  (Manifest V3, Firefox event page)
 * Author  : Benoît (BSM) Saint-Moulin - bsm3d.com
 * License : MIT
 *
 * Tracking is blocked with declarativeNetRequest (MV3-native, always-on,
 * no per-request JS wake-up). The static ruleset "fb-trackers" (rules.json)
 * blocks FB tracking scripts loaded by THIRD-PARTY sites and excludes
 * facebook.com itself (FB needs its own SDK on its own domain).
 *
 * This event page only reconciles the ruleset with the user prefs:
 *   - master switch   "enabled"
 *   - per-block switch "bl-tracking"
 * The ruleset ships enabled by default (manifest), so blocking works out
 * of the box even before this page is ever woken.
 */

"use strict";

const RULESET_ID = "fb-trackers";

async function syncRuleset() {
  const { enabled = true, "bl-tracking": trackingOn = true } =
    await browser.storage.local.get({ enabled: true, "bl-tracking": true });

  const shouldBlock = enabled && trackingOn;

  try {
    const active = await browser.declarativeNetRequest.getEnabledRulesets();
    const isOn = active.includes(RULESET_ID);
    if (shouldBlock === isOn) return; // already in the desired state

    await browser.declarativeNetRequest.updateEnabledRulesets(
      shouldBlock
        ? { enableRulesetIds: [RULESET_ID] }
        : { disableRulesetIds: [RULESET_ID] }
    );
  } catch (_) {
    // API unavailable or transient failure: the default manifest state stands.
  }
}

// Reconcile on install, on browser start, and whenever a relevant pref changes.
browser.runtime.onInstalled.addListener(syncRuleset);
browser.runtime.onStartup.addListener(syncRuleset);

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("enabled" in changes || "bl-tracking" in changes) syncRuleset();
});
