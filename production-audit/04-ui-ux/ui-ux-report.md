# UI/UX Audit Report (Phase 3)

- **Application:** Arudra Attender, commit `2a7cb43`
- **Date:** 2026-11-11
- **Environment:** production build (`frontend/dist`) served by a throwaway Node server ([audit-static-server.cjs](audit-static-server.cjs)) on :5180, proxying `/api` to the disposable backend on :8090 (empty DB + test data from Phase 2). Browser: the Claude desktop app's built-in Chromium pane. The user's live instance was not used.
- **Tools:** in-app browser, hand-written DOM checks run in the page (overflow, labels, alt text, tap-target size, text-contrast estimate). **Not run:** Playwright, Lighthouse, axe-core (not installed; installing needs approval).
- **Rule followed:** no UI was changed; issues are reported with suggestions only.

## What was checked
| Area | Coverage |
|---|---|
| Screens | Login, HR console (Dashboard, Employees, Attendance, Leave & Holidays, Approvals, Locations, Devices/Kiosks, Payroll, Settings), employee portal (Home, Attendance, Leave, Profile), `/punch` |
| Widths | Desktop 1440, tablet 768, phone 375 (HR console: all 9 pages at all 3 widths; portal at phone width) |
| States seen | Loading screen, login error, empty states ("No leave requests are waiting"), camera-denied state, populated lists |
| Not covered | Kiosk screen (needs camera), Firefox/Safari/Edge, real phone, dark mode, screen reader, long-text/overflow stress, modals beyond what was opened |

## Results summary
| Check | Result |
|---|---|
| Horizontal overflow, 27 HR page x width combinations | **0 found** |
| Horizontal overflow, 4 portal pages at 375 px | **0 found** |
| Console errors during normal use | None caused by the app (one MIME-type error was from my first static server having a path bug; reload of all assets afterwards returned 200) |
| Broken images | 0 |
| Images without `alt` | 0 |
| Controls with no accessible name | 0 |
| `<html lang>` and viewport meta | Present (`en`) |
| Minimum font size on portal | 11 px |
| Login error message | Shown ("Wrong email or password"); "Forgot Password?" toggles a hint telling users to ask HR |
| Camera denied on `/punch` | Handled: shows "Permission denied" and a sign-in fallback |

Automated checks total: about 40 page-state checks; findings below are only those that failed.

## Findings
Severity is for UI/UX/accessibility impact.

| ID | Sev | Finding | Where | Suggestion |
|---|---|---|---|---|
| UX-01 | Medium | **Form fields with no label, only a placeholder** (10 on Settings, 2 on Payroll, 1 on Attendance, 1 in the leave reason box). A placeholder disappears when typing and is not read as a label by many screen readers. | HR Settings, Payroll, Attendance, Portal Leave | Add `<label>` or `aria-label` |
| UX-02 | Medium | **Contrast below WCAG AA 4.5:1** for secondary text: muted grey help text about 4.3:1 on cream (many screens), "Absent" 4.11, "Checked In"/active tab 4.27, "Admin"/"Sign Out" 4.48, notification count badge 3.01, orange stat number 2.42 vs 3, required-field asterisk 2.75. Text over photo/gradient backgrounds could not be measured automatically (about 40% of text nodes), so the real failing count is likely higher. | All HR pages, portal | Darken the muted text token a little (e.g. from about 4.3 to 4.6+), darken orange/green accents |
| UX-03 | Low-Medium | **Many small tap targets (under 32 px)**, up to 15 per page (Locations, Leave & Holidays) | HR pages on phone | Enlarge icon buttons to 40-44 px on mobile |
| UX-04 | Low | **No `<h1>` on any HR page** (0 found); heading structure unverified elsewhere | HR console | Use one `<h1>` per page |
| UX-05 | Low | Login "Remember me" checkbox is exposed as "on" by the accessibility tree in the first read (its label wraps the input, so it works with a mouse) | Login | Verify with a screen reader |
| UX-06 | Low | Invalid saved data renders without complaint, e.g. the Locations page shows a fence at "999.00000, 77.59000" (from backend bug BUG-05). UI relies on the backend for validation | Locations | Add client-side range checks plus fix BUG-05 |
| UX-07 | Info | Camera-denied message on `/punch` is very small, low-emphasis text | Punch page | Make the error larger and add instructions for enabling the camera |
| UX-08 | Info | The first face-recognition model download is about 7 MB plus the 1.3 MB `face-api` script; first punch on slow mobile data will show "Starting camera..." for a while | Punch / Kiosk | Show a progress hint |

