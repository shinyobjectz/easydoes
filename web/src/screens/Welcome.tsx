// Signing in by text, and the first-run steps after it: your name and avatar, a first group, an invite to join.
import { ArrowRight, ChevronLeft, Loader2 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Avatar, Button, COLORS, EMOJI, EmojiGrid, FACES, spring } from "../components/ui"
import { api, type Me } from "../lib/api"
import { burst } from "../lib/burst"
import { buzz } from "../lib/haptics"

function Shell({ children, back }: { children: ReactNode; back?: () => void }) {
  return (
    <main className="min-h-full overflow-hidden px-4 pad-safe-t">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[400px] flex-col justify-center py-10">
        {back && (
          <button onClick={back} className="-ml-2 mb-4 inline-flex w-fit items-center gap-0.5 rounded-lg px-2 py-1 text-sub font-medium text-accent-ink hover:bg-fill">
            <ChevronLeft size={18} strokeWidth={2.4} /> Back
          </button>
        )}
        {children}
      </div>
    </main>
  )
}

/** three cards floating in 3D; tap one to finish it */
function Hero() {
  const items = [
    { e: "🥥", t: "Groceries for Saturday", c: "#30d158" },
    { e: "🌺", t: "Book the beach house", c: "#ff375f" },
    { e: "🐚", t: "Invite your people", c: "#0a84ff" },
  ]
  const [gone, setGone] = useState<number[]>([])
  useEffect(() => {
    if (gone.length === items.length) {
      const t = setTimeout(() => setGone([]), 900)
      return () => clearTimeout(t)
    }
  }, [gone.length])
  return (
    <div className="relative mb-9 h-[176px] [perspective:900px]" aria-hidden>
      {items.map((it, i) => (
        <AnimatePresence key={it.t}>
          {!gone.includes(i) && (
            <motion.button
              tabIndex={-1}
              initial={{ opacity: 0, rotateX: 40, y: 40, scale: 0.9 }}
              animate={{ opacity: 1, rotateX: 18, rotateZ: [-6, 3, -2][i], y: i * 46, x: [0, 22, 8][i], scale: 1 - (2 - i) * 0.04 }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              transition={{ ...spring, delay: gone.length ? 0 : 0.15 + i * 0.08 }}
              whileHover={{ rotateX: 6, scale: 1.02 }}
              onClick={async (e) => {
                buzz("done")
                const el = e.currentTarget
                burst(el, [it.c, "#ffd60a", "#ff375f", "#64d2ff"])
                setGone((g) => [...g, i])
              }}
              className="no-callout absolute left-0 top-0 flex w-[min(320px,86%)] items-center gap-3 rounded-card bg-surface px-4 py-3.5 text-left shadow-card [transform-style:preserve-3d]"
              style={{ zIndex: i }}
            >
              <span className="grid size-6 place-items-center rounded-full border-2" style={{ borderColor: it.c }} />
              <span data-emoji className="text-[20px]">{it.e}</span>
              <span data-title className="text-body font-semibold tracking-[-0.02em]">{it.t}</span>
            </motion.button>
          )}
        </AnimatePresence>
      ))}
    </div>
  )
}

function Field(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`w-full rounded-2xl bg-surface px-4 py-3.5 text-body shadow-card outline-none ring-accent/40 transition-shadow focus:ring-4 ${p.className ?? ""}`} />
}

