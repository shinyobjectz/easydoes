// A project, as one vertical list: big title, one field to add, then its sections (To do, Doing, Done…) stacked, each a
// run of rows. Press a row (long press on touch) and it lifts off the page in 3D, tilting with your speed, and drops
// into any section with a tick; everyone watching sees it move. Without dragging: the row's detail has its section.
import { between, cardsOf, columnsOf, newId, type Card, type Column } from "@shared/board"
import { CalendarDays, Check, CheckSquare, ChevronRight, Ellipsis, Plus, Share, StickyNote, Trash2 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { burst, sprinkle } from "../lib/burst"
import { useGroup } from "../lib/group"
import { buzz } from "../lib/haptics"
import { share } from "../lib/share"
import { EmojiGrid, Pop, Stack, dueLabel, spring, toast } from "./ui"

type Drag = { id: string; w: number; h: number; ox: number; oy: number; over: { col: string; index: number } | null }
export const isDone = (c?: Column) => !!c && /^(done|finished|complete[d]?)$/i.test(c.name.trim())

export function Board({ inset, wide }: { inset: number; wide: boolean }) {
  const g = useGroup()
  const { board, op, view } = g
  const projectId = view.kind === "board" ? view.projectId : ""
  const project = board.projects[projectId]
  const cols = columnsOf(board, projectId)
  const scroller = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [landed, setLanded] = useState<string | null>(null)

  // no page scroll while a row is lifted (touch)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const stop = (e: TouchEvent) => dragRef.current && e.preventDefault()
    el.addEventListener("touchmove", stop, { passive: false })
    return () => el.removeEventListener("touchmove", stop)
  }, [])

  function lift(card: Card, el: HTMLElement, x: number, y: number) {
    const r = el.getBoundingClientRect()
    const d: Drag = { id: card.id, w: r.width, h: r.height, ox: x - r.left, oy: y - r.top, over: { col: card.columnId, index: cardsOf(board, card.columnId).findIndex((c) => c.id === card.id) } }
    dragRef.current = d
    setDrag(d)
    buzz("lift")
    let px = x, py = y, tx = 0, ty = 0, vx = 0, vy = 0, raf = 0
    const place = () => {
      tx += (vx * 0.9 - tx) * 0.2
      ty += (-vy * 0.9 - ty) * 0.2
      vx *= 0.82
      vy *= 0.82
      const rx = Math.max(-20, Math.min(20, ty))
      const ry = Math.max(-14, Math.min(14, tx))
      if (ghost.current) ghost.current.style.transform = `translate3d(${px - d.ox}px, ${py - d.oy}px, 0) perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${ry * 0.12}deg) scale(1.04)`
      const s = scroller.current
      if (s) {
        const b = s.getBoundingClientRect()
        if (py < b.top + 90) s.scrollTop -= 12
        else if (py > b.bottom - 70) s.scrollTop += 12
      }
      raf = requestAnimationFrame(place)
    }
    raf = requestAnimationFrame(place)
    const target = () => {
      const hit = document.elementFromPoint(px, py)?.closest<HTMLElement>("[data-col]")
      if (!hit) return null
      const items = [...hit.querySelectorAll<HTMLElement>("[data-card]")].filter((n) => n.dataset.card !== d.id)
      let index = items.findIndex((n) => {
        const r = n.getBoundingClientRect()
        return py < r.top + r.height / 2
      })
      if (index < 0) index = items.length
      return { col: hit.dataset.col!, index }
    }
    const move = (e: PointerEvent) => {
      vx = e.clientX - px
      vy = e.clientY - py
      px = e.clientX
      py = e.clientY
      const over = target()
      const cur = dragRef.current!
      if (over && (over.col !== cur.over?.col || over.index !== cur.over?.index)) {
        if (cur.over && over.col !== cur.over.col) buzz("tick")
        dragRef.current = { ...cur, over }
        setDrag(dragRef.current)
      }
    }
    const end = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return
      cancelAnimationFrame(raf)
      removeEventListener("pointermove", move)
      removeEventListener("pointerup", end)
      removeEventListener("pointercancel", end)
      removeEventListener("keydown", end)
      const cur = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!cur?.over || e.type === "pointercancel" || e instanceof KeyboardEvent) return
      drop(card, cur.over.col, cur.over.index, px, py)
    }
    addEventListener("pointermove", move)
    addEventListener("pointerup", end)
    addEventListener("pointercancel", end)
    addEventListener("keydown", end)
  }

  function drop(card: Card, colId: string, index: number, x: number, y: number) {
    const rest = cardsOf(board, colId).filter((c) => c.id !== card.id)
    const pos = between(rest[index - 1]?.pos, rest[index]?.pos)
    if (colId === card.columnId && pos === card.pos) return
    const col = board.columns[colId]
    const patch: Record<string, unknown> = { columnId: colId, pos }
    if (isDone(col) && !card.done) patch.done = true
    if (!isDone(col) && card.done && colId !== card.columnId) patch.done = false
    op({ k: "put", type: "cards", id: card.id, patch })
    setLanded(card.id)
    if (patch.done) (buzz("done"), sprinkle(x, y, g.colors))
    else buzz("drop")
  }

  function finish(card: Card, el: HTMLElement | null) {
    if (card.done) return buzz(), op({ k: "put", type: "cards", id: card.id, patch: { done: false } })
    buzz("done")
    if (el) burst(el, g.colors)
    const doneCol = cols.find(isDone)
    const patch: Record<string, unknown> = { done: true }
    if (doneCol && doneCol.id !== card.columnId) Object.assign(patch, { columnId: doneCol.id, pos: between(undefined, cardsOf(board, doneCol.id)[0]?.pos) })
    op({ k: "put", type: "cards", id: card.id, patch })
    setLanded(card.id)
  }

  const dragged = drag ? board.cards[drag.id] : undefined
  if (!project) return null
  return (
    <div ref={scroller} className="no-scrollbar h-full overflow-y-auto overscroll-contain" style={{ paddingLeft: inset }}>
      <div className={`mx-auto w-full max-w-[720px] px-5 pb-40 ${wide ? "pt-14" : "pt-[calc(52px+env(safe-area-inset-top)+24px)]"}`}>
        <ProjectHeader />
        {cols.map((col) => (
          <Section key={col.id} col={col} drag={drag} landed={landed} onLift={lift} onFinish={finish} />
        ))}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => (buzz(), op({ k: "put", type: "columns", id: newId("c"), patch: { projectId, name: "New section", pos: between(cols.at(-1)?.pos) } }))}
          className="mt-10 flex items-center gap-2 text-sub font-medium text-ink-3 hover:text-ink-2"
        >
          <Plus size={17} /> New section
        </motion.button>
      </div>
      {drag && dragged && (
        <div ref={ghost} className="pointer-events-none fixed left-0 top-0 z-[60] will-change-transform" style={{ width: drag.w, transform: "translate3d(-999px,-999px,0)" }}>
          <div className="rounded-card bg-surface px-4 shadow-lift">
            <RowFace card={dragged} lifted />
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectHeader() {
  const { board, view, op, members, here, hereIds, working, you, setView, group } = useGroup()
  const p = board.projects[view.kind === "board" ? view.projectId : ""]
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [sure, setSure] = useState(false)
  if (!p) return null
  const cards = Object.values(board.cards).filter((c) => c.projectId === p.id)
  const open = cards.filter((c) => !c.done).length
  const lookers = members.filter((m) => m.id !== you && here.some((h) => h.id === m.id && h.where.projectId === p.id))
  // the nav already names the project (with its emoji), so the page doesn't repeat them; renaming and the emoji are
  // in the ••• menu
  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <p className="text-sub text-ink-3 tabular">
        {cards.length === 0 ? "Empty. Add the first thing below." : open ? `${open} to go · ${cards.length - open} done` : "All done. Go outside 🌴"}
      </p>
      <div className="flex items-center gap-2">
        {lookers.length > 0 && <Stack people={lookers} here={hereIds} working={working} size={30} />}
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => share(`/g/${group.id}/p/${p.id}`, `${p.emoji ?? ""} ${p.name}`.trim())} aria-label="Share project" className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-fill">
          <Share size={19} />
        </motion.button>
        <div className="relative">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => (setMenu(true), setSure(false), setEmojiOpen(false))} aria-label="Project options" className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-fill">
            <Ellipsis size={20} />
          </motion.button>
          <Pop open={menu} onClose={() => setMenu(false)} align="right" className="w-[320px]">
            {emojiOpen ? (
              <EmojiGrid value={p.emoji} onPick={(e) => (op({ k: "put", type: "projects", id: p.id, patch: { emoji: e } }), setEmojiOpen(false))} />
            ) : (
              <>
                <div className="flex items-center gap-1.5 px-1 pb-1">
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => setEmojiOpen(true)} aria-label="Change the project's emoji" className="grid size-10 shrink-0 place-items-center rounded-xl text-[24px] hover:bg-fill">
                    {p.emoji}
                  </motion.button>
                  <Editable value={p.name} onSave={(name) => op({ k: "put", type: "projects", id: p.id, patch: { name } })} className="px-2 py-2 text-body font-semibold" label="Project name" />
                </div>
                <button
                  onClick={() => {
                    if (!sure) return setSure(true), buzz("tick")
                    buzz("drop")
                    op({ k: "del", type: "projects", id: p.id })
                    setMenu(false)
                    const next = Object.values(board.projects).find((x) => x.id !== p.id)
                    setView(next ? { kind: "board", projectId: next.id } : { kind: "todos" })
                    toast(`Deleted ${p.name}`)
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-medium text-danger hover:bg-fill"
                >
                  <Trash2 size={17} /> {sure ? "Tap again to delete it all" : "Delete project"}
                </button>
              </>
            )}
          </Pop>
        </div>
      </div>
    </header>
  )
}