## Positive observations
- Layout is stable at all three widths: no horizontal scrolling, mobile bottom navigation in the portal, collapsible menu in the HR console.
- Consistent design language, clear empty states and error text, friendly language.
- All images have alt text; no unnamed buttons; every page loads without errors.

## Status
**UI/UX: PASS WITH ISSUES.** No blocker, but accessibility (labels, contrast, tap targets) does not yet meet WCAG 2.2 AA; this will be re-scored in Phase 9 with a proper tool (axe-core) if approved. Overall: not a release blocker on its own.

---

# Round 2: fixes and re-test

Same base commit `2a7cb43`; changes are **uncommitted**. The frontend has no automated tests, so verification is the TypeScript check, the production build, and the same in-browser DOM checks that found the problems (test backend on :8090, production build served by the throwaway server).

## What changed
| ID | Fix | Where |
|---|---|---|
| UX-01 | 37 label/input pairs now linked (`htmlFor`/`id`); the shared `Field` components (Settings, Employees) generate an id with `useId` and attach it to their input; payroll month/mode/employee selects, search boxes, note/reason boxes and password fields got an `aria-label` | 16 `.tsx` files in `pages/`, `pages/employees/` |
| UX-02 | Darker tokens: muted text `#5f7a63` -> `#4f6a53`; green text `#287A3E` -> `#1f6a34` (about 40 text uses); error red `#dc2626` -> `#b91c1c`; orange text and badges `#E87516`/`#d98e06` -> `#B45309`/`#8a5700`. Backgrounds, buttons and icons keep the original look | `styles.css`, `pages/*.css` |
| UX-03 | On phones/tablets (coarse pointer or width up to 820 px) buttons, selects and inputs are at least 36 px tall; icon-only buttons 40 px. Desktop unchanged | `styles.css` |
| UX-04 | HR page title is now an `<h1>` (was `<h2>`); CSS updated to match | `Hr.tsx`, `hr.css` |

## Results (re-run of the same checks)
| Check | Before | After |
|---|---|---|
| HR pages with an `<h1>` | 0 of 9 | **9 of 9** |
| Unlabelled form controls, HR pages | 14 | **0** |
| Unlabelled controls in the Add-employee dialog | 1 | **0** (after a second fix) |
| Unlabelled controls, employee portal (Home, Attendance, Leave, Profile, Leave request, Time correction) | 1 | **0** |
| Text failing WCAG AA contrast (measurable text), HR pages | several per page (6+ on most) | **0 on all 9 pages** |
| Text failing contrast, portal | 3 (plus "Sign Out" 2.75, found during re-test and fixed) | **0 on 4 pages** |
| Controls under 32 px, phone width, HR pages | up to 15 per page | **0** on 8 pages; 1 inline text link (97x21 px, a link inside text, which WCAG exempts) on the Dashboard |
| Horizontal overflow | none | none (still) |
| Visual check (screenshots of portal Home, Settings on phone and desktop) | | Design unchanged apart from slightly darker secondary text and orange |

## Limits (be aware)
- **Contrast:** my script only measures text on solid backgrounds. About 25-45 percent of text nodes sit over the photo/gradient backgrounds and could **not** be measured, so "0 failures" covers the measurable text only. axe-core or Lighthouse would give a fuller answer; neither is installed.
- **Not covered:** keyboard navigation and focus order, focus indicators, screen-reader behaviour, dark mode (the app is light only), Firefox/Safari/Edge, a real phone, the kiosk screen, and the rest of the WCAG 2.2 AA checklist. So the UI is **not** certified WCAG-conformant; the specific findings from Phase 3 are resolved.
- Dialogs: I opened the Add employee dialog and the inline Add-leave-type / Add-holiday / Add-location forms. Other modals were not opened.
- Labels on groups of buttons (for example the weekly-off day picker) are still plain `<label>` text without a control; this is not an error for form controls but a group label would be better.
- No automated frontend tests were added; regressions here are only caught by a browser re-check like the one above.

## Status
**UI/UX: all four Phase 3 findings fixed and re-tested; UI is not yet certified for WCAG 2.2 AA** (see limits).
