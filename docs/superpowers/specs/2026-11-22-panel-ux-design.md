# OdyGrade panel UX redesign (approach B: panel-first layout)

## Why
The panel is used docked inside AE/Premiere. Today it is laid out like a 1100 px web page:
a marketing hero eats the top half of a narrow dock, labels are 7-9 px, and the most-used
action ("Apply to selected clips") sits below the preview and export block. The user wants
it to stay a panel, look better, be user friendly, and be responsive.

## Goals
- Main action always visible: a sticky bottom action bar with **Apply to selected clips**
  (primary), Export .cube, Save .odyn.
- Preview first, then the workflow as three foldable steps: **1 Frame**, **2 Reference**,
  **3 Adjust** (look, stock, colour sliders, film module).
- Readable: minimum text 11 px, controls at least 28 px tall, clear contrast.
- Responsive by panel width (CSS media queries on the panel viewport):
  - narrow (< 640 px): one column, steps stacked under the preview;
  - medium (640-1099 px): preview + steps left, Adjust right;
  - wide (>= 1100 px): steps | preview | Adjust in three columns.
- Same dark green/gold identity, calmer and more compact.

## Non-goals
- No change to grading, engine, native recipe, effect params or host bridge.
- No new dependencies, no framework.

## Anti-goals
- Breaking any existing button or control (every element id used by src/app.js stays).
- Hiding the preview while the user adjusts sliders.

## Constraints
- CEP 11 (Chromium ~88): no CSS container queries; use media queries.
- Content-Security-Policy: no inline scripts/styles.
- Same index.html is the browser preview and the panel.

## Approaches considered
- A. CSS re-skin only: cheap, but Apply stays buried and narrow docks still scroll a lot.
- **B. Panel-first layout (chosen by the user)**: header bar, preview on top, foldable
  steps, sticky action bar, width-based layouts. Mostly HTML/CSS, small JS.
- C. Tabs (Match | Colour | Film | Export): least scrolling but constant tab switching while
  tuning, and the most JS change.

## Decided
- Steps use native `<details>` (no JS for folding). Step summaries show state
  ("loaded", "matched") via a few lines in app.js.
- Looks move from the sidebar into Step 3 as a wrapping swatch grid (same `#looks` element).
- Marketing hero, sidebar slogans and "A direction, not a duplicate" note are removed;
  the short LOG/sRGB help stays next to the profile select.
- Status line moves into the sticky action bar.

## Left to the builder
Exact spacing/colours, icon glyphs, breakpoint fine-tuning, wording of step summaries.

## Verification
- `npm test` unchanged (60/60).
- Browser preview at 380, 760 and 1280 px wide: no horizontal scroll, action bar visible,
  all controls reachable; sample frames -> Create grade -> sliders still re-render.
- Panel reinstalled and opened in AE (screenshot).
