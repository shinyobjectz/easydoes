// A group's board: its projects (each a board of columns and cards) and its to-do list, plus the one set of operations
// that changes them. The browser applies an op at once (optimistic) and the group's Durable Object applies the same op as
// the authority and sends it to everyone, so both sides run this file.

export type Id = string

export type Project = { id: Id; name: string; emoji: string; color: string; pos: number; by: Id; at: number }
export type Column = { id: Id; projectId: Id; name: string; pos: number }
export type Check = { id: Id; text: string; done: boolean }
export type Card = {
  id: Id
  projectId: Id
  columnId: Id
  pos: number
  title: string
  notes: string
  emoji: string
  assignees: Id[]
  due: string // YYYY-MM-DD or ""
  done: boolean
  checklist: Check[]
  reactions: Record<string, Id[]>
  by: Id
  at: number
  editedBy: Id
  editedAt: number
}
export type Todo = { id: Id; text: string; done: boolean; assignee: Id; due: string; pos: number; by: Id; at: number; doneBy: Id }

export type Board = {
  projects: Record<Id, Project>
  columns: Record<Id, Column>
  cards: Record<Id, Card>
  todos: Record<Id, Todo>
}

export type Kind = keyof Board

export type Op =
  | { k: "put"; type: Kind; id: Id; patch: Record<string, unknown> }
  | { k: "del"; type: Kind; id: Id }
  | { k: "react"; id: Id; emoji: string }