export function Editable({ value, onSave, className = "", label, multiline, fit }: { value: string; onSave: (v: string) => void; className?: string; label: string; multiline?: boolean; fit?: boolean }) {
  const [v, setV] = useState(value)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setV(value)
  }, [value, focused])
  const save = () => {
    setFocused(false)
    const t = v.trim()
    if (t && t !== value) onSave(t)
    else setV(value)
  }
  const common = {
    "aria-label": label,
    value: v,
    onFocus: () => setFocused(true),
    onBlur: save,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), (e.target as HTMLElement).blur())
      if (e.key === "Escape") (setV(value), setTimeout(() => (e.target as HTMLElement).blur()))
    },
    className: `${fit ? "" : "w-full"} min-w-0 rounded-lg bg-transparent outline-none transition-colors hover:bg-fill focus:bg-fill ${className}`,
  }
  return multiline ? <textarea rows={1} {...common} style={{ fieldSizing: "content" } as any} className={`${common.className} resize-none`} /> : <input {...common} style={fit ? ({ fieldSizing: "content", maxWidth: "100%" } as any) : undefined} />
}

function Section({ col, drag, landed, onLift, onFinish }: { col: Column; drag: Drag | null; landed: string | null; onLift: (c: Card, el: HTMLElement, x: number, y: number) => void; onFinish: (c: Card, el: HTMLElement | null) => void }) {
  const { board, op } = useGroup()
  const done = isDone(col)
  const all = cardsOf(board, col.id)
  const cards = all.filter((c) => c.id !== drag?.id)
  const [open, setOpen] = useState(!done)
  const [menu, setMenu] = useState(false)
  const [adding, setAdding] = useState(false)
  const ph = drag?.over?.col === col.id ? drag.over.index : -1
  const shown = open || ph >= 0
  return (
    <section data-col={col.id} aria-label={col.name} className={`mt-9 rounded-card transition-colors ${ph >= 0 && !open ? "bg-accent-soft" : ""}`}>
      <header className="flex items-center gap-2 border-b border-line pb-2">
        {done ? (
          <button onClick={() => (buzz(), setOpen((o) => !o))} aria-expanded={open} className="flex items-center gap-1.5 text-title font-semibold">
            <ChevronRight size={18} strokeWidth={2.6} className={`text-ink-3 transition-transform ${shown ? "rotate-90" : ""}`} />
            {col.name}
          </button>
        ) : (
          <Editable value={col.name} onSave={(name) => op({ k: "put", type: "columns", id: col.id, patch: { name } })} className="-ml-1 px-1 text-title font-semibold" label="Section name" fit />
        )}
        <span className="text-sub font-medium text-ink-3 tabular">{all.length}</span>
        <span className="flex-1" />
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => (buzz(), setOpen(true), setAdding(true))} aria-label={`Add to ${col.name}`} className="grid size-8 place-items-center rounded-full text-accent-ink hover:bg-fill">
          <Plus size={19} strokeWidth={2.4} />
        </motion.button>
        <div className="relative">
          <button onClick={() => setMenu(true)} aria-label={`${col.name} options`} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-fill">
            <Ellipsis size={18} />
          </button>
          <Pop open={menu} onClose={() => setMenu(false)} align="right" className="w-52">
            <button
              onClick={() => {
                setMenu(false)
                op({ k: "del", type: "columns", id: col.id })
                buzz("drop")
                toast(`Deleted ${col.name}`, {
                  label: "Undo",
                  run: () =>
                    op(
                      { k: "put", type: "columns", id: col.id, patch: { projectId: col.projectId, name: col.name, pos: col.pos } },
                      ...all.map((c) => ({ k: "put" as const, type: "cards" as const, id: c.id, patch: { ...c } as Record<string, unknown> })),
                    ),
                })
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-medium text-danger hover:bg-fill"
            >
              <Trash2 size={17} /> Delete section
            </button>
          </Pop>
        </div>
      </header>
      <AnimatePresence initial={false}>
        {shown && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <AnimatePresence initial={false}>
              {cards.map((c, i) => (
                <Rowish key={c.id} ph={ph === i} h={drag?.h ?? 0}>
                  <CardRow card={c} landed={landed === c.id} onLift={onLift} onFinish={onFinish} />
                </Rowish>
              ))}
            </AnimatePresence>
            {ph >= cards.length && <Placeholder h={drag?.h ?? 56} />}
            {adding && <InlineAdd col={col} onDone={() => setAdding(false)} />}
            {!cards.length && !adding && ph < 0 && <p className="py-4 text-sub text-ink-3">{done ? "Finished things land here." : "Nothing here. Drag something in."}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function Rowish({ ph, h, children }: { ph: boolean; h: number; children: React.ReactNode }) {
  return (
    <>
      {ph && <Placeholder h={h} />}
      {children}
    </>
  )
}

function Placeholder({ h }: { h: number }) {
  return <motion.div layout initial={{ height: 0, opacity: 0 }} animate={{ height: h, opacity: 1 }} transition={spring} className="my-1 rounded-tile bg-accent-soft ring-2 ring-inset ring-accent/40" />
}

function InlineAdd({ col, onDone }: { col: Column; onDone: () => void }) {
  const { board, op } = useGroup()
  const [t, setT] = useState("")
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const title = t.trim()
        if (!title) return onDone()
        buzz("drop")
        op({ k: "put", type: "cards", id: newId("k"), patch: { projectId: col.projectId, columnId: col.id, title, pos: between(cardsOf(board, col.id).at(-1)?.pos), done: isDone(col) } })
        setT("")
      }}
      className="flex items-center gap-3.5 border-b border-line py-3"
    >
      <span className="size-[26px] shrink-0 rounded-full border-2 border-dashed border-fill-2" />
      <input autoFocus value={t} onChange={(e) => setT(e.target.value)} onBlur={() => !t.trim() && onDone()} onKeyDown={(e) => e.key === "Escape" && onDone()} placeholder={`Add to ${col.name}`} className="flex-1 bg-transparent text-body outline-none" />
    </form>
  )
}

function CardRow({ card, landed, onLift, onFinish }: { card: Card; landed: boolean; onLift: (c: Card, el: HTMLElement, x: number, y: number) => void; onFinish: (c: Card, el: HTMLElement | null) => void }) {
  const { openCard, cardId } = useGroup()
  const ref = useRef<HTMLDivElement>(null)
  const lifted = useRef(false)
  const [pressing, setPressing] = useState(false)

  function down(e: React.PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-nodrag],input,textarea")) return
    const touch = e.pointerType !== "mouse"
    const p = { x: e.clientX, y: e.clientY, t: undefined as ReturnType<typeof setTimeout> | undefined }
    lifted.current = false
    if (touch) {
      setPressing(true)
      p.t = setTimeout(() => {
        lifted.current = true
        setPressing(false)
        onLift(card, ref.current!, p.x, p.y)
      }, 280)
    }
    const move = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - p.x, ev.clientY - p.y)
      if (touch) {
        if (!lifted.current && dist > 8) stop()
        p.x = ev.clientX
        p.y = ev.clientY
      } else if (!lifted.current && dist > 5) {
        lifted.current = true
        stop()
        onLift(card, ref.current!, ev.clientX, ev.clientY)
      }
    }
    const stop = () => {
      clearTimeout(p.t)
      setPressing(false)
      removeEventListener("pointermove", move)
      removeEventListener("pointerup", stop)
      removeEventListener("pointercancel", stop)
    }
    addEventListener("pointermove", move)
    addEventListener("pointerup", stop)
    addEventListener("pointercancel", stop)
  }

  return (
    <motion.div
      layout
      data-card={card.id}
      initial={landed ? { scale: 1.04, opacity: 0.5, y: -6 } : { opacity: 0, y: 8 }}
      animate={{ scale: pressing ? 0.975 : 1, opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.16 } }}
      transition={spring}
      onPointerDown={down}
      onContextMenu={(e) => e.preventDefault()}
      className={`no-callout -mx-3 rounded-tile px-3 transition-colors hover:bg-fill/60 ${cardId === card.id ? "bg-accent-soft" : ""}`}
    >
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={() => !lifted.current && (buzz(), openCard(card.id))}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openCard(card.id))}
        aria-label={`${card.title}${card.done ? ", finished" : ""}`}
        className="border-b border-line"
      >
        <RowFace card={card} onFinish={(el) => onFinish(card, el)} />
      </div>
    </motion.div>
  )
}

