# What's new, the guide, and update notices

## What people see

- **After an update**: the first time someone opens the planner after a new release, a **What's new** window lists what changed since their last visit (at most the four latest releases). **Show me around** opens the guide; **Got it** closes it. It only shows once per release.
- **First visit**: the **guide** opens instead, a short walk through the planner in nine steps (Next / Back, the arrow keys, or the dots; Skip closes it).
- **Any time**: the `?` cheatsheet has **What's new** and **Guide** links.
- **New version online while the planner is open**: the tab checks every 30 minutes (and when you come back to it) whether a newer build has been deployed, and shows a notice with **Reload**. Reloading then shows What's new.

## Releasing something

Add an entry at the top of `RELEASES` in `src/config/releases.ts`: an `id` (the date, `2026-11-12`; add a letter for a second release that day: `2026-11-12b`), a short `title`, and a few `items` in plain words. A test checks the ids are unique and newest first. Without a new entry, people still get the reload notice but no What's new window.

## How it works

- `src/app/onboarding.ts` remembers the last release seen in this browser (`bp:onboarding:seenRelease`). Someone who used the planner before this existed (this browser already had a user id) sees the latest release; a browser with no trace of an earlier visit gets the guide.
- The build writes `version.json` (`{ "build": "<commit>" }`) next to the app, and bakes the same commit into the code (`__APP_BUILD__`, see `vite.config.ts` and `scripts/build-id.mjs`). The open tab compares the two. The daily rebuild for travel advisories uses the same commit, so it doesn't trigger a notice. Local development (`npm run dev`) never checks.

## Files

```
src/config/releases.ts     release notes
src/app/onboarding.ts      when to show what; update check
src/app/WhatsNew.svelte    What's new window
src/app/Guide.svelte       guide (steps in src/i18n/en.ts, guide.*)
scripts/build-id.mjs       commit id for the build
```
