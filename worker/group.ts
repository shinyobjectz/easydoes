// One group's live board: a Durable Object holding the board in memory and in its SQLite (one row per thing), with
// every open browser connected by a hibernating WebSocket. An op from anyone is checked, applied, stored and sent to
// everyone (with the sender's client id, so its own optimistic copy is confirmed). Presence (who's here, looking at
// what) is kept in memory and sent on change. The agent's ops come over HTTP and are shown like anyone's.
import { DurableObject } from "cloudflare:workers"
import { apply, empty, starter, type Board, type Kind, type Member, type Op, type Presence, type ToClient, type ToServer } from "../shared/board"
import type { Env } from "./env"

type Tag = { person: string; conn: string }

export class Group extends DurableObject<Env> {
  private board?: Board
  private here = new Map<string, Presence>() // by connection id
  private agentHere?: { until: number; p: Presence }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS ent (type TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (type, id))")
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)")
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(JSON.stringify({ t: "ping" }), JSON.stringify({ t: "pong" })))
  }

  private load(): Board {
    if (this.board) return this.board
    const b = empty()
    for (const r of this.ctx.storage.sql.exec<{ type: Kind; id: string; json: string }>("SELECT type, id, json FROM ent")) (b[r.type] as any)[r.id] = JSON.parse(r.json)
    return (this.board = b)
  }

  private groupId(): string {
    return this.ctx.storage.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'group'").toArray()[0]?.v ?? ""
  }

  /** the group's first fill: its id and the starter project */
  async init(groupId: string, by: string) {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('group', ?)", groupId)
    if (Object.keys(this.load().projects).length) return
    for (const op of starter(by, Date.now())) this.commit(op, by)
  }

  private async members(): Promise<Member[]> {
    const r = await this.env.DB.prepare(
      "SELECT p.id, p.name, p.emoji, p.color, p.agent, m.role FROM members m JOIN people p ON p.id = m.person_id WHERE m.group_id = ? ORDER BY m.joined_at",
    ).bind(this.groupId()).all<any>()
    return r.results.map((m) => ({ id: m.id, name: m.name, emoji: m.emoji, color: m.color, agent: !!m.agent, role: m.role }))
  }

  /** apply, store and broadcast; returns false when the op did nothing */
  private commit(op: Op, by: string, cid?: string): boolean {
    const b = this.load()
    const now = Date.now()
    const before = op.k === "put" && op.type === "cards" ? b.cards[op.id] : undefined
    const touched = apply(b, op, by, now)
    if (!touched) return false
    for (const t of touched) {
      if (t.gone) this.ctx.storage.sql.exec("DELETE FROM ent WHERE type = ? AND id = ?", t.type, t.id)
      else this.ctx.storage.sql.exec("INSERT OR REPLACE INTO ent (type, id, json) VALUES (?, ?, ?)", t.type, t.id, JSON.stringify((b[t.type] as any)[t.id]))
    }
    this.send({ t: "op", cid, by, op, at: now })
    this.notice(op, by, b, before).catch((e) => console.error("easydoes: notice failed", e))
    return true
  }

  private send(m: ToClient, except?: WebSocket) {
    const s = JSON.stringify(m)
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) try { ws.send(s) } catch {}
  }

  private presence(): Presence[] {
    const list = [...this.here.values()]
    if (this.agentHere && this.agentHere.until > Date.now()) list.push(this.agentHere.p)
    // one entry per person, the most recent
    const by = new Map<string, Presence>()
    for (const p of list) if (!by.has(p.id) || by.get(p.id)!.at < p.at) by.set(p.id, p)
    return [...by.values()]
  }

  // ---- browsers ----

  async fetch(req: Request): Promise<Response> {
    const person = req.headers.get("x-person") ?? ""
    if (req.headers.get("upgrade") !== "websocket" || !person) return new Response("expected a websocket", { status: 426 })
    const pair = new WebSocketPair()
    const conn = crypto.randomUUID()
    this.ctx.acceptWebSocket(pair[1], [person])
    pair[1].serializeAttachment({ person, conn } satisfies Tag)
    this.here.set(conn, { id: person, where: {}, at: Date.now() })
    pair[1].send(JSON.stringify({ t: "hello", you: person, board: this.load(), members: await this.members(), here: this.presence() } satisfies ToClient))
    this.send({ t: "here", here: this.presence() }, pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const tag = ws.deserializeAttachment() as Tag
    let m: ToServer
    try {
      m = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data))
    } catch {
      return
    }
    if (m.t === "op") {
      if (!this.commit(m.op, tag.person, m.cid)) ws.send(JSON.stringify({ t: "nack", cid: m.cid, why: "That change didn't apply." } satisfies ToClient))
    } else if (m.t === "here") {
      this.here.set(tag.conn, { id: tag.person, where: m.where ?? {}, at: Date.now() })
      this.send({ t: "here", here: this.presence() })
    }
  }

  async webSocketClose(ws: WebSocket) {
    const tag = ws.deserializeAttachment() as Tag
    this.here.delete(tag.conn)
    this.send({ t: "here", here: this.presence() })
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws)
  }

  /** after someone joins or changes their name or avatar */
  async membersChanged() {
    this.send({ t: "members", members: await this.members() })
  }

  // ---- the agent (RPC from the Worker's /api/agent routes) ----

  async snapshot() {
    return { board: this.load(), members: await this.members() }
  }

  async agentOps(ops: Op[], where: Presence["where"]) {
    this.agentHere = { until: Date.now() + 8000, p: { id: "agent-raea", where, at: Date.now() } }
    this.send({ t: "here", here: this.presence() })
    const done = ops.map((op) => this.commit(op, "agent-raea"))
    await this.ctx.storage.setAlarm(Date.now() + 8500)
    return done
  }

  async alarm() {
    this.agentHere = undefined
    this.send({ t: "here", here: this.presence() })
  }

  // ---- texts: a card given to someone, or someone's card finished, goes to raea admin, which texts them ----

  private async notice(op: Op, by: string, b: Board, before?: Board["cards"][string]) {
    if (!this.env.NOTIFY_URL || op.k !== "put" || op.type !== "cards") return
    const c = b.cards[op.id]
    if (!c) return
    const events: { kind: string; to: string[] }[] = []
    if (Array.isArray(op.patch.assignees)) events.push({ kind: "assigned", to: c.assignees.filter((a) => a !== by && !(before?.assignees ?? []).includes(a)) })
    if (op.patch.done === true && !before?.done) events.push({ kind: "done", to: [c.by, ...c.assignees].filter((a) => a !== by) })
    if (!events.some((e) => e.to.length)) return
    const project = b.projects[c.projectId]
    const body = JSON.stringify({ group: this.groupId(), by, card: { id: c.id, title: c.title, emoji: c.emoji, due: c.due, project: project?.name ?? "" }, events })
    const mac = await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", new TextEncoder().encode(this.env.NOTIFY_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), new TextEncoder().encode(body))
    await fetch(this.env.NOTIFY_URL, { method: "POST", headers: { "content-type": "application/json", "x-easydoes-signature": [...new Uint8Array(mac)].map((x) => x.toString(16).padStart(2, "0")).join("") }, body })
  }
}
