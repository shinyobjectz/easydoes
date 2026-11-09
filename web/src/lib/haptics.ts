// Haptics: navigator.vibrate where the browser has it (Android); on iPhone, Safari ticks the Taptic Engine when a
// switch checkbox is toggled, so a hidden one is clicked inside the same tap.
type Kind = "tick" | "lift" | "drop" | "done" | "error"
const PATTERN: Record<Kind, number | number[]> = { tick: 8, lift: 14, drop: [10, 40, 16], done: [14, 50, 24, 50, 36], error: [30, 70, 30] }

let sw: HTMLLabelElement | null = null
function iosSwitch() {
  if (sw) return sw
  sw = document.createElement("label")
  sw.setAttribute("aria-hidden", "true")
  sw.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none"
  const input = document.createElement("input")
  input.type = "checkbox"
  input.setAttribute("switch", "")
  input.tabIndex = -1
  sw.appendChild(input)
  document.body.appendChild(sw)
  return sw
}

export function buzz(kind: Kind = "tick") {
  const p = PATTERN[kind]
  try {
    if ("vibrate" in navigator && navigator.vibrate(p)) return
  } catch {}
  const taps = Array.isArray(p) ? Math.ceil(p.length / 2) : 1
  const s = iosSwitch()
  s.click()
  for (let i = 1; i < taps; i++) setTimeout(() => s.click(), i * 90)
}
