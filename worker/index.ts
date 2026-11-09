// easydoes's Worker: the web app (static assets, a single-page app) and its API.
//   POST /api/auth/start {phone}          text a sign-in code
//   POST /api/auth/verify {phone, code}   sign in (a session cookie); new people then set a name and avatar
//   POST /api/auth/out                    sign out
//   GET  /api/me                          you and your groups;  POST /api/me {name?, emoji?, color?}
//   POST /api/groups {name, emoji}        make a group (you're its owner) with a starter project
//   GET  /api/invite/:code                a group's name and size, before joining;  POST /api/invite/:code  join it
//   GET  /api/groups/:id/live             the board's WebSocket (members only)
//   /api/agent/* (bearer AGENT_TOKEN)     raea admin agent: groups, state, ops (shown live as the agent's)
import { newId, type Op, type Presence } from "../shared/board"
import { checkCode, endSession, personOf, phone, sendCode, startSession } from "./auth"
import type { Env } from "./env"
export { Group } from "./group"

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } })

const COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#ff6482"]
const EMOJI = ["🦊", "🐼", "🐸", "🦄", "🐙", "🐝", "🦋", "🐳", "🦉", "🐯", "🐨", "🦖"]
const pick = <T,>(xs: T[]) => xs[crypto.getRandomValues(new Uint32Array(1))[0] % xs.length]
const invite = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("")

async function body(req: Request): Promise<Record<string, any>> {
  try {
    return (await req.json()) as Record<string, any>
  } catch {
    return {}
  }
}

async function me(env: Env, id: string) {
  const person = await env.DB.prepare("SELECT id, phone, name, emoji, color FROM people WHERE id = ?").bind(id).first<any>()
  const groups = await env.DB.prepare(
    "SELECT g.id, g.name, g.emoji, g.color, g.invite, m.role, (SELECT COUNT(*) FROM members x WHERE x.group_id = g.id) AS size FROM members m JOIN groups g ON g.id = m.group_id WHERE m.person_id = ? ORDER BY m.joined_at",
  ).bind(id).all<any>()
  return { person: person && { ...person, phone: person.phone ? `•••${person.phone.slice(-4)}` : "" }, groups: groups.results }
}

