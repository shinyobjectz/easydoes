// A card's detail: a vibrancy panel that springs in from the right (wide) or a sheet you can pull down (phone).
// Everything edits live; who else has the card open shows at the top.
import { between, cardsOf, columnsOf, newId, type Card } from "@shared/board"
import { CalendarDays, Check, Plus, Share, SmilePlus, Trash2, X } from "lucide-react"
import { AnimatePresence, motion, useDragControls } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { burst } from "../lib/burst"
import { useGroup } from "../lib/group"
import { buzz } from "../lib/haptics"
import { share } from "../lib/share"
import { Editable } from "./Board"
import { Avatar, EmojiGrid, Pop, REACTIONS, Stack, dueLabel, spring, toast } from "./ui"

export function Detail({ wide }: { wide: boolean }) {
  const { cardId, board, openCard } = useGroup()
  const card = cardId ? board.cards[cardId] : undefined
  const controls = useDragControls()
  useEffect(() => {
    if (!card) return
    const k = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement).closest("input,textarea") && openCard(null)
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  }, [!!card])
  return (
    <AnimatePresence>
      {card &&
        (wide ? (
          <motion.aside
            key="panel"
            initial={{ x: "105%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "105%", opacity: 0.6 }}
            transition={spring}
            className="vibrancy shadow-panel fixed bottom-3 right-3 top-3 z-40 flex w-[400px] flex-col overflow-hidden rounded-sheet"
            aria-label="Card"
          >
            <Body card={card} />
          </motion.aside>
        ) : (
          <>
            <motion.div key="scrim" className="fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => openCard(null)} />
            <motion.aside
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={spring}
              drag="y"
              dragListener={false}
              dragControls={controls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.04, bottom: 0.7 }}
              onDragEnd={(_, i) => (i.offset.y > 110 || i.velocity.y > 600) && openCard(null)}
              className="vibrancy shadow-panel fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-sheet"
              aria-label="Card"
            >
              <div className="flex touch-none justify-center pt-2.5 pb-1" onPointerDown={(e) => controls.start(e)}>
                <span className="h-[5px] w-10 rounded-full bg-fill-2" />
              </div>
              <Body card={card} />
            </motion.aside>
          </>
        ))}
    </AnimatePresence>
  )
}

