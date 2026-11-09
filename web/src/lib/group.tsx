// The open group, shared with every part of its screen.
import type { Board, Member, Op, Presence } from "@shared/board"
import { createContext, useContext } from "react"
import type { GroupRow, Me } from "./api"
import type { Live, Status } from "./live"

export type View = { kind: "board"; projectId: string } | { kind: "todos" }

export type Ctx = {
  live: Live
  me: Me
  group: GroupRow
  you: string
  board: Board
  status: Status
  members: Member[]
  member: (id: string) => Member | undefined
  here: Presence[]
  hereIds: Set<string>
  working: Set<string>
  colors: string[]
  op: (...ops: Op[]) => void
  view: View
  setView: (v: View) => void
  openCard: (id: string | null) => void
  cardId: string | null
}

export const GroupCtx = createContext<Ctx | null>(null)
export const useGroup = () => useContext(GroupCtx)!