function Err({ text }: { text: string }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 text-sub font-medium text-danger">
          {text}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

export function SignIn({ invite, onIn }: { invite?: string; onIn: (m: Me) => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [sentTo, setSentTo] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [group, setGroup] = useState<{ name: string; emoji: string; size: number } | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (invite) api(`/invite/${invite}`).then((r) => setGroup(r.group)).catch(() => {})
  }, [invite])

  async function start(e?: React.FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setErr("")
    try {
      const r = await api("/auth/start", { phone })
      setSentTo(r.to)
      setStep("code")
      setCode("")
      buzz()
      setTimeout(() => codeRef.current?.focus(), 250)
    } catch (x: any) {
      setErr(x.message)
      buzz("error")
    } finally {
      setBusy(false)
    }
  }

  async function verify(c: string) {
    setBusy(true)
    setErr("")
    try {
      const m = await api<Me>("/auth/verify", { phone, code: c })
      buzz("done")
      onIn(m)
    } catch (x: any) {
      setErr(x.message)
      setCode("")
      buzz("error")
      setTimeout(() => codeRef.current?.focus(), 0)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell back={step === "code" ? () => (setStep("phone"), setErr("")) : undefined}>
      <AnimatePresence mode="wait" initial={false}>
        {step === "phone" ? (
          <motion.form key="phone" onSubmit={start} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={spring}>
            {!group && <Hero />}
            {group ? (
              <>
                <div className="mb-5 text-[56px] leading-none">{group.emoji}</div>
                <h1 className="font-display text-display text-balance">Join {group.name}</h1>
                <p className="mt-3 text-body text-ink-2">
                  {group.size} {group.size === 1 ? "person is" : "people are"} already on its board. Sign in with your phone to join them.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-display text-display text-balance">Get your group's things done, together.</h1>
                <p className="mt-3 text-body text-ink-2">One live board and to-do list for your people, with an AI teammate that pitches in.</p>
              </>
            )}
            <label className="mt-8 mb-2 block text-meta font-medium text-ink-2" htmlFor="phone">
              Your phone number
            </label>
            <Field id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus={!!group} />
            <Err text={err} />
            <Button type="submit" disabled={busy || phone.replace(/\D/g, "").length < 10} className="mt-4 w-full py-3.5 text-body">
              {busy ? <Loader2 className="animate-spin" size={20} /> : <>Text me a code <ArrowRight size={18} strokeWidth={2.4} /></>}
            </Button>
            <p className="mt-4 text-meta text-ink-3">We text a six-digit code. No passwords. Message and data rates may apply.</p>
          </motion.form>
        ) : (
          <motion.div key="code" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring}>
            <h1 className="font-display text-display">Check your texts</h1>
            <p className="mt-3 text-body text-ink-2">We sent a code to the number ending {sentTo.replace(/\D/g, "")}.</p>
            <div className="relative mt-8" onClick={() => codeRef.current?.focus()}>
              <input
                ref={codeRef}
                aria-label="Six-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                readOnly={busy}
                onChange={(e) => {
                  const c = e.target.value.replace(/\D/g, "").slice(0, 6)
                  if (c.length > code.length) buzz()
                  setCode(c)
                  if (c.length === 6) verify(c)
                }}
                className="absolute inset-0 h-full w-full opacity-0"
              />
              <div className="grid grid-cols-6 gap-2" aria-hidden>
                {Array.from({ length: 6 }, (_, i) => (
                  <motion.div
                    key={i}
                    animate={{ scale: code.length === i ? 1.04 : 1, y: code[i] ? -2 : 0 }}
                    transition={spring}
                    className={`grid aspect-[4/5] place-items-center rounded-2xl bg-surface font-display text-[28px] font-semibold shadow-card tabular ${code.length === i && !busy ? "ring-4 ring-accent/35" : ""}`}
                  >
                    <AnimatePresence>
                      {code[i] && (
                        <motion.span initial={{ opacity: 0, y: 10, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring}>
                          {code[i]}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>
            <Err text={err} />
            <div className="mt-6 flex items-center gap-2">
              {busy && <Loader2 className="animate-spin text-ink-3" size={18} />}
              <Button kind="plain" type="button" onClick={() => start()} disabled={busy} className="-ml-4">
                Send a new code
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  )
}

export function Profile({ me, onDone, onCancel }: { me: Me; onDone: (m: Me) => void; onCancel?: () => void }) {
  const p = me.person!
  const [name, setName] = useState(p.name)
  const [emoji, setEmoji] = useState(p.emoji)
  const [color, setColor] = useState(p.color)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      onDone(await api<Me>("/me", { name, emoji, color }))
      buzz("drop")
    } catch (x: any) {
      setErr(x.message)
      buzz("error")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell back={onCancel}>
      <form onSubmit={save}>
        <motion.div key={emoji + color} initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 14 }} className="mb-6 w-fit">
          <Avatar m={{ emoji, color, name }} size={84} here />
        </motion.div>
        <h1 className="font-display text-display">{p.name ? "You" : "Who's this?"}</h1>
        <p className="mt-3 text-body text-ink-2">Your name, face and colour show on everything you touch, so your group can see it's you.</p>
        <label className="mt-7 mb-2 block text-meta font-medium text-ink-2" htmlFor="name">
          Your name
        </label>
        <Field id="name" autoComplete="given-name" placeholder="First name is fine" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!p.name} maxLength={40} />
        <div className="mt-6 mb-2 text-meta font-medium text-ink-2">Your face</div>
        <div className="rounded-2xl bg-surface p-2 shadow-card">
          <EmojiGrid list={FACES} value={emoji} onPick={setEmoji} />
        </div>
        <div className="mt-6 mb-2 text-meta font-medium text-ink-2">Your colour</div>
        <div className="flex flex-wrap gap-3">
          {COLORS.map((c) => (
            <motion.button
              type="button"
              key={c}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              whileTap={{ scale: 0.85 }}
              onClick={() => (buzz(), setColor(c))}
              className="size-9 rounded-full"
              style={{ background: c, boxShadow: color === c ? `0 0 0 3px var(--bg), 0 0 0 5px ${c}` : "none" }}
            />
          ))}
        </div>
        <Err text={err} />
        <Button type="submit" disabled={busy || !name.trim()} className="mt-8 w-full py-3.5 text-body">
          {busy ? <Loader2 className="animate-spin" size={20} /> : p.name ? "Save" : "Continue"}
        </Button>
      </form>
    </Shell>
  )
}

export function NewGroup({ me, onMade, onCancel }: { me: Me; onMade: (m: Me, id: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("🌴")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  async function make(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await api<Me & { id: string }>("/groups", { name, emoji })
      buzz("done")
      onMade(r, r.id)
    } catch (x: any) {
      setErr(x.message)
      buzz("error")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell back={onCancel}>
      <form onSubmit={make}>
        <motion.div key={emoji} initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 13 }} className="mb-5 text-[64px] leading-none">
          {emoji}
        </motion.div>
        <h1 className="font-display text-display">{me.groups.length ? "Start a new group" : `Hi ${me.person?.name}. Start your group.`}</h1>
        <p className="mt-3 text-body text-ink-2">A family, a band, a team, a trip. You'll get a link to invite everyone.</p>
        <label className="mt-7 mb-2 block text-meta font-medium text-ink-2" htmlFor="gname">
          Group name
        </label>
        <Field id="gname" placeholder="Beach house crew" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus />
        <div className="mt-6 mb-2 text-meta font-medium text-ink-2">Its emoji</div>
        <div className="rounded-2xl bg-surface p-2 shadow-card">
          <EmojiGrid list={EMOJI} value={emoji} onPick={setEmoji} />
        </div>
        <Err text={err} />
        <Button type="submit" disabled={busy || !name.trim()} className="mt-8 w-full py-3.5 text-body">
          {busy ? <Loader2 className="animate-spin" size={20} /> : "Make the group"}
        </Button>
      </form>
    </Shell>
  )
}

export function Join({ code, onJoined, onCancel }: { code: string; onJoined: (m: Me, id: string) => void; onCancel: () => void }) {
  const [group, setGroup] = useState<{ id: string; name: string; emoji: string; size: number } | null>(null)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api(`/invite/${code}`).then((r) => setGroup(r.group)).catch((x) => setErr(x.message))
  }, [code])
  return (
    <Shell back={onCancel}>
      {!group && !err && <Loader2 className="animate-spin text-ink-3" />}
      {err && (
        <>
          <h1 className="font-display text-display">That link didn't work</h1>
          <p className="mt-3 text-body text-ink-2">{err}</p>
        </>
      )}
      {group && (
        <>
          <motion.div initial={{ scale: 0.4, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 12 }} className="mb-5 text-[72px] leading-none">
            {group.emoji}
          </motion.div>
          <h1 className="font-display text-display text-balance">Join {group.name}?</h1>
          <p className="mt-3 text-body text-ink-2">
            {group.size} {group.size === 1 ? "person is" : "people are"} on its board. They'll see your name and face when you join.
          </p>
          <Button
            disabled={busy}
            className="mt-8 w-full py-3.5 text-body"
            onClick={async () => {
              setBusy(true)
              try {
                const r = await api<Me & { id: string }>(`/invite/${code}`, {})
                buzz("done")
                onJoined(r, r.id)
              } catch (x: any) {
                setErr(x.message)
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" size={20} /> : `Join ${group.name}`}
          </Button>
        </>
      )}
    </Shell>
  )
}
