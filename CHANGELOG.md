# Changelog

## 1.1.0

Manifest V3 migration (Firefox) and stronger hiding.

- Migrated to Manifest V3: `action` instead of `browser_action`, background as a
  non-persistent event page (`background.scripts`), permissions split into
  `permissions` + `host_permissions` (scoped to facebook.com only).
- Tracker blocking moved from blocking `webRequest` to `declarativeNetRequest`
  (`rules.json`), excluding facebook.com as initiator. The tracking toggle is
  now functional (it was cosmetic in 1.0.0).
- New "Creator & pro tools" block (Professional dashboard, Meta Business Suite,
  Ad Center, "Create ad" / "Boost post").
- "Paid partnership" branded content folded into the ads block; suggested block
  extended to pages and groups; Reels carousels covered.
- Anti-obfuscation cleanup of the "Sponsored" label (zero-width / bidi strip).
- Per-block CSS gating via `<html>` attributes, so turning a block off reveals
  its content (previously the static CSS stayed active).
- Cross-tab sync: all open Facebook tabs react to popup changes via
  `storage.onChanged`.
- Replaced the WeakSet "already hidden" guard with a data-attribute check so a
  revealed node can be hidden again.

## 1.0.0

Initial release (Manifest V2).
