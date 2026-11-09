// The social images, 1200×630. One world with the app: a soft wash of the group's colour, a stack of white cards with
// the main one on top, Inter at Apple-ish weights and tracking, member faces as tinted emoji circles, and the easydoes
// mark in the corner. Every <div> with more than one child is a flex box (satori's rule).
import { h, H, W, type Node } from "./render"

export type Face = { emoji: string; color: string; name: string }

const INK = "#1c1c1e"
const INK2 = "#48484d"
const INK3 = "#6c6c72"
const LINE = "rgba(60,60,67,0.14)"
const GREEN = "#28a745"
const RED = "#d70015"

/** hex mixed toward white: t=0 the colour, t=1 white */
function tint(hex: string, t: number) {
  const n = parseInt(hex.replace("#", "").slice(0, 6).padEnd(6, "0"), 16)
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export function dueText(due: string): { text: string; late: boolean } | null {
  if (!due) return null
  const [y, m, d] = due.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12))
  const today = new Date()
  const late = date.getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 86400_000
  return { text: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }), late }
}

export function face(f: Face, size: number, ring = "#fff"): Node {
  return h(
    "div",
    { style: { width: size, height: size, borderRadius: size, background: tint(f.color, 0.78), border: `${Math.max(3, size / 16)}px solid ${ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.52 } },
    f.emoji || "🙂",
  )
}

export function faces(list: Face[], size: number, max = 5): Node {
  const shown = list.slice(0, max)
  return h(
    "div",
    { style: { display: "flex", alignItems: "center" } },
    ...shown.map((f, i) => h("div", { style: { display: "flex", marginLeft: i ? -size * 0.28 : 0 } }, face(f, size))),
    list.length > max ? h("div", { style: { display: "flex", marginLeft: 12, fontSize: size * 0.42, fontWeight: 600, color: INK2 } }, `+${list.length - max}`) : null,
  )
}

function mark(): Node {
  // the app icon: a blue squircle with two rows, the lower one checked, and a sun
  return h(
    "div",
    { style: { width: 44, height: 44, borderRadius: 11, background: "#0a84ff", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8px", position: "relative" } },
    h("div", { style: { height: 9, borderRadius: 5, background: "rgba(255,255,255,0.45)", marginBottom: 5 } }),
    h("div", { style: { height: 9, borderRadius: 5, background: "#fff" } }),
    h("div", { style: { position: "absolute", top: 4, right: 4, width: 9, height: 9, borderRadius: 9, background: "#ffd60a" } }),
  )
}

const washes = (a: string, b: string) =>
  `data:image/svg+xml;base64,${btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>` +
      `<radialGradient id="a" cx="${0.88 * W}" cy="${0.08 * H}" r="${0.55 * Math.hypot(W, H) * 0.92}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#f4f4f7" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="b" cx="${0.06 * W}" cy="${0.96 * H}" r="${0.45 * Math.hypot(W, H) * 0.95}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="#f4f4f7" stop-opacity="0"/></radialGradient>` +
      `</defs><rect width="100%" height="100%" fill="url(#a)"/><rect width="100%" height="100%" fill="url(#b)"/></svg>`,
  )}`

/** the shared frame: wash, the card stack, the main card, and the footer */
export function frame(o: { color: string; group: string; people: Face[]; body: Node; done?: boolean }): Node {
  const wash = tint(o.color, 0.82)
  return h(
    "div",
    {
      style: {
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        fontFamily: "Inter",
        color: INK,
        background: "#f4f4f7",
      },
    },
    // the washes, as an SVG gradient (satori's CSS radial-gradient costs the renderer a third of a second)
    h("img", { src: washes(wash, tint(o.color, 0.9)), width: W, height: H, style: { position: "absolute", left: 0, top: 0 } }),
    // the main card's soft shadow, baked once (public/art; a 70px blur drawn per image took a second)
    h("img", { src: "/art/card-shadow.png", width: W, height: H, style: { position: "absolute", left: 0, top: 0 } }),
    // the stack behind
    h("div", { style: { position: "absolute", left: 92, top: 70, width: 1016, height: 400, borderRadius: 44, background: "#fff", opacity: 0.55, transform: "rotate(-2.4deg)" } }),
    h("div", { style: { position: "absolute", left: 76, top: 58, width: 1048, height: 410, borderRadius: 44, background: "#fff", opacity: 0.8, transform: "rotate(1.3deg)" } }),
    // the main card
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: 60,
          top: 44,
          width: 1080,
          height: 430,
          borderRadius: 44,
          background: "#fff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          display: "flex",
          flexDirection: "column",
          padding: "52px 60px",
        },
      },
      o.body,
    ),
    // footer
    h(
      "div",
      { style: { position: "absolute", left: 64, right: 64, bottom: 40, height: 76, display: "flex", alignItems: "center", justifyContent: "space-between" } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center" } },
        mark(),
        h("div", { style: { display: "flex", marginLeft: 16, fontSize: 30, fontWeight: 800, letterSpacing: "-0.04em" } }, "easydoes"),
        o.group ? h("div", { style: { display: "flex", marginLeft: 16, fontSize: 26, fontWeight: 600, color: INK3 } }, `· ${clip(o.group, 30)}`) : null,
      ),
      o.people.length ? faces(o.people, 56) : null,
    ),
  )
}

function pill(text: string | Node[], bg: string, color: string, size = 24): Node {
  return h("div", { style: { display: "flex", alignItems: "center", padding: "8px 18px", borderRadius: 999, background: bg, color, fontSize: size, fontWeight: 600, marginRight: 12 } }, ...(Array.isArray(text) ? text : [text]))
}

function check(done: boolean, size: number): Node {
  return h(
    "div",
    { style: { width: size, height: size, borderRadius: size, border: done ? "none" : `${Math.max(3, size / 10)}px solid #d1d1d6`, background: done ? GREEN : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: size * 0.6, fontWeight: 800, flexShrink: 0 } },
    done ? h("img", { src: tick, width: size * 0.56, height: size * 0.56 }) : null,
  )
}

// drawn rather than typed: the Latin subset of Inter has no check mark or arrow
const svg = (body: string) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`)}`
const tick = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>')
const arrow = svg('<path d="M5 12h14M13 6l6 6-6 6"/>')

// ---- a card ----
export function cardImage(c: {
  color: string
  group: string
  people: Face[]
  emoji: string
  title: string
  project: string
  projectEmoji: string
  section: string
  due: string
  done: boolean
  checks: [number, number]
  assignees: Face[]
}): Node {
  const due = dueText(c.due)
  const size = c.title.length > 60 ? 54 : c.title.length > 30 ? 66 : 78
  return frame({
    color: c.color,
    group: c.group,
    people: c.people,
    body: h(
      "div",
      { style: { display: "flex", flexDirection: "column", height: "100%" } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", fontSize: 26, fontWeight: 600, color: INK3 } },
        `${c.projectEmoji} ${clip(c.project, 34)}`,
        h("div", { style: { display: "flex", margin: "0 14px", color: "#c7c7cc" } }, "›"),
        c.section,
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "flex-start", marginTop: 30, flex: 1 } },
        h("div", { style: { display: "flex", marginTop: size * 0.12, marginRight: 26 } }, check(c.done, size * 0.78)),
        h(
          "div",
          { style: { display: "flex", flexWrap: "wrap", fontSize: size, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1.04, color: c.done ? INK3 : INK, textDecoration: c.done ? "line-through" : "none" } },
          `${c.emoji ? c.emoji + " " : ""}${clip(c.title || "Untitled", 90)}`,
        ),
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center" } },
        c.done ? pill("Done", "rgba(40,167,69,0.14)", GREEN) : null,
        due && !c.done ? pill(`Due ${due.text}`, due.late ? "rgba(215,0,21,0.1)" : "rgba(118,118,128,0.12)", due.late ? RED : INK2) : null,
        c.checks[1] ? pill(`${c.checks[0]}/${c.checks[1]} steps`, "rgba(118,118,128,0.12)", c.checks[0] === c.checks[1] ? GREEN : INK2) : null,
        c.assignees.length
          ? h(
              "div",
              { style: { display: "flex", alignItems: "center", marginLeft: "auto" } },
              faces(c.assignees, 52, 3),
              h("div", { style: { display: "flex", marginLeft: 14, fontSize: 24, fontWeight: 600, color: INK2 } }, clip(c.assignees.map((a) => a.name.split(" ")[0]).join(", "), 24)),
            )
          : null,
      ),
    ),
  })
}

