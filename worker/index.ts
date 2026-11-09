// easydoes's Worker: the web app (static assets, a single-page app) and its API.
//   POST /api/auth/start {phone}          text a sign-in code
//   POST /api/auth/verify {phone, code}   sign in (a session cookie); new people then set a name and avatar
//   POST /api/auth/out                    sign out
//   GET  /api/me                          you and your groups;  POST /api/me {name?, emoji?, color?}
//   POST /api/groups {name, emoji}        make a group (you're its owner) with a starter project
//   GET  /api/invite/:code                a group's name and size, before joining;  POST /api/invite/:code  join it
//   GET  /api/groups/:id/live             the board's WebSocket (members only)
//   /api/agent/* (bearer AGENT_TOKEN)     raea admin agent: groups (list, make), state, ops (shown live as the agent's)
//   /api/agent/admin/*                    for easydoes's owner, through the agent: stats, every group with its invite link,
//                                         a fresh invite link, add or remove a member, rename
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

const link = (env: Env, code: string) => `${env.ORIGIN}/j/${code}`
const masked = (ph: string | null) => (ph ? `•••${ph.slice(-4)}` : "")

/** a group by id, or by its name (case-insensitive, the newest if several share it) */
async function groupNamed(env: Env, key: string) {
  return env.DB.prepare("SELECT id, name, emoji, invite FROM groups WHERE id = ?1 OR lower(name) = lower(?1) ORDER BY created_at DESC LIMIT 1").bind(key).first<{ id: string; name: string; emoji: string; invite: string }>()
}

