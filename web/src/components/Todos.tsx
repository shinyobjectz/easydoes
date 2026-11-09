// The group's to-do list: one list for quick things, each with a person and a day. Check one and it ticks and sprinkles;
// swipe one left (or use its delete) to remove it.
import { between, byPos, newId, type Todo } from "@shared/board"
import { CalendarDays, ChevronRight, Plus, Share, Trash2, UserRound } from "lucide-react"
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react"
import { useRef, useState } from "react"
import { sprinkle } from "../lib/burst"
import { useGroup } from "../lib/group"
import { buzz } from "../lib/haptics"
import { share } from "../lib/share"
import { Avatar, Pop, dueLabel, spring, toast, useLocal } from "./ui"

export function Todos({ inset }: { inset: number }) {
  const { board, op, members, you, hereIds, here, member, group } = useGroup()
  const [t, setT] = useState("")
  const [mine, setMine] = useLocal("ed.todos.mine", false)
  const [showDone, setShowDone] = useState(false)
  const all = Object.values(board.todos).filter((x) => !mine || x.assignee === you)
  const open = byPos(all.filter((x) => !x.done))
  const done = all.filter((x) => x.done).sort((a, b) => b.pos - a.pos)
  const lookers = members.filter((m) => m.id !== you && here.some((h) => h.id === m.id && h.where.view === "todos"))

  function add(e: React.FormEvent) {
    e.preventDefault()
    const text = t.trim()
    if (!text) return
    buzz("drop")
    op({ k: "put", type: "todos", id: newId("t"), patch: { text, pos: between(undefined, open[0]?.pos), assignee: mine ? you : "" } })
    setT("")
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto" style={{ paddingLeft: inset }}>
      <div className="mx-auto w-full max-w-[720px] px-5 pb-40 pt-[calc(52px+env(safe-area-inset-top)+24px)] min-[900px]:pt-14">
        <div className="flex items-end gap-3">
          <h1 className="flex-1 font-display text-hero">To-dos</h1>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => share(`/g/${group.id}/todos`, `To-dos · ${group.name}`)} aria-label="Share to-dos" className="mb-2 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-fill">
            <Share size={19} />
          </motion.button>
          {lookers.length > 0 && (
            <span className="mb-2 flex items-center gap-1.5 text-meta text-ink-2">
              {lookers.map((m) => (
                <Avatar key={m.id} m={m} size={24} here />
              ))}
              here
            </span>
          )}
        </div>
        <p className="mt-2 text-sub text-ink-3 tabular">{open.length ? `${open.length} to go · ${done.length} done` : "Nothing to do. Hammock time 🏖️"}</p>
        <div className="mt-6 flex gap-1 rounded-[10px] bg-fill p-0.5 text-meta font-semibold" role="tablist">
          {[
            ["Everyone's", false],
            ["Mine", true],
          ].map(([label, v]) => (
            <button key={String(label)} role="tab" aria-selected={mine === v} onClick={() => (buzz(), setMine(v as boolean))} className="relative flex-1 rounded-[8px] py-1.5">
              {mine === v && <motion.span layoutId="todo-seg" className="absolute inset-0 rounded-[8px] bg-seg shadow-card" transition={spring} />}
              <span className="relative">{label as string}</span>
            </button>
          ))}
        </div>

        <form onSubmit={add} className="mt-4 flex items-center gap-3.5 rounded-card bg-surface px-4 shadow-card transition-shadow focus-within:ring-4 focus-within:ring-accent/25">
          <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-accent text-white">
            <Plus size={17} strokeWidth={2.8} />
          </span>
          <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Add a to-do" aria-label="Add a to-do" className="min-w-0 flex-1 bg-transparent py-4 text-body outline-none" />
          <AnimatePresence>
            {t.trim() && (
              <motion.button initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring} className="rounded-full bg-accent px-3.5 py-1.5 text-meta font-semibold text-white">
                Add
              </motion.button>
            )}
          </AnimatePresence>
        </form>

        {open.length === 0 ? (
          <div className="mt-14 text-center">
            <div className="text-[44px]">🏖️</div>
            <p className="mt-2 font-display text-[19px] font-semibold tracking-[-0.02em]">{mine ? "Nothing on your plate" : "All clear"}</p>
            <p className="mt-1 text-ink-2">Add something above, or text the group's AI teammate to add it for you.</p>
          </div>
        ) : (
          <ul className="mt-6 border-t border-line">
            <AnimatePresence initial={false}>
              {open.map((x) => (
                <Row key={x.id} todo={x} />
              ))}
            </AnimatePresence>
          </ul>
        )}

        {done.length > 0 && (
          <div className="mt-10">
            <button onClick={() => (buzz(), setShowDone((s) => !s))} className="flex w-full items-center gap-1.5 border-b border-line pb-2 text-title font-semibold" aria-expanded={showDone}>
              <ChevronRight size={18} strokeWidth={2.6} className={`text-ink-3 transition-transform ${showDone ? "rotate-90" : ""}`} /> Done <span className="ml-1 text-sub font-medium text-ink-3 tabular">{done.length}</span>
            </button>
            <AnimatePresence initial={false}>
              {showDone && (
                <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} className="overflow-hidden">
                  {done.slice(0, 50).map((x) => (
                    <Row key={x.id} todo={x} />
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ todo }: { todo: Todo }) {
  const { op, members, you, hereIds, member } = useGroup()
  const x = useMotionValue(0)
  const bg = useTransform(x, [-120, -40, 0], [1, 0.4, 0])
  const [pick, setPick] = useState(false)
  const check = useRef<HTMLButtonElement>(null)
  const who = member(todo.assignee)
  const doneBy = member(todo.doneBy)
  const due = dueLabel(todo.due)
  const put = (patch: Record<string, unknown>) => op({ k: "put", type: "todos", id: todo.id, patch })
  const del = () => {
    buzz("drop")
    const snap = { ...todo } as Record<string, unknown>
    op({ k: "del", type: "todos", id: todo.id })
    toast("To-do deleted", { label: "Undo", run: () => op({ k: "put", type: "todos", id: todo.id, patch: snap }) })
  }
  return (
    <motion.li layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }} transition={spring} className="relative border-b border-line last:border-0">
      <motion.div style={{ opacity: bg }} className="absolute inset-0 flex items-center justify-end bg-danger pr-5 text-white">
        <Trash2 size={20} />
      </motion.div>
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        dragDirectionLock
        onDragEnd={(_, i) => i.offset.x < -110 && del()}
        className="group relative flex items-center gap-3.5 bg-bg"
      >
        <motion.button
          ref={check}
          whileTap={{ scale: 0.7 }}
          transition={spring}
          onClick={() => {
            if (!todo.done && check.current) {
              const r = check.current.getBoundingClientRect()
              sprinkle(r.left + r.width / 2, r.top + r.height / 2, members.map((m) => m.color), 22)
              buzz("done")
            } else buzz()
            put({ done: !todo.done })
          }}
          aria-label={todo.done ? `Uncheck ${todo.text}` : `Check off ${todo.text}`}
          className={`grid size-[26px] shrink-0 place-items-center rounded-full border-2 transition-colors ${todo.done ? "border-green bg-green" : "border-fill-2 hover:border-green hover:bg-green-soft"}`}
        >
          {todo.done && (
            <motion.svg initial={{ pathLength: 0 }} viewBox="0 0 24 24" className="size-[15px]" fill="none" stroke="white" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25 }} />
            </motion.svg>
          )}
        </motion.button>
        <div className="min-w-0 flex-1 py-3.5">
          <TodoText todo={todo} onSave={(text) => put({ text })} />
          {(due || (todo.done && doneBy)) && (
            <div className="mt-1 flex gap-3 text-meta font-medium text-ink-3">
              {due && !todo.done && (
                <span className={`inline-flex items-center gap-1 ${due.late ? "text-danger" : ""}`}>
                  <CalendarDays size={12} /> {due.text}
                </span>
              )}
              {todo.done && doneBy && <span>Done by {doneBy.id === you ? "you" : doneBy.name}</span>}
            </div>
          )}
        </div>
        {!todo.done && (
          <label className="relative hidden size-8 place-items-center rounded-full text-ink-3 hover:bg-fill group-hover:grid" title="Due date">
            <CalendarDays size={16} />
            <input type="date" value={todo.due} onChange={(e) => put({ due: e.target.value })} className="absolute inset-0 opacity-0" aria-label="Due date" />
          </label>
        )}
        <div className="relative">
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setPick(true)} aria-label={who ? `For ${who.name}. Change who` : "Give it to someone"} className="grid size-9 place-items-center rounded-full hover:bg-fill">
            {who ? <Avatar m={who} size={28} here={hereIds.has(who.id)} /> : <UserRound size={18} className="text-ink-3" />}
          </motion.button>
          <Pop open={pick} onClose={() => setPick(false)} align="right" className="w-56">
            {members.map((m) => (
              <button key={m.id} onClick={() => (buzz(), put({ assignee: todo.assignee === m.id ? "" : m.id }), setPick(false))} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sub font-medium hover:bg-fill ${todo.assignee === m.id ? "bg-fill" : ""}`}>
                <Avatar m={m} size={26} /> {m.id === you ? "Me" : m.name || "New member"}
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <label className="relative flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-sub font-medium hover:bg-fill">
              <CalendarDays size={18} className="mx-1 text-ink-3" /> {due ? `Due ${due.text}` : "Set a day"}
              <input type="date" value={todo.due} onChange={(e) => put({ due: e.target.value })} className="absolute inset-0 opacity-0" aria-label="Due date" />
            </label>
            <button onClick={() => (setPick(false), del())} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sub font-medium text-danger hover:bg-fill">
              <Trash2 size={18} className="mx-1" /> Delete
            </button>
          </Pop>
        </div>
      </motion.div>
    </motion.li>
  )
}

function TodoText({ todo, onSave }: { todo: Todo; onSave: (t: string) => void }) {
  const [v, setV] = useState(todo.text)
  const [f, setF] = useState(false)
  if (!f && v !== todo.text) setV(todo.text)
  return (
    <input
      value={v}
      aria-label="To-do"
      onFocus={() => setF(true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setF(false)
        if (v.trim() && v.trim() !== todo.text) onSave(v.trim())
        else setV(todo.text)
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`w-full bg-transparent text-body font-medium outline-none ${todo.done ? "text-ink-3 line-through" : ""}`}
    />
  )
}
