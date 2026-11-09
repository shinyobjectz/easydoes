// A group's screen. Wide: a vibrancy sidebar over the board (the board scrolls under it), a card's detail springs in
// from the right. Phone: a top bar, the board as snapping pages, the sidebar as a drawer, the detail as a sheet.
import { columnsOf, newId, projectsOf, type Member } from "@shared/board"
import { Check, ChevronDown, LogOut, Menu, Plus, Share, UserRound, WifiOff, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Board } from "../components/Board"
import { Detail } from "../components/Detail"
import { Todos } from "../components/Todos"
import { Avatar, Loader, Pop, Stack, spring, toast } from "../components/ui"
import { api, type GroupRow, type Me } from "../lib/api"
import { sprinkle } from "../lib/burst"
import { GroupCtx, useGroup, type Ctx, type View } from "../lib/group"
import { buzz } from "../lib/haptics"
import { Live } from "../lib/live"
import { go, useMedia } from "../lib/route"
import { share } from "../lib/share"

const SIDEBAR = 272

type Props = { me: Me; group: GroupRow; sub?: string; onProfile: () => void }

export function GroupScreen(p: Props) {
  const [live, setLive] = useState<Live | null>(null)
  useEffect(() => {
    const l = new Live(p.group.id)
    setLive(l)
    return () => l.close()
  }, [p.group.id])
  return live ? <GroupLive {...p} live={live} /> : null
}