export const empty = (): Board => ({ projects: {}, columns: {}, cards: {}, todos: {} })

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`

const DEFAULTS: { [K in Kind]: (id: Id, by: Id, now: number) => Board[K][Id] } = {
  projects: (id, by, at) => ({ id, name: "New project", emoji: "🌺", color: "#0a84ff", pos: at, by, at }),
  columns: (id) => ({ id, projectId: "", name: "New list", pos: 0 }),
  cards: (id, by, at) => ({ id, projectId: "", columnId: "", pos: at, title: "", notes: "", emoji: "", assignees: [], due: "", done: false, checklist: [], reactions: {}, by, at, editedBy: by, editedAt: at }),
  todos: (id, by, at) => ({ id, text: "", done: false, assignee: "", due: "", pos: at, by, at, doneBy: "" }),
}

// the fields a put may set, with their types; anything else is dropped
const FIELDS: Record<Kind, Record<string, "s" | "n" | "b" | "ids" | "checks">> = {
  projects: { name: "s", emoji: "s", color: "s", pos: "n" },
  columns: { projectId: "s", name: "s", pos: "n" },
  cards: { projectId: "s", columnId: "s", pos: "n", title: "s", notes: "s", emoji: "s", assignees: "ids", due: "s", done: "b", checklist: "checks" },
  todos: { text: "s", done: "b", assignee: "s", due: "s", pos: "n" },
}

const MAX_TEXT = 4000

/** the patch with only the fields this kind has, each of the right type and size; null when nothing is left */
export function clean(type: Kind, patch: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  const spec = FIELDS[type]
  if (!spec) return null
  for (const [k, v] of Object.entries(patch ?? {})) {
    const t = spec[k]
    if (t === "s" && typeof v === "string") out[k] = v.slice(0, k === "notes" ? MAX_TEXT : 300)
    else if (t === "n" && typeof v === "number" && Number.isFinite(v)) out[k] = v
    else if (t === "b" && typeof v === "boolean") out[k] = v
    else if (t === "ids" && Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").slice(0, 20)
    else if (t === "checks" && Array.isArray(v))
      out[k] = v
        .filter((c: any) => c && typeof c.id === "string" && typeof c.text === "string")
        .slice(0, 100)
        .map((c: any) => ({ id: c.id.slice(0, 40), text: c.text.slice(0, 300), done: !!c.done }))
  }
  return Object.keys(out).length ? out : null
}

/** apply an op by person `by` at time `now`; returns the ids it touched (for persistence), or null if it did nothing */
export function apply(b: Board, op: Op, by: Id, now: number): { type: Kind; id: Id; gone?: boolean }[] | null {
  if (op.k === "react") {
    const c = b.cards[op.id]
    if (!c || typeof op.emoji !== "string" || op.emoji.length > 16) return null
    const who = new Set(c.reactions[op.emoji] ?? [])
    who.has(by) ? who.delete(by) : who.add(by)
    const reactions = { ...c.reactions, [op.emoji]: [...who] }
    if (!who.size) delete reactions[op.emoji]
    b.cards[op.id] = { ...c, reactions }
    return [{ type: "cards", id: op.id }]
  }
  if (!(op.type in FIELDS) || typeof op.id !== "string" || op.id.length > 40) return null
  if (op.k === "del") {
    const touched: { type: Kind; id: Id; gone?: boolean }[] = []
    const drop = (type: Kind, id: Id) => {
      if (!(b[type] as Record<Id, unknown>)[id]) return
      delete (b[type] as Record<Id, unknown>)[id]
      touched.push({ type, id, gone: true })
    }
    if (op.type === "projects") {
      for (const c of Object.values(b.columns)) if (c.projectId === op.id) drop("columns", c.id)
      for (const c of Object.values(b.cards)) if (c.projectId === op.id) drop("cards", c.id)
    }
    if (op.type === "columns") for (const c of Object.values(b.cards)) if (c.columnId === op.id) drop("cards", c.id)
    drop(op.type, op.id)
    return touched.length ? touched : null
  }
  const patch = clean(op.type, op.patch)
  if (!patch) return null
  const table = b[op.type] as Record<Id, any>
  const was = table[op.id] ?? DEFAULTS[op.type](op.id, by, now)
  const next = { ...was, ...patch }
  if (op.type === "cards") Object.assign(next, { editedBy: by, editedAt: now })
  if (op.type === "todos" && "done" in patch) next.doneBy = patch.done ? by : ""
  table[op.id] = next
  return [{ type: op.type, id: op.id }]
}

// ---- reading helpers (both sides) ----

export const byPos = <T extends { pos: number }>(xs: T[]) => [...xs].sort((a, b) => a.pos - b.pos)
export const projectsOf = (b: Board) => byPos(Object.values(b.projects))
export const columnsOf = (b: Board, projectId: Id) => byPos(Object.values(b.columns).filter((c) => c.projectId === projectId))
export const cardsOf = (b: Board, columnId: Id) => byPos(Object.values(b.cards).filter((c) => c.columnId === columnId))

/** a position between two neighbours (either may be missing) */
export const between = (before?: number, after?: number) =>
  before === undefined && after === undefined ? Date.now() : before === undefined ? after! - 1024 : after === undefined ? before + 1024 : (before + after) / 2

/** the starter project every new group gets */
export function starter(by: Id, now: number): Op[] {
  const p = newId("p")
  const cols = ["To do", "Doing", "Done"].map((name, i) => ({ id: newId("c"), name, pos: (i + 1) * 1024 }))
  return [
    { k: "put", type: "projects", id: p, patch: { name: "First project", emoji: "🌴", color: "#0a84ff", pos: now } },
    ...cols.map((c) => ({ k: "put" as const, type: "columns" as const, id: c.id, patch: { projectId: p, name: c.name, pos: c.pos } })),
    { k: "put", type: "cards", id: newId("k"), patch: { projectId: p, columnId: cols[0].id, pos: 1024, title: "Drag me to Doing", emoji: "🌊" } },
    { k: "put", type: "cards", id: newId("k"), patch: { projectId: p, columnId: cols[0].id, pos: 2048, title: "Invite your people", emoji: "🐚" } },
  ]
}

// ---- the live protocol ----

export type Member = { id: Id; name: string; emoji: string; color: string; agent: boolean; role: string }
export type Presence = { id: Id; where: { projectId?: Id; cardId?: Id; view?: "board" | "todos" }; at: number }

export type ToServer =
  | { t: "op"; cid: string; op: Op }
  | { t: "here"; where: Presence["where"] }
  | { t: "ping" }

export type ToClient =
  | { t: "hello"; you: Id; board: Board; members: Member[]; here: Presence[] }
  | { t: "op"; cid?: string; by: Id; op: Op; at: number }
  | { t: "nack"; cid: string; why: string }
  | { t: "here"; here: Presence[] }
  | { t: "members"; members: Member[] }
  | { t: "pong" }
