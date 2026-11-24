# PHAZE Clock Mode — QA checklist (feature/clock-mode)

## Changes
- Dedicated **Planner** ↔ **Clock** mode. Clock is read-only, keeps the existing SVG 16-hour dial, event rings, current time, and elapsed-time visualization.
- Clock fills the screen, with mobile portrait and landscape responsive layouts. Device orientation does not need to be locked.
- Clock view persists in localStorage under `phaze-view-mode`; this setting is **device-local** and is not included in Supabase sync.
- **Screen Wake Lock** can be enabled explicitly; preference is stored under `phaze-clock-wake-lock`. A failed request does not permanently lock the UI. Restore lock when page becomes visible, when supported.
- Optional Fullscreen API button (hidden on browsers without support). iOS cannot replace the system lock screen; install as a PWA for a standalone view.
- Red overtime arc and "Иди спать" start exactly 16 hours after that day's scheduled wake-up and remain until the **next scheduled wake-up**, including when midnight passes.
- During Clock Mode the date follows the *most recent scheduled wake-up*, not the current calendar date. Planner retains its original date navigation.
- Unchanged: event storage schema (`phaze-v0.1.0`), `window.PHAZESync` contract, custom events, and Google Calendar behavior.

## Automated structural checks (2026-11-24)
- [x] JavaScript syntax parses.
- [x] No duplicate static HTML element IDs.
- [x] All new controls exist in markup, script and style.
- [x] Mode state and Wake Lock preference are stored independently from the plan data.
- [x] Render path and mode switching execute with mocked DOM.
- [x] 07:00 current cycle: 16h remaining, not overdue.
- [x] 22:59: 1 minute remaining, not overdue.
- [x] 23:01: overdue, red mode, 1 minute past limit.
- [x] Next day 00:30: previous wake date remains active and overdue.
- [x] Next day 06:59: still overdue.
- [x] Next day 07:00: new cycle, not overdue.
- [x] Switching back to Planner clears overtime styling.

## Device acceptance — NOT YET VERIFIED
- [ ] Render and overflow at 375×812 portrait, 812×375 landscape, 1024×768 tablet, 1440×900 desktop.
- [ ] Real touch tap/scroll, safe-area insets and buttons on iPhone 12 mini.
- [ ] Installed PWA cold launch preserves Clock Mode.
- [ ] Wake Lock API behavior in Safari iOS installed PWA and Chrome Android; release/reacquire on app background/foreground.
- [ ] Fullscreen API supported and unsupported browsers.
- [ ] Real Supabase sync during mode switching, on two devices.
- [ ] Old storage backup/import and events remain intact after branch promotion.

## Release policy
This is an isolated feature branch. Do **not** deploy directly to `main` / production v0.1.2. Review in PR to `v0.2`; republish existing DEV Site after review, preserve its permanent address, and obtain product-owner approval before stable release. Google Calendar remains out of scope.
