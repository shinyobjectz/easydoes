# easydoes design

Apple clarity with a vacation's calm. One vertical scroll everywhere: no horizontal boards.

## Tokens (web/src/index.css, Tailwind 4 `@theme`)

- Colour: system grounds (`bg` #f2f2f7 / #000, `surface` #fff / #1c1c1e), `ink`, `ink-2`, `ink-3` (all at least 4.5:1 on their
  ground), `line` hairlines, `fill` and `fill-2` for quiet controls, `accent` system blue, `green` for finished, `danger`,
  `warn`, and soft tints (`accent-soft`, `green-soft`, `danger-soft`). Light and dark follow the system.
- Type: the system SF stack. `text-hero` (52px, 800, -0.045em) for a page's name; `text-display` 34px; `text-title` 20px
  for sections; `text-body` 17px for rows; `text-sub` 15px; `text-meta` 13px; `text-micro` 12px.
- Shape: `rounded-tile` 14, `rounded-card` 18, `rounded-sheet` 28. Depth: `shadow-card`, `shadow-lift` (a lifted row),
  `shadow-panel` (sidebars, sheets, popovers).
- Vibrancy (`.vibrancy`): a real 30px blur with saturation, only where content scrolls under it (top bar, sidebars,
  detail panel and sheet, popovers, toasts).

## Layout

- A page is one column, 720px at most: a big emoji, the name in `text-hero`, a count line, one prominent add field, then
  sections (a project's To do, Doing, Done; the to-do list) as rows on hairlines. Done collapses.
- Wide: the sidebar (group, To-dos, projects, people with live presence) floats over the page; a card's detail springs in
  from the right. Phone: a top bar, the sidebar as a drawer you can swipe away, the detail as a sheet you pull down.

## Motion and feel

- Springs everywhere (stiffness 520, damping 38), nothing linear.
- A row lifts on press (a long press on touch), follows the finger in 3D, tilting with its speed, and lands with a
  haptic tick. Finishing a card bursts the card itself (its pixels, through HTML-in-canvas where the browser has it) into
  pieces and confetti in the members' colours, with a haptic pattern.
- Haptics: `navigator.vibrate` on Android, the switch-checkbox tick on iPhone.

## Emoji

- The app's own emoji are relaxed and vacation-flavoured: the loader drifts through 🌴🍹🏖️🌊🐚☀️🥥⛱️🌺🕶️, empty states are
  🌴 and 🏖️, defaults are 🌴 and 🌺. People's emoji (faces, cards, reactions) are theirs.
- Icons are lucide at one stroke; emoji are never icons.