function GroupLive({ me, group, sub, onProfile, live }: Props & { live: Live }) {
  const s = useSyncExternalStore(live.subscribe, live.get)
  const wide = useMedia("(min-width: 900px)")
  const [drawer, setDrawer] = useState(false)
  // ?c= opens a card (a shared card's link); the URL follows whichever card is open
  const [cardId, setCardId] = useState<string | null>(() => new URLSearchParams(location.search).get("c"))
  useEffect(() => {
    const u = new URL(location.href)
    if ((u.searchParams.get("c") ?? null) === cardId) return
    if (cardId) u.searchParams.set("c", cardId)
    else u.searchParams.delete("c")
    history.replaceState(history.state, "", u.pathname + u.search)
  }, [cardId])

  const projects = projectsOf(s.board)
  const view: View = sub === "todos" ? { kind: "todos" } : { kind: "board", projectId: sub?.startsWith("p/") && s.board.projects[sub.slice(2)] ? sub.slice(2) : projects[0]?.id ?? "" }
  const setView = useCallback(
    (v: View) => {
      go(`/g/${group.id}${v.kind === "todos" ? "/todos" : `/p/${v.projectId}`}`)
      setDrawer(false)
      setCardId(null)
    },
    [group.id],
  )

  const member = useCallback((id: string) => s.members.find((m) => m.id === id), [s.members])
  const hereIds = useMemo(() => new Set(s.here.map((h) => h.id)), [s.here])
  const working = useMemo(() => new Set(s.here.filter((h) => s.members.find((m) => m.id === h.id)?.agent).map((h) => h.id)), [s.here, s.members])
  const colors = useMemo(() => s.members.map((m) => m.color), [s.members])

  useEffect(() => {
    live.here(view.kind === "todos" ? { view: "todos" } : { view: "board", projectId: view.projectId, cardId: cardId ?? undefined })
  }, [live, view.kind, view.kind === "board" ? view.projectId : "", cardId])

  useEffect(() => {
    live.onNack = (why) => (toast(why), buzz("error"))
    live.onRemote = ({ by, op, before, after }) => {
      if (op.k !== "put") return
      const who = s.members.find((m) => m.id === by)
      const name = who?.name || "Someone"
      if (op.type === "cards" && op.patch.done === true && !before.cards[op.id]?.done) {
        toast(`${who?.emoji ?? "🎉"} ${name} finished “${after.cards[op.id]?.title || "a card"}”`)
        sprinkle(innerWidth / 2, 80, colors, 36)
      } else if (op.type === "todos" && op.patch.done === true && !before.todos[op.id]?.done) {
        toast(`${who?.emoji ?? "✅"} ${name} checked off “${after.todos[op.id]?.text}”`)
      } else if (op.type === "cards" && Array.isArray(op.patch.assignees) && (op.patch.assignees as string[]).includes(s.you) && !before.cards[op.id]?.assignees.includes(s.you)) {
        toast(`${name} gave you “${after.cards[op.id]?.title}”`)
        buzz("tick")
      }
    }
  }, [live, s.members, s.you, colors])

  const ctx: Ctx = {
    live,
    me,
    group,
    you: s.you,
    board: s.board,
    status: s.status,
    members: s.members,
    member,
    here: s.here,
    hereIds,
    working,
    colors,
    op: live.op.bind(live),
    view,
    setView,
    openCard: setCardId,
    cardId: cardId && s.board.cards[cardId] ? cardId : null,
  }

  return (
    <GroupCtx.Provider value={ctx}>
      <div className="relative h-[100dvh] overflow-hidden">
        {!s.ready ? (
          <Loader label={`Opening ${group.name}`} />
        ) : (
          <>
            {wide ? (
              <aside className="vibrancy fixed inset-y-0 left-0 z-30 flex flex-col border-r border-glass-line" style={{ width: SIDEBAR }}>
                <Sidebar onProfile={onProfile} />
              </aside>
            ) : (
              <TopBar onMenu={() => setDrawer(true)} />
            )}
            <main className="h-full" style={{ paddingLeft: 0 }}>
              {view.kind === "todos" ? <Todos inset={wide ? SIDEBAR : 0} /> : view.projectId ? <Board key={view.projectId} inset={wide ? SIDEBAR : 0} wide={wide} /> : <NoProjects inset={wide ? SIDEBAR : 0} />}
            </main>
            {!wide && (
              <AnimatePresence>
                {drawer && (
                  <>
                    <motion.div className="fixed inset-0 z-40 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
                    <motion.aside
                      className="vibrancy shadow-panel fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[320px] flex-col rounded-r-sheet pad-safe-t"
                      initial={{ x: "-105%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "-105%" }}
                      transition={spring}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={{ left: 0.6, right: 0.05 }}
                      onDragEnd={(_, i) => i.offset.x < -80 && setDrawer(false)}
                    >
                      <Sidebar onProfile={onProfile} />
                    </motion.aside>
                  </>
                )}
              </AnimatePresence>
            )}
            <Detail wide={wide} />
            <AnimatePresence>
              {s.status === "offline" && (
                <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} transition={spring} className="vibrancy shadow-panel fixed left-1/2 top-3 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-meta font-medium">
                  <WifiOff size={15} /> Reconnecting. Your changes are kept and will send.
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </GroupCtx.Provider>
  )
}

function NoProjects({ inset }: { inset: number }) {
  const { op } = useGroup()
  return (
    <div className="grid h-full place-items-center px-6 text-center" style={{ paddingLeft: inset + 24 }}>
      <div>
        <div className="text-[48px]">🌴</div>
        <h2 className="mt-3 font-display text-[22px] font-bold tracking-[-0.02em]">No projects yet</h2>
        <p className="mt-1 text-ink-2">A project is a board of lists and cards.</p>
        <button onClick={() => addProject(op)} className="mt-5 rounded-xl bg-accent px-4 py-2.5 font-semibold text-white">
          New project
        </button>
      </div>
    </div>
  )
}

export function addProject(op: Ctx["op"], name = "New project") {
  const p = newId("p")
  op(
    { k: "put", type: "projects", id: p, patch: { name, emoji: "🌺", pos: Date.now() } },
    ...["To do", "Doing", "Done"].map((n, i) => ({ k: "put" as const, type: "columns" as const, id: newId("c"), patch: { projectId: p, name: n, pos: (i + 1) * 1024 } })),
  )
  return p
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { group, members, hereIds, working, view, setView, board } = useGroup()
  const present = members.filter((m) => hereIds.has(m.id))
  const project = view.kind === "board" ? board.projects[view.projectId] : undefined
  return (
    <header className="vibrancy fixed inset-x-0 top-0 z-30 border-b border-glass-line pad-safe-t">
      <div className="flex h-[52px] items-center gap-2 pl-2 pr-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onMenu} aria-label="Open the sidebar" className="grid size-10 place-items-center rounded-full text-accent-ink">
          <Menu size={22} strokeWidth={2.2} />
        </motion.button>
        <button onClick={onMenu} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="text-[22px]">{view.kind === "todos" ? "☑️" : project?.emoji ?? group.emoji}</span>
          <span className="truncate font-display text-body font-semibold tracking-[-0.02em]">{view.kind === "todos" ? "To-dos" : project?.name ?? group.name}</span>
        </button>
        <Stack people={present} here={hereIds} working={working} size={28} max={3} />
      </div>
    </header>
  )
}

function Sidebar({ onProfile }: { onProfile: () => void }) {
  const g = useGroup()
  const { board, view, setView, members, hereIds, working, me, group, op, here } = g
  const [groupsOpen, setGroupsOpen] = useState(false)
  const projects = projectsOf(board)
  const openTodos = Object.values(board.todos).filter((t) => !t.done).length
  const lookers = (projectId: string) => members.filter((m) => m.id !== g.you && here.some((h) => h.id === m.id && h.where.projectId === projectId))

  const invite = () => share(`/j/${group.invite}`, `Join ${group.name} on easydoes`, "Invite link copied")

  return (
    <div className="flex h-full flex-col">
      <div className="relative px-3 pt-3">
        <button onClick={() => setGroupsOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-fill" aria-expanded={groupsOpen}>
          <span className="grid size-9 place-items-center rounded-[10px] text-[22px]" style={{ background: `color-mix(in srgb, ${group.color} 22%, var(--surface))` }}>
            {group.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-body font-semibold tracking-[-0.02em]">{group.name}</span>
            <span className="block text-micro text-ink-3">
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </span>
          <ChevronDown size={16} className={`text-ink-3 transition-transform ${groupsOpen ? "rotate-180" : ""}`} />
        </button>
        <Pop open={groupsOpen} onClose={() => setGroupsOpen(false)} className="w-[calc(100%-24px)]" align="left">
          {me.groups.map((x) => (
            <button key={x.id} onClick={() => (setGroupsOpen(false), go(`/g/${x.id}`))} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-fill">
              <span className="text-[20px]">{x.emoji}</span>
              <span className="flex-1 truncate font-medium">{x.name}</span>
              {x.id === group.id && <Check size={16} className="text-accent-ink" />}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <button onClick={() => go("/new")} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-medium text-accent-ink hover:bg-fill">
            <Plus size={18} /> New group
          </button>
        </Pop>
      </div>

      <nav className="no-scrollbar mt-3 flex-1 overflow-y-auto px-3 pb-3">
        <SideItem active={view.kind === "todos"} onClick={() => setView({ kind: "todos" })} icon={<span className="text-[18px]">☑️</span>} label="To-dos" count={openTodos} />
        <div className="mt-5 mb-1 flex items-center justify-between px-2.5">
          <span className="text-micro font-semibold uppercase tracking-[0.04em] text-ink-3">Projects</span>
          <motion.button whileTap={{ scale: 0.85 }} aria-label="New project" onClick={() => (buzz(), setView({ kind: "board", projectId: addProject(op) }))} className="grid size-7 place-items-center rounded-full text-accent-ink hover:bg-fill">
            <Plus size={17} strokeWidth={2.4} />
          </motion.button>
        </div>
        {projects.map((p) => {
          const n = Object.values(board.cards).filter((c) => c.projectId === p.id && !c.done).length
          const lk = lookers(p.id)
          return (
            <SideItem
              key={p.id}
              active={view.kind === "board" && view.projectId === p.id}
              onClick={() => setView({ kind: "board", projectId: p.id })}
              icon={<span className="text-[18px]">{p.emoji}</span>}
              label={p.name}
              count={n}
              extra={lk.length ? <Stack people={lk} here={hereIds} working={working} size={18} max={3} /> : undefined}
            />
          )
        })}

        <div className="mt-5 mb-1 flex items-center justify-between px-2.5">
          <span className="text-micro font-semibold uppercase tracking-[0.04em] text-ink-3">People</span>
          <motion.button whileTap={{ scale: 0.85 }} aria-label="Invite people" onClick={invite} className="grid size-7 place-items-center rounded-full text-accent-ink hover:bg-fill">
            <Share size={15} strokeWidth={2.4} />
          </motion.button>
        </div>
        {[...members].sort((a, b) => Number(hereIds.has(b.id)) - Number(hereIds.has(a.id))).map((m) => (
          <PersonRow key={m.id} m={m} here={hereIds.has(m.id)} working={working.has(m.id)} you={m.id === g.you} where={here.find((h) => h.id === m.id)?.where} />
        ))}
        <button onClick={invite} className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sub font-medium text-accent-ink hover:bg-fill">
          <span className="grid size-7 place-items-center rounded-full bg-fill">
            <Plus size={16} strokeWidth={2.4} />
          </span>
          Invite people
        </button>
      </nav>

      <div className="flex items-center gap-1 border-t border-glass-line px-3 py-2.5 pad-safe-b">
        <button onClick={onProfile} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-fill">
          <Avatar m={me.person ?? undefined} size={30} />
          <span className="truncate text-sub font-medium">{me.person?.name}</span>
          <UserRound size={14} className="ml-auto text-ink-3" />
        </button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          aria-label="Sign out"
          title="Sign out"
          onClick={async () => {
            await api("/auth/out", {}).catch(() => {})
            location.href = "/"
          }}
          className="grid size-9 place-items-center rounded-xl text-ink-3 hover:bg-fill"
        >
          <LogOut size={17} />
        </motion.button>
      </div>
    </div>
  )
}

function SideItem({ active, onClick, icon, label, count, extra }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number; extra?: React.ReactNode }) {
  return (
    <button onClick={() => (buzz(), onClick())} className="relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left" aria-current={active ? "page" : undefined}>
      {active && <motion.span layoutId="side-active" className="absolute inset-0 rounded-xl bg-fill-2" transition={spring} />}
      <span className="relative">{icon}</span>
      <span className={`relative flex-1 truncate text-sub ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
      {extra && <span className="relative">{extra}</span>}
      {!!count && <span className="relative text-meta text-ink-3 tabular">{count}</span>}
    </button>
  )
}

function PersonRow({ m, here, working, you, where }: { m: Member; here: boolean; working: boolean; you: boolean; where?: { projectId?: string; view?: string; cardId?: string } }) {
  const { board } = useGroup()
  const at = where?.view === "todos" ? "on To-dos" : where?.cardId ? `on “${board.cards[where.cardId]?.title ?? "a card"}”` : where?.projectId ? `in ${board.projects[where.projectId]?.name ?? "a project"}` : ""
  return (
    <div className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 ${here ? "" : "opacity-60"}`}>
      <Avatar m={m} size={28} here={here} working={working} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sub font-medium">
          {m.name || "New member"}
          {you && <span className="text-ink-3"> (you)</span>}
          {m.agent && <span className="ml-1.5 rounded-md bg-fill px-1.5 py-px text-micro font-semibold text-ink-2">AI</span>}
        </span>
        <span className="block truncate text-micro text-ink-3">{working ? "Working on the board" : here ? at || "Here now" : m.agent ? "Ask it by text" : "Away"}</span>
      </span>
    </div>
  )
}

