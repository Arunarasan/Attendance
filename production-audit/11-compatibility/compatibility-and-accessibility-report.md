# Browser, Device and Accessibility Report (Phase 9 of the plan)

- **Date:** 2026-11-11. This report only restates what was and was **not** measured; the detailed findings are in the [UI/UX report](../04-ui-ux/ui-ux-report.md).

## What was tested
| Area | Result |
|---|---|
| Browser engine | **Chromium only** (the built-in browser pane of the desktop app) |
| Widths | 1440, 768 and 375 px: no horizontal overflow on 9 HR pages and the employee portal |
| Production build after the library upgrade (react-router 7, Vite 7) | All 9 HR pages navigate; login, forced password screen, face-punch page load; no console errors from the app |
| Accessibility checks I could script | After the fixes: every HR page has one `<h1>`; 0 unlabelled form fields on all pages and the Add-employee dialog; 0 text-contrast failures on measurable text; 0 controls under 32 px on phone widths (one inline link exempt) |

## What was NOT tested (so no claim is made)
- **Firefox, Safari, Edge**, older browsers, iOS Safari quirks (camera permission, location prompts).
- **Real phones and tablets**; touch behaviour was emulated only at the screen-size level. **The Android app** was not built or run.
- **Camera-based screens** (face punch, kiosk, enrolment): the test browser blocks the camera, so recognition quality, low-light behaviour and the "turn your head" check were not exercised.
- **Keyboard-only use** (tab order, focus visibility, dialog focus trap), **screen readers**, zoom to 200%, reduced motion, high-contrast mode, WCAG 2.2 AA as a whole.
- About a quarter to nearly half of text sits over photo or gradient backgrounds and could not be contrast-measured.
- axe-core and Lighthouse were not run (not installed).

## Status
**Compatibility: NOT VERIFIED beyond Chromium.** **Accessibility: the specific Phase 3 findings are fixed, WCAG 2.2 AA is not certified.** Recommended before launch: run axe-core and Lighthouse, test in Firefox and Safari, and test the Android app and face punch on real devices in the real office light.