// ---- a list (a project, or the to-do list) ----
export function listImage(l: { color: string; group: string; people: Face[]; emoji: string; name: string; open: number; done: number; items: { title: string; who?: Face }[] }): Node {
  const total = l.open + l.done
  const pct = total ? l.done / total : 0
  return frame({
    color: l.color,
    group: l.group,
    people: l.people,
    body: h(
      "div",
      { style: { display: "flex", height: "100%" } },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", width: 430, paddingRight: 40, borderRight: `2px solid ${LINE}` } },
        h("div", { style: { display: "flex", fontSize: 84 } }, l.emoji || "🌴"),
        h("div", { style: { display: "flex", marginTop: 16, fontSize: l.name.length > 18 ? 50 : 62, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1.02 } }, clip(l.name, 40)),
        h("div", { style: { display: "flex", marginTop: "auto", fontSize: 26, fontWeight: 600, color: INK2 } }, total ? (l.open ? `${l.open} to go · ${l.done} done` : "All done 🏖️") : "A fresh start"),
        h(
          "div",
          { style: { display: "flex", marginTop: 16, height: 14, borderRadius: 14, background: "rgba(118,118,128,0.14)", overflow: "hidden" } },
          h("div", { style: { display: "flex", width: `${Math.round(pct * 100)}%`, height: 14, borderRadius: 14, background: GREEN } }),
        ),
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", flex: 1, paddingLeft: 44, justifyContent: "center" } },
        ...(l.items.length
          ? l.items.slice(0, 4).map((it, i) =>
              h(
                "div",
                { style: { display: "flex", alignItems: "center", padding: "18px 0", borderBottom: i < Math.min(l.items.length, 4) - 1 ? `2px solid ${LINE}` : "none" } },
                check(false, 34),
                h("div", { style: { display: "flex", flex: 1, marginLeft: 20, fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" } }, clip(it.title, 34)),
                it.who ? face(it.who, 44) : null,
              ),
            )
          : [h("div", { style: { display: "flex", fontSize: 32, fontWeight: 600, color: INK3 } }, "Nothing open. Hammock time 🏝️")]),
        l.open > 4 ? h("div", { style: { display: "flex", marginTop: 14, fontSize: 24, fontWeight: 600, color: INK3 } }, `and ${l.open - 4} more`) : null,
      ),
    ),
  })
}

// ---- an invite ----
export function inviteImage(g: { color: string; name: string; emoji: string; people: Face[] }): Node {
  return frame({
    color: g.color,
    group: "",
    people: [],
    body: h(
      "div",
      { style: { display: "flex", alignItems: "center", height: "100%" } },
      h("div", { style: { display: "flex", width: 240, height: 240, borderRadius: 64, background: tint(g.color, 0.8), alignItems: "center", justifyContent: "center", fontSize: 140, flexShrink: 0 } }, g.emoji || "🌴"),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", marginLeft: 56, flex: 1 } },
        h("div", { style: { display: "flex", fontSize: 30, fontWeight: 600, color: INK3 } }, "You're invited to join"),
        h("div", { style: { display: "flex", marginTop: 8, fontSize: g.name.length > 16 ? 64 : 80, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 } }, clip(g.name, 32)),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", marginTop: 34 } },
          g.people.length ? faces(g.people, 64, 6) : null,
          h("div", { style: { display: "flex", marginLeft: g.people.length ? 22 : 0, fontSize: 28, fontWeight: 600, color: INK2 } }, `${g.people.length} ${g.people.length === 1 ? "person is" : "people are"} on its board`),
        ),
        h("div", { style: { display: "flex", marginTop: 36 } }, pill([h("div", { style: { display: "flex" } }, "Tap to join"), h("img", { src: arrow, width: 26, height: 26, style: { marginLeft: 10 } })], "#0a84ff", "#fff", 28)),
      ),
    ),
  })
}