export function RowFace({ card, lifted, onFinish }: { card: Card; lifted?: boolean; onFinish?: (el: HTMLElement | null) => void }) {
  const { member, here, hereIds, working, you } = useGroup()
  const face = useRef<HTMLDivElement>(null)
  const due = dueLabel(card.due)
  const checks = card.checklist.length
  const checked = card.checklist.filter((c) => c.done).length
  const people = card.assignees.map(member).filter(Boolean) as NonNullable<ReturnType<typeof member>>[]
  const lookers = here.filter((h) => h.where.cardId === card.id && h.id !== you).map((h) => member(h.id)).filter(Boolean) as NonNullable<ReturnType<typeof member>>[]
  const reactions = Object.entries(card.reactions)
  const meta = due || checks > 0 || card.notes || reactions.length > 0
  return (
    <div ref={face} className="flex items-center gap-3.5 py-3.5">
      <motion.button
        data-nodrag
        whileTap={{ scale: 0.72 }}
        transition={spring}
        onClick={(e) => (e.stopPropagation(), onFinish?.(face.current?.closest("[data-card]") as HTMLElement | null))}
        aria-label={card.done ? "Mark not finished" : "Finish this"}
        className={`grid size-[26px] shrink-0 place-items-center self-start rounded-full border-2 transition-colors ${meta ? "mt-px" : "mt-0"} ${card.done ? "border-green bg-green text-white" : "border-fill-2 hover:border-green hover:bg-green-soft"}`}
      >
        {card.done && <Check size={15} strokeWidth={3.2} />}
      </motion.button>
      <div className="min-w-0 flex-1">
        <div className={`text-body font-medium text-pretty ${card.done ? "text-ink-3 line-through decoration-[1.5px]" : ""}`}>
          {card.emoji && (
            <span data-emoji className="mr-2">
              {card.emoji}
            </span>
          )}
          <span data-title>{card.title || "Untitled"}</span>
        </div>
        {meta && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta font-medium text-ink-3">
            {due && (
              <span className={`inline-flex items-center gap-1 ${due.late && !card.done ? "text-danger" : due.soon && !card.done ? "text-warn" : ""}`}>
                <CalendarDays size={13} /> {due.text}
              </span>
            )}
            {checks > 0 && (
              <span className={`inline-flex items-center gap-1 tabular ${checked === checks ? "text-green" : ""}`}>
                <CheckSquare size={13} /> {checked}/{checks}
              </span>
            )}
            {card.notes && <StickyNote size={13} aria-label="Has notes" />}
            {reactions.map(([e, who]) => (
              <span key={e} className={`tabular ${who.includes(you) ? "text-accent-ink" : ""}`}>
                {e} {who.length}
              </span>
            ))}
          </div>
        )}
      </div>
      {lookers.length > 0 && <Stack people={lookers} here={hereIds} working={working} size={22} max={2} />}
      {people.length > 0 && <Stack people={people} here={new Set()} working={working} size={26} max={3} />}
    </div>
  )
}