function Body({ card }: { card: Card }) {
  const g = useGroup()
  const { board, op, members, member, here, hereIds, working, you, openCard, colors } = g
  const cols = columnsOf(board, card.projectId)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [reactOpen, setReactOpen] = useState(false)
  const [notes, setNotes] = useState(card.notes)
  const [notesFocus, setNotesFocus] = useState(false)
  const [newCheck, setNewCheck] = useState("")
  const face = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!notesFocus) setNotes(card.notes)
  }, [card.notes, notesFocus])
  const put = (patch: Record<string, unknown>) => op({ k: "put", type: "cards", id: card.id, patch })
  const lookers = here.filter((h) => h.where.cardId === card.id && h.id !== you).map((h) => member(h.id)).filter(Boolean) as NonNullable<ReturnType<typeof member>>[]
  const by = member(card.by)
  const edited = member(card.editedBy)
  const due = dueLabel(card.due)
  const doneCol = cols.find((c) => /^(done|finished|complete[d]?)$/i.test(c.name.trim()))

  function finish() {
    if (card.done) return buzz(), put({ done: false })
    buzz("done")
    if (face.current) burst(face.current, colors)
    const patch: Record<string, unknown> = { done: true }
    if (doneCol && doneCol.id !== card.columnId) Object.assign(patch, { columnId: doneCol.id, pos: between(undefined, cardsOf(board, doneCol.id)[0]?.pos) })
    put(patch)
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <div className="flex-1 text-meta text-ink-3">
          {lookers.length ? (
            <span className="inline-flex items-center gap-2">
              <Stack people={lookers} here={hereIds} working={working} size={22} /> {lookers.map((l) => l.name).join(", ")} {lookers.length === 1 ? "is" : "are"} here too
            </span>
          ) : (
            <>Added by {by?.name ?? "someone"}</>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            const snapshot = { ...card } as Record<string, unknown>
            op({ k: "del", type: "cards", id: card.id })
            openCard(null)
            buzz("drop")
            toast("Card deleted", { label: "Undo", run: () => op({ k: "put", type: "cards", id: card.id, patch: snapshot }) })
          }}
          aria-label="Delete card"
          className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-fill hover:text-danger"
        >
          <Trash2 size={17} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => share(`/g/${g.group.id}/p/${card.projectId}?c=${card.id}`, card.title)} aria-label="Share card" className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-fill">
          <Share size={17} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => openCard(null)} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-fill text-ink-2">
          <X size={18} strokeWidth={2.4} />
        </motion.button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-8">
        <div ref={face} className="rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-start gap-3">
            <div className="relative">
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setEmojiOpen(true)} aria-label="Card emoji" className="grid size-11 place-items-center rounded-tile bg-fill text-[24px]">
                {card.emoji || <SmilePlus size={20} className="text-ink-3" />}
              </motion.button>
              <Pop open={emojiOpen} onClose={() => setEmojiOpen(false)} className="w-[300px]">
                <EmojiGrid value={card.emoji} onPick={(e) => (put({ emoji: e === card.emoji ? "" : e }), setEmojiOpen(false))} />
              </Pop>
            </div>
            <Editable multiline value={card.title} onSave={(title) => put({ title })} label="Card title" className={`px-1.5 py-1 font-display text-[21px] font-bold leading-tight tracking-[-0.025em] ${card.done ? "text-ink-3 line-through" : ""}`} />
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={spring}
            onClick={finish}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-tile py-3 text-body font-semibold transition-colors ${card.done ? "bg-fill text-ink-2" : "bg-green text-white"}`}
          >
            <Check size={19} strokeWidth={3} /> {card.done ? "Finished · tap to reopen" : "Finish it"}
          </motion.button>
        </div>

        <Section title="List">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {cols.map((c) => (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  if (c.id === card.columnId) return
                  buzz("drop")
                  const isDoneCol = c.id === doneCol?.id
                  put({ columnId: c.id, pos: between(cardsOf(board, c.id).at(-1)?.pos), ...(isDoneCol && !card.done ? { done: true } : !isDoneCol && card.done ? { done: false } : {}) })
                }}
                aria-pressed={c.id === card.columnId}
                className={`relative shrink-0 rounded-full px-3.5 py-1.5 text-sub font-medium ${c.id === card.columnId ? "text-white" : "bg-fill text-ink"}`}
              >
                {c.id === card.columnId && <motion.span layoutId="col-pill" className="absolute inset-0 rounded-full bg-accent" transition={spring} />}
                <span className="relative">{c.name}</span>
              </motion.button>
            ))}
          </div>
        </Section>

        <Section title="Who's on it">
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = card.assignees.includes(m.id)
              return (
                <motion.button
                  key={m.id}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => (buzz(), put({ assignees: on ? card.assignees.filter((a) => a !== m.id) : [...card.assignees, m.id] }))}
                  aria-pressed={on}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sub font-medium transition-colors"
                  style={{ background: on ? `color-mix(in srgb, ${m.color} 22%, transparent)` : "var(--fill)" }}
                >
                  <Avatar m={m} size={26} here={hereIds.has(m.id)} working={working.has(m.id)} />
                  {m.id === you ? "Me" : m.name || "New member"}
                  {on && <Check size={14} strokeWidth={3} />}
                </motion.button>
              )
            })}
          </div>
        </Section>

        <Section title="Due">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              ["Today", 0],
              ["Tomorrow", 1],
              ["Next week", 7],
            ].map(([label, days]) => {
              const d = new Date()
              d.setDate(d.getDate() + (days as number))
              const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
              return (
                <motion.button key={label} whileTap={{ scale: 0.94 }} onClick={() => (buzz(), put({ due: card.due === v ? "" : v }))} aria-pressed={card.due === v} className={`rounded-full px-3.5 py-1.5 text-sub font-medium ${card.due === v ? "bg-accent text-white" : "bg-fill"}`}>
                  {label}
                </motion.button>
              )
            })}
            <label className={`relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sub font-medium ${due ? (due.late && !card.done ? "bg-danger-soft text-danger" : "bg-fill") : "bg-fill text-ink-2"}`}>
              <CalendarDays size={15} /> {due ? due.text : "Pick a day"}
              <input type="date" value={card.due} onChange={(e) => put({ due: e.target.value })} className="absolute inset-0 opacity-0" aria-label="Due date" />
            </label>
            {card.due && (
              <button onClick={() => put({ due: "" })} className="rounded-full px-2 py-1.5 text-meta font-medium text-ink-3 hover:bg-fill">
                Clear
              </button>
            )}
          </div>
        </Section>

        <Section title="Checklist" right={card.checklist.length ? `${card.checklist.filter((c) => c.done).length}/${card.checklist.length}` : undefined}>
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <AnimatePresence initial={false}>
              {card.checklist.map((c) => (
                <motion.div key={c.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} className="flex items-center gap-3 border-b border-line px-3 last:border-0">
                  <motion.button
                    whileTap={{ scale: 0.75 }}
                    onClick={() => (buzz(c.done ? "tick" : "drop"), put({ checklist: card.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) }))}
                    aria-label={c.done ? `Uncheck ${c.text}` : `Check ${c.text}`}
                    className={`grid size-[20px] shrink-0 place-items-center rounded-full border-2 ${c.done ? "border-green bg-green text-white" : "border-fill-2"}`}
                  >
                    {c.done && <Check size={12} strokeWidth={3.4} />}
                  </motion.button>
                  <span className={`flex-1 py-2.5 text-sub ${c.done ? "text-ink-3 line-through" : ""}`}>{c.text}</span>
                  <button onClick={() => put({ checklist: card.checklist.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.text}`} className="grid size-7 place-items-center rounded-full text-ink-3 hover:bg-fill">
                    <X size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            <form
              className="flex items-center gap-3 px-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newCheck.trim()) return
                buzz()
                put({ checklist: [...card.checklist, { id: newId("x"), text: newCheck.trim(), done: false }] })
                setNewCheck("")
              }}
            >
              <Plus size={18} className="text-ink-3" />
              <input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Add a step" className="flex-1 bg-transparent py-2.5 text-sub outline-none" />
            </form>
          </div>
        </Section>

        <Section title="Notes">
          <textarea
            value={notes}
            onFocus={() => setNotesFocus(true)}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              setNotesFocus(false)
              if (notes !== card.notes) put({ notes })
            }}
            placeholder="Links, details, anything the group should know"
            style={{ fieldSizing: "content" } as any}
            className="min-h-[88px] w-full resize-none rounded-card bg-surface px-3.5 py-3 text-sub leading-relaxed shadow-card outline-none focus:ring-4 focus:ring-accent/25"
          />
        </Section>

        <Section title="Reactions">
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(card.reactions).map(([e, who]) => (
              <motion.button
                key={e}
                layout
                whileTap={{ scale: 0.85 }}
                onClick={() => (buzz(), op({ k: "react", id: card.id, emoji: e }))}
                title={who.map((w) => member(w)?.name).join(", ")}
                className={`rounded-full px-3 py-1.5 text-sub font-semibold tabular ${who.includes(you) ? "bg-accent-soft text-accent-ink" : "bg-fill"}`}
              >
                {e} {who.length}
              </motion.button>
            ))}
            <div className="relative">
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setReactOpen(true)} aria-label="Add a reaction" className="grid h-[34px] w-11 place-items-center rounded-full bg-fill text-ink-2">
                <SmilePlus size={17} />
              </motion.button>
              <Pop open={reactOpen} onClose={() => setReactOpen(false)} className="bottom-full top-auto mb-2 w-[280px]">
                <EmojiGrid list={REACTIONS} cols={6} onPick={(e) => (op({ k: "react", id: card.id, emoji: e }), setReactOpen(false))} />
              </Pop>
            </div>
          </div>
        </Section>

        <p className="mt-6 text-center text-micro text-ink-3">
          {edited && card.editedAt !== card.at ? `Changed by ${edited.id === you ? "you" : edited.name} ${ago(card.editedAt)}` : `Added ${ago(card.at)}`}
        </p>
      </div>
    </>
  )
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h3 className="text-meta font-semibold text-ink-2">{title}</h3>
        {right && <span className="text-meta text-ink-3 tabular">{right}</span>}
      </div>
      {children}
    </section>
  )
}

function ago(t: number) {
  const s = (Date.now() - t) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