const isMember = (env: Env, g: string, p: string) => env.DB.prepare("SELECT 1 FROM members WHERE group_id = ? AND person_id = ?").bind(g, p).first()

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname
  const m = req.method

  // ---- the agent ----
  if (p.startsWith("/api/agent/")) {
    if (!env.AGENT_TOKEN || req.headers.get("authorization") !== `Bearer ${env.AGENT_TOKEN}`) return json({ error: "not allowed" }, 401)
    if (p === "/api/agent/groups") {
      const g = await env.DB.prepare("SELECT g.id, g.name, g.emoji FROM members m JOIN groups g ON g.id = m.group_id WHERE m.person_id = 'agent-raea'").all()
      return json({ groups: g.results })
    }
    const gm = p.match(/^\/api\/agent\/groups\/([\w-]+)\/(state|ops|join)$/)
    if (!gm) return json({ error: "not found" }, 404)
    const [, g, what] = gm
    if (what === "join" && m === "POST") {
      const code = String((await body(req)).invite ?? "")
      const row = await env.DB.prepare("SELECT id FROM groups WHERE id = ? AND invite = ?").bind(g, code).first()
      if (!row) return json({ error: "That group and invite don't match." }, 404)
      await env.DB.prepare("INSERT OR IGNORE INTO members (group_id, person_id, role, joined_at) VALUES (?, 'agent-raea', 'agent', ?)").bind(g, Date.now()).run()
      await env.GROUP.get(env.GROUP.idFromName(g)).membersChanged()
      return json({ ok: true })
    }
    if (!(await isMember(env, g, "agent-raea"))) return json({ error: "raea isn't in that group." }, 403)
    const stub = env.GROUP.get(env.GROUP.idFromName(g))
    if (what === "state") return json(await stub.snapshot())
    if (what === "ops" && m === "POST") {
      const b = await body(req)
      const ops = (Array.isArray(b.ops) ? b.ops : []).slice(0, 50) as Op[]
      return json({ applied: await stub.agentOps(ops, (b.where ?? {}) as Presence["where"]) })
    }
    return json({ error: "not found" }, 404)
  }

  // ---- signing in ----
  if (p === "/api/auth/start" && m === "POST") {
    const to = phone((await body(req)).phone)
    if (!to) return json({ error: "That doesn't look like a phone number. Include the country code if you're outside the US." }, 400)
    const ip = req.headers.get("cf-connecting-ip") ?? ""
    if (!(await env.CODE_LIMIT.limit({ key: `ip:${ip}` })).success || !(await env.CODE_LIMIT.limit({ key: `to:${to}` })).success)
      return json({ error: "Too many codes. Wait a minute and try again." }, 429)
    try {
      await sendCode(env, to)
    } catch (e) {
      console.error("easydoes: code not sent", e)
      return json({ error: "We couldn't text that number. Check it and try again." }, 502)
    }
    return json({ ok: true, to: `•••${to.slice(-4)}` })
  }
  if (p === "/api/auth/verify" && m === "POST") {
    const b = await body(req)
    const to = phone(b.phone)
    if (!to) return json({ error: "That doesn't look like a phone number." }, 400)
    const r = await checkCode(env, to, String(b.code ?? ""))
    if (r !== "ok") return json({ error: r === "wrong" ? "That code isn't right. Check the text and try again." : "That code has expired. Send a new one." }, 400)
    let person = await env.DB.prepare("SELECT id, name FROM people WHERE phone = ?").bind(to).first<{ id: string; name: string }>()
    if (!person) {
      person = { id: newId("u"), name: "" }
      await env.DB.prepare("INSERT INTO people (id, phone, name, emoji, color, created_at) VALUES (?, ?, '', ?, ?, ?)").bind(person.id, to, pick(EMOJI), pick(COLORS), Date.now()).run()
    }
    return json({ ok: true, ...(await me(env, person.id)) }, 200, { "set-cookie": await startSession(env, person.id) })
  }
  if (p === "/api/auth/out" && m === "POST") return json({ ok: true }, 200, { "set-cookie": await endSession(env, req) })

  // ---- everything below needs you signed in ----
  const you = await personOf(env, req)
  if (p.match(/^\/api\/invite\/\w+$/) && m === "GET") {
    const g = await env.DB.prepare("SELECT g.id, g.name, g.emoji, g.color, (SELECT COUNT(*) FROM members x WHERE x.group_id = g.id) AS size FROM groups g WHERE invite = ?").bind(p.split("/").pop()).first()
    return g ? json({ group: g, signedIn: !!you }) : json({ error: "That invite doesn't work any more. Ask for a new link." }, 404)
  }
  if (!you) return json({ error: "Sign in first." }, 401)

  if (p === "/api/me" && m === "GET") return json(await me(env, you))
  if (p === "/api/me" && m === "POST") {
    const b = await body(req)
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : undefined
    const emoji = typeof b.emoji === "string" ? b.emoji.slice(0, 16) : undefined
    const color = typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : undefined
    if (name !== undefined && !name) return json({ error: "Add your name so your group knows it's you." }, 400)
    await env.DB.prepare("UPDATE people SET name = COALESCE(?, name), emoji = COALESCE(?, emoji), color = COALESCE(?, color) WHERE id = ?").bind(name ?? null, emoji ?? null, color ?? null, you).run()
    const gs = await env.DB.prepare("SELECT group_id FROM members WHERE person_id = ?").bind(you).all<{ group_id: string }>()
    await Promise.all(gs.results.map((g) => env.GROUP.get(env.GROUP.idFromName(g.group_id)).membersChanged()))
    return json(await me(env, you))
  }
  if (p === "/api/groups" && m === "POST") {
    const b = await body(req)
    const name = String(b.name ?? "").trim().slice(0, 50)
    if (!name) return json({ error: "Give your group a name." }, 400)
    const id = newId("g")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO groups (id, name, emoji, color, invite, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, name, String(b.emoji ?? "🌴").slice(0, 16), pick(COLORS), invite(), you, Date.now()),
      env.DB.prepare("INSERT INTO members (group_id, person_id, role, joined_at) VALUES (?, ?, 'owner', ?)").bind(id, you, Date.now()),
    ])
    await env.GROUP.get(env.GROUP.idFromName(id)).init(id, you)
    return json({ id, ...(await me(env, you)) })
  }
  const inv = p.match(/^\/api\/invite\/(\w+)$/)
  if (inv && m === "POST") {
    const g = await env.DB.prepare("SELECT id FROM groups WHERE invite = ?").bind(inv[1]).first<{ id: string }>()
    if (!g) return json({ error: "That invite doesn't work any more. Ask for a new link." }, 404)
    await env.DB.prepare("INSERT OR IGNORE INTO members (group_id, person_id, role, joined_at) VALUES (?, ?, 'member', ?)").bind(g.id, you, Date.now()).run()
    await env.GROUP.get(env.GROUP.idFromName(g.id)).membersChanged()
    return json({ id: g.id, ...(await me(env, you)) })
  }
  const live = p.match(/^\/api\/groups\/([\w-]+)\/live$/)
  if (live) {
    if (!(await isMember(env, live[1], you))) return json({ error: "You're not in that group." }, 403)
    const headers = new Headers(req.headers)
    headers.set("x-person", you)
    return env.GROUP.get(env.GROUP.idFromName(live[1])).fetch(new Request(req.url, { headers }))
  }
  return json({ error: "not found" }, 404)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith("/api/")) return api(req, env, url).catch((e) => (console.error("easydoes:", e), json({ error: "Something went wrong on our side. Try again." }, 500)))
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