// ---- easydoes itself ----
export function homeImage(): Node {
  const row = (e: string, t: string, done: boolean) =>
    h("div", { style: { display: "flex", alignItems: "center", padding: "16px 0", borderBottom: `2px solid ${LINE}` } }, check(done, 32), h("div", { style: { display: "flex", marginLeft: 18, fontSize: 28, fontWeight: 600, color: done ? INK3 : INK, textDecoration: done ? "line-through" : "none" } }, `${e} ${t}`))
  return frame({
    color: "#0a84ff",
    group: "",
    people: [
      { emoji: "🦊", color: "#0a84ff", name: "" },
      { emoji: "🌺", color: "#ff375f", name: "" },
      { emoji: "🐢", color: "#30d158", name: "" },
      { emoji: "🐈‍⬛", color: "#bf5af2", name: "" },
    ],
    body: h(
      "div",
      { style: { display: "flex", height: "100%" } },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", width: 520, justifyContent: "center" } },
        h("div", { style: { display: "flex", fontSize: 76, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 } }, "Get your group's things done."),
        h("div", { style: { display: "flex", marginTop: 22, fontSize: 28, fontWeight: 400, color: INK2, lineHeight: 1.3 } }, "Live lists for your people, with an AI teammate."),
      ),
      h("div", { style: { display: "flex", flexDirection: "column", flex: 1, paddingLeft: 60, justifyContent: "center" } }, row("🥥", "Groceries for Saturday", true), row("🌺", "Book the beach house", false), row("🐚", "Invite your people", false)),
    ),
  })
}
