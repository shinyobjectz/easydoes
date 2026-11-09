---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: []
---

Scope: the easydoes web app (sign-in, group, project boards, todo list). Mode: Operate. Audience: any group, on phones first.
Job: add, move and finish the group's things faster than texting about them, together, live, with the group's AI agent.

## Direction contract

THESIS: A group's to-dos as a living, physical-feeling iOS-grade app: springy, tactile, buzzing under your thumb, where everyone (the agent too) is visibly present. It refuses the gray enterprise kanban of columns, tiny avatars and dropdowns.
OWN-WORLD: Apple clarity: system SF type, white and near-black grounds by system theme, translucent vibrancy sidebars that are a real effect (content scrolls under them), squircle cards with layered soft shadows, one per-member colour that tints their avatar ring, cursor halo and card claims. Emoji are content (avatars, card emoji, reactions); icons are lucide at one stroke.
STORY: You sign in with a text, land in your group, see who's here, and move a card with your thumb: it lifts in 3D, the phone ticks, everyone watching sees it glide.
FIRST VIEWPORT: Phone: a top bar with the group's emoji and live avatar stack; one project's columns as horizontal pages with snap; a floating add button. Desktop: a left vibrancy sidebar (groups, projects, todo list, who's here), the board in the middle, a card's detail as a right sidebar that springs in.
FORM: pinned by Shane, 2026-11-09 ("keep it apple, fun, animation driven with vibrations and clean cool dynamic sidebars and 3d transforms and html in canvas"); the roll (seed:e3cdeeb658613fa0, itinerary) is set aside for the pinned brief. Signature: finishing a card bursts the card itself into confetti through HTML-in-canvas (fallback canvas drawing), with a haptic tick.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
