// One group's live board in the browser: a WebSocket to the group's Durable Object, the server's board, and this
// browser's ops not yet confirmed, applied on top so a change shows at once. Reconnects by itself and resends.
import { apply, empty, newId, type Board, type Member, type Op, type Presence, type ToClient } from "@shared/board"

export type Status = "connecting" | "live" | "offline"
export type LiveState = { status: Status; you: string; board: Board; members: Member[]; here: Presence[]; ready: boolean }
export type Remote = { by: string; op: Op; before: Board; after: Board }

export class Live {
  private ws?: WebSocket
  private base: Board = empty()
  private pending: { cid: string; op: Op }[] = []
  private subs = new Set<() => void>()
  private where: Presence["where"] = {}
  private retry = 0
  private timer?: ReturnType<typeof setTimeout>
  private beat?: ReturnType<typeof setInterval>
  private closed = false
  state: LiveState = { status: "connecting", you: "", board: empty(), members: [], here: [], ready: false }
  onRemote?: (r: Remote) => void
  onNack?: (why: string) => void

  constructor(readonly groupId: string) {
    this.connect()
    document.addEventListener("visibilitychange", this.wake)
    addEventListener("online", this.wake)
  }

  subscribe = (f: () => void) => (this.subs.add(f), () => void this.subs.delete(f))
  get = () => this.state

  private emit(patch: Partial<LiveState>) {
    this.state = { ...this.state, ...patch }
    this.subs.forEach((f) => f())
  }

  private view(): Board {
    if (!this.pending.length) return this.base
    const b = structuredClone(this.base)
    for (const p of this.pending) apply(b, p.op, this.state.you, Date.now())
    return b
  }

  private wake = () => {
    if (document.visibilityState === "visible" && this.state.status === "offline" && !this.closed) {
      clearTimeout(this.timer)
      this.connect()
    }
  }

  private connect() {
    if (this.closed) return
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/groups/${this.groupId}/live`)
    this.ws = ws
    this.emit({ status: "connecting" })
    ws.onmessage = (e) => this.message(JSON.parse(e.data) as ToClient)
    ws.onclose = () => {
      if (this.ws !== ws) return
      clearInterval(this.beat)
      this.emit({ status: "offline" })
      if (this.closed) return
      this.timer = setTimeout(() => this.connect(), Math.min(8000, 400 * 2 ** this.retry++))
    }
  }

  private message(m: ToClient) {
    if (m.t === "hello") {
      this.retry = 0
      this.base = m.board
      this.state.you = m.you
      for (const p of this.pending) this.ws?.send(JSON.stringify({ t: "op", cid: p.cid, op: p.op }))
      this.ws?.send(JSON.stringify({ t: "here", where: this.where }))
      clearInterval(this.beat)
      this.beat = setInterval(() => this.ws?.readyState === 1 && this.ws.send(JSON.stringify({ t: "ping" })), 25_000)
      this.emit({ status: "live", you: m.you, members: m.members, here: m.here, board: this.view(), ready: true })
    } else if (m.t === "op") {
      const mine = m.cid && this.pending.findIndex((p) => p.cid === m.cid)
      const before = this.state.board
      const next = structuredClone(this.base)
      apply(next, m.op, m.by, m.at)
      this.base = next
      if (typeof mine === "number" && mine >= 0) this.pending.splice(mine, 1)
      const board = this.view()
      this.emit({ board })
      if (m.by !== this.state.you) this.onRemote?.({ by: m.by, op: m.op, before, after: board })
    } else if (m.t === "nack") {
      this.pending = this.pending.filter((p) => p.cid !== m.cid)
      this.emit({ board: this.view() })
      this.onNack?.(m.why)
    } else if (m.t === "here") this.emit({ here: m.here })
    else if (m.t === "members") this.emit({ members: m.members })
  }

  op(...ops: Op[]) {
    for (const op of ops) {
      const cid = newId("o")
      this.pending.push({ cid, op })
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: "op", cid, op }))
    }
    this.emit({ board: this.view() })
  }

  here(where: Presence["where"]) {
    if (JSON.stringify(where) === JSON.stringify(this.where)) return
    this.where = where
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: "here", where }))
  }

  close() {
    this.closed = true
    clearTimeout(this.timer)
    clearInterval(this.beat)
    document.removeEventListener("visibilitychange", this.wake)
    removeEventListener("online", this.wake)
    this.ws?.close()
  }
}
