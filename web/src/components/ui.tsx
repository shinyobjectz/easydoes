// Small shared pieces: avatars, the emoji picker, toasts, buttons, due-date labels.
import type { Member } from "@shared/board"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { buzz } from "../lib/haptics"

export const spring = { type: "spring", stiffness: 520, damping: 38, mass: 0.9 } as const
export const softSpring = { type: "spring", stiffness: 300, damping: 32 } as const

export function Avatar({ m, size = 28, here = false, working = false, className = "" }: { m?: Pick<Member, "emoji" | "color" | "name">; size?: number; here?: boolean; working?: boolean; className?: string }) {
  const color = m?.color ?? "#8e8e93"
  return (
    <span
      title={m?.name}
      className={`relative inline-grid shrink-0 place-items-center rounded-full ${working ? "agent-ring" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.56,
        background: `color-mix(in srgb, ${color} 20%, var(--surface))`,
        boxShadow: here && !working ? `0 0 0 2px var(--surface), 0 0 0 4px ${color}` : "0 0 0 2px var(--surface)",
      }}
    >
      <span aria-hidden className="leading-none">{m?.emoji ?? "🙂"}</span>
    </span>
  )
}

export function Stack({ people, here, working, max = 4, size = 28 }: { people: Member[]; here: Set<string>; working?: Set<string>; max?: number; size?: number }) {
  const shown = people.slice(0, max)
  return (
    <span className="flex items-center">
      <AnimatePresence initial={false}>
        {shown.map((m, i) => (
          <motion.span key={m.id} layout initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring} style={{ marginLeft: i ? -size * 0.3 : 0, zIndex: max - i }}>
            <Avatar m={m} size={size} here={here.has(m.id)} working={working?.has(m.id)} />
          </motion.span>
        ))}
      </AnimatePresence>
      {people.length > max && <span className="ml-1.5 text-meta font-medium text-ink-2 tabular">+{people.length - max}</span>}
    </span>
  )
}

export const EMOJI = ["🌴", "🏖️", "🌊", "🍹", "🐚", "☀️", "🌺", "🥥", "⛱️", "🕶️", "✨", "🚀", "🎯", "🔥", "💡", "📌", "📝", "🛒", "🎨", "🎬", "🎵", "📸", "💌", "📦", "🧪", "🐛", "🛠️", "📈", "💰", "🗓️", "🏠", "🌱", "🍕", "☕️", "🏋️", "✈️", "🎉", "❤️", "⭐️", "✅", "⚡️", "🧠", "🤝", "📣", "🧹", "🎁", "🐶", "🌈", "🍀"]
export const FACES = ["🦊", "🐼", "🐸", "🦄", "🐙", "🐝", "🦋", "🐳", "🦉", "🐯", "🐨", "🦖", "🐧", "🐢", "🦁", "🐰", "🐮", "🐵", "🌻", "🍄", "👾", "🤖", "😎", "🥑"]
export const COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#ff6482"]
export const REACTIONS = ["👍", "❤️", "🎉", "🔥", "👀", "😂"]

export function EmojiGrid({ list = EMOJI, value, onPick, cols = 8 }: { list?: string[]; value?: string; onPick: (e: string) => void; cols?: number }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {list.map((e) => (
        <motion.button
          key={e}
          type="button"
          whileTap={{ scale: 0.8 }}
          aria-label={`Choose ${e}`}
          aria-pressed={value === e}
          onClick={() => (buzz(), onPick(e))}
          className={`grid aspect-square place-items-center rounded-xl text-[22px] transition-colors ${value === e ? "bg-fill-2" : "hover:bg-fill"}`}
        >
          {e}
        </motion.button>
      ))}
    </div>
  )
}

/** a popover anchored under its trigger; closes on outside tap or Escape */
export function Pop({ open, onClose, children, align = "left", className = "" }: { open: boolean; onClose: () => void; children: ReactNode; align?: "left" | "right"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    setTimeout(() => addEventListener("pointerdown", down))
    addEventListener("keydown", key)
    return () => (removeEventListener("pointerdown", down), removeEventListener("keydown", key))
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.92, y: -6, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.95, y: -4, filter: "blur(4px)" }}
          transition={spring}
          style={{ transformOrigin: align === "left" ? "top left" : "top right" }}
          className={`vibrancy shadow-panel absolute top-full z-50 mt-2 rounded-2xl p-2 ${align === "left" ? "left-0" : "right-0"} ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Button({ children, kind = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "plain" | "tinted" | "danger" }) {
  const look = {
    primary: "bg-accent text-white font-semibold disabled:opacity-40",
    tinted: "bg-accent-soft text-accent-ink font-semibold",
    plain: "text-accent-ink font-medium hover:bg-fill",
    danger: "text-danger font-medium hover:bg-danger-soft",
  }[kind]
  return (
    <motion.button whileTap={{ scale: 0.96 }} transition={spring} {...(p as any)} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sub transition-colors ${look} ${className}`}>
      {children}
    </motion.button>
  )
}

// ---- toasts ----
type Toast = { id: number; text: string; action?: { label: string; run: () => void } }
let toasts: Toast[] = []
let seq = 0
const tsubs = new Set<() => void>()
export function toast(text: string, action?: Toast["action"]) {
  const id = ++seq
  toasts = [...toasts.slice(-2), { id, text, action }]
  tsubs.forEach((f) => f())
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    tsubs.forEach((f) => f())
  }, action ? 5000 : 3200)
}
export function Toasts() {
  const list = useSyncExternalStore((f) => (tsubs.add(f), () => tsubs.delete(f)), () => toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 px-4 pad-safe-b" aria-live="polite">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95, filter: "blur(6px)" }}
            transition={spring}
            className="vibrancy shadow-panel pointer-events-auto flex max-w-md items-center gap-3 rounded-full py-2.5 pl-5 pr-2.5 text-sub font-medium"
          >
            <span className="py-0.5">{t.text}</span>
            {t.action ? (
              <button
                className="rounded-full bg-fill px-3 py-1 font-semibold text-accent-ink"
                onClick={() => {
                  buzz()
                  t.action!.run()
                  toasts = toasts.filter((x) => x.id !== t.id)
                  tsubs.forEach((f) => f())
                }}
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-2.5" />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ---- dates ----
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
export function dueLabel(due: string): { text: string; late: boolean; soon: boolean } | null {
  if (!due) return null
  const [y, m, d] = due.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const diff = Math.round((day(date) - day(new Date())) / 86400000)
  const text =
    diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : diff > 1 && diff < 7 ? date.toLocaleDateString(undefined, { weekday: "short" }) : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return { text, late: diff < 0, soon: diff >= 0 && diff <= 1 }
}

export function useLocal<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key)
      return s ? (JSON.parse(s) as T) : init
    } catch {
      return init
    }
  })
  return [
    v,
    (n: T) => {
      setV(n)
      try {
        localStorage.setItem(key, JSON.stringify(n))
      } catch {}
    },
  ]
}

// ---- the loader: a slow drift through vacation things ----
export const VACAY = ["🌴", "🍹", "🏖️", "🌊", "🐚", "☀️", "🥥", "⛱️", "🌺", "🕶️"]
export function Loader({ label = "Loading" }: { label?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % VACAY.length), 650)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="grid h-[100dvh] place-items-center" role="status" aria-label={label}>
      <div className="relative size-16">
        <AnimatePresence>
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 14, rotate: -14, scale: 0.7 }}
            animate={{ opacity: 1, y: [0, -6, 0], rotate: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, rotate: 14, scale: 0.7 }}
            transition={{ ...softSpring, y: { duration: 0.65, ease: "easeInOut" } }}
            className="absolute inset-0 grid place-items-center text-[48px] leading-none"
          >
            {VACAY[i]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}