async function admin(req: Request, env: Env, path: string, m: string): Promise<Response> {
  if (path === "stats" && m === "GET") {
    const week = Date.now() - 7 * 86400_000
    const [people, groups, newPeople, newGroups, live] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) n FROM people WHERE agent = 0").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM groups").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM people WHERE agent = 0 AND created_at > ?").bind(week).first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM groups WHERE created_at > ?").bind(week).first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(DISTINCT person_id) n FROM sessions WHERE expires > ?").bind(Date.now()).first<{ n: number }>(),
    ])
    return json({ people: people?.n, groups: groups?.n, new_people_7d: newPeople?.n, new_groups_7d: newGroups?.n, signed_in_people: live?.n })
  }
  if (path === "groups" && m === "GET") {
    const gs = await env.DB.prepare("SELECT id, name, emoji, invite, created_at FROM groups ORDER BY created_at DESC LIMIT 200").all<any>()
    const ms = await env.DB.prepare("SELECT m.group_id, p.id, p.name, p.phone, p.agent, m.role, m.joined_at FROM members m JOIN people p ON p.id = m.person_id ORDER BY m.joined_at").all<any>()
    return json({
      groups: gs.results.map((g) => ({
        id: g.id,
        name: g.name,
        emoji: g.emoji,
        invite_link: link(env, g.invite),
        made: new Date(g.created_at).toISOString().slice(0, 10),
        members: ms.results.filter((x) => x.group_id === g.id).map((x) => ({ name: x.name || "(no name yet)", role: x.role, phone: masked(x.phone), joined: new Date(x.joined_at).toISOString().slice(0, 10) })),
      })),
    })
  }
  const gm = path.match(/^groups\/([^/]+)(?:\/(invite|members|remove))?$/)
  if (!gm || m !== "POST") return json({ error: "not found" }, 404)
  const g = await groupNamed(env, decodeURIComponent(gm[1]))
  if (!g) return json({ error: `No group called ${decodeURIComponent(gm[1])}.` }, 404)
  const b = await body(req)
  const stub = env.GROUP.get(env.GROUP.idFromName(g.id))
  if (gm[2] === "invite") {
    const code = invite()
    await env.DB.prepare("UPDATE groups SET invite = ? WHERE id = ?").bind(code, g.id).run()
    return json({ group: g.name, invite_link: link(env, code), old_link_works: false })
  }
  if (gm[2] === "members") {
    const now = Date.now()
    let pid: string
    if (/^(raea|agent|the agent)$/i.test(String(b.phone ?? b.name ?? "").trim()) && !b.phone?.match?.(/\d/)) pid = "agent-raea"
    else {
      const to = phone(b.phone)
      if (!to) return json({ error: "That isn't a phone number. Include the country code outside the US." }, 400)
      pid = (await env.DB.prepare("SELECT id FROM people WHERE phone = ?").bind(to).first<{ id: string }>())?.id ?? ""
      if (!pid) {
        pid = newId("u")
        await env.DB.prepare("INSERT INTO people (id, phone, name, emoji, color, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(pid, to, String(b.name ?? "").trim().slice(0, 40), pick(EMOJI), pick(COLORS), now).run()
      } else if (b.name) await env.DB.prepare("UPDATE people SET name = CASE WHEN name = '' THEN ? ELSE name END WHERE id = ?").bind(String(b.name).trim().slice(0, 40), pid).run()
    }
    const role = pid === "agent-raea" ? "agent" : b.role === "owner" ? "owner" : "member"
    const r = await env.DB.prepare("INSERT OR IGNORE INTO members (group_id, person_id, role, joined_at) VALUES (?, ?, ?, ?)").bind(g.id, pid, role, now).run()
    await stub.membersChanged()
    return json({ group: g.name, added: r.meta.changes > 0, already_in: r.meta.changes === 0, group_link: `${env.ORIGIN}/g/${g.id}`, note: "They sign in at easydoes.ai with that number and the group is there." })
  }
  if (gm[2] === "remove") {
    const who = String(b.who ?? "").trim().toLowerCase()
    const ms = await env.DB.prepare("SELECT p.id, p.name, p.phone, m.role FROM members m JOIN people p ON p.id = m.person_id WHERE m.group_id = ?").bind(g.id).all<any>()
    const digits = who.replace(/\D/g, "")
    const hit = ms.results.filter((x) => (digits.length >= 4 && x.phone?.endsWith(digits)) || (x.name && x.name.toLowerCase().split(" ")[0] === who.split(" ")[0]) || (who === "raea" && x.id === "agent-raea"))
    if (hit.length !== 1) return json({ error: hit.length ? `More than one member matches "${b.who}"; give their phone's last 4.` : `No one in ${g.name} matches "${b.who}". Members: ${ms.results.map((x) => x.name || masked(x.phone)).join(", ")}` }, 400)
    const x = hit[0]
    if (x.role === "owner" && ms.results.filter((y) => y.role === "owner").length === 1) return json({ error: `${x.name || "They"} is ${g.name}'s only owner, so can't be removed.` }, 400)
    await env.DB.prepare("DELETE FROM members WHERE group_id = ? AND person_id = ?").bind(g.id, x.id).run()
    await stub.kick(x.id)
    return json({ group: g.name, removed: x.name || masked(x.phone) })
  }
  // rename or re-emoji
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 50) : ""
  const emoji = typeof b.emoji === "string" ? b.emoji.slice(0, 16) : ""
  if (!name && !emoji) return json({ error: "Give a new name or emoji." }, 400)
  await env.DB.prepare("UPDATE groups SET name = COALESCE(NULLIF(?, ''), name), emoji = COALESCE(NULLIF(?, ''), emoji) WHERE id = ?").bind(name, emoji, g.id).run()
  return json({ group: name || g.name, emoji: emoji || g.emoji })
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname
  const m = req.method

  // ---- the agent ----
  if (p.startsWith("/api/agent/")) {
    if (!env.AGENT_TOKEN || req.headers.get("authorization") !== `Bearer ${env.AGENT_TOKEN}`) return json({ error: "not allowed" }, 401)
    // ---- admin (raea admin agent, for easydoes's owner): every group, invite links, members ----
    if (p.startsWith("/api/agent/admin/")) return admin(req, env, p.slice("/api/agent/admin/".length), m)
    if (p === "/api/agent/groups" && m === "GET") {
      const g = await env.DB.prepare("SELECT g.id, g.name, g.emoji FROM members m JOIN groups g ON g.id = m.group_id WHERE m.person_id = 'agent-raea'").all()
      return json({ groups: g.results })
    }
    if (p === "/api/agent/groups" && m === "POST") {
      // a new group with the agent in it, and its people by phone (made if new; names only fill blanks)
      const b = await body(req)
      const name = String(b.name ?? "").trim().slice(0, 50)
      if (!name) return json({ error: "A group needs a name." }, 400)
      const id = newId("g")
      const now = Date.now()
      const people: { id: string; role: string }[] = []
      for (const x of (Array.isArray(b.people) ? b.people : []).slice(0, 50)) {
        const to = phone(x?.phone)
        if (!to) return json({ error: `Not a phone number: ${String(x?.phone).slice(-4)}` }, 400)
        let pid = (await env.DB.prepare("SELECT id FROM people WHERE phone = ?").bind(to).first<{ id: string }>())?.id
        if (!pid) {
          pid = newId("u")
          await env.DB.prepare("INSERT INTO people (id, phone, name, emoji, color, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(pid, to, String(x.name ?? "").slice(0, 40), String(x.emoji ?? pick(EMOJI)).slice(0, 16), /^#[0-9a-f]{6}$/i.test(x.color ?? "") ? x.color : pick(COLORS), now).run()
        } else if (x.name) await env.DB.prepare("UPDATE people SET name = CASE WHEN name = '' THEN ? ELSE name END WHERE id = ?").bind(String(x.name).slice(0, 40), pid).run()
        people.push({ id: pid, role: x.role === "owner" ? "owner" : "member" })
      }
      const owner = people.find((x) => x.role === "owner")?.id ?? people[0]?.id ?? "agent-raea"
      await env.DB.batch([
        env.DB.prepare("INSERT INTO groups (id, name, emoji, color, invite, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, name, String(b.emoji ?? "🌴").slice(0, 16), pick(COLORS), invite(), owner, now),
        env.DB.prepare("INSERT INTO members (group_id, person_id, role, joined_at) VALUES (?, 'agent-raea', 'agent', ?)").bind(id, now),
        ...people.map((x, i) => env.DB.prepare("INSERT OR IGNORE INTO members (group_id, person_id, role, joined_at) VALUES (?, ?, ?, ?)").bind(id, x.id, x.role, now + i + 1)),
      ])
      await env.GROUP.get(env.GROUP.idFromName(id)).init(id, owner)
      return json({ id, invite: (await env.DB.prepare("SELECT invite FROM groups WHERE id = ?").bind(id).first<{ invite: string }>())!.invite })
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
