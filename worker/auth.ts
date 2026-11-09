// Sign-in by text: a six-digit code sent from the raea agent's Sendblue line, then a session cookie. Codes and session
// tokens are stored only as peppered SHA-256 hashes; a code lasts 10 minutes and allows 5 tries.
import type { Env } from "./env"

const CODE_TTL = 10 * 60_000
const SESSION_TTL = 60 * 86400_000
export const COOKIE = "ed_session"

export async function hash(env: Env, s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.SESSION_PEPPER}|${s}`))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** +E.164 from what someone typed; US/Canada when there's no country code */
export function phone(raw: string): string | null {
  const s = String(raw ?? "").trim()
  const d = s.replace(/\D/g, "")
  if (s.startsWith("+")) return d.length >= 8 && d.length <= 15 ? `+${d}` : null
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith("1")) return `+${d}`
  return null
}

export async function sendCode(env: Env, to: string) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0")
  await env.DB.prepare("INSERT OR REPLACE INTO codes (phone, hash, expires, tries) VALUES (?, ?, ?, 0)").bind(to, await hash(env, `${to}|${code}`), Date.now() + CODE_TTL).run()
  if (env.DEV_CODES === "1") return console.log(`easydoes dev code for ${to}: ${code}`)
  const r = await fetch("https://api.sendblue.com/api/send-message", {
    method: "POST",
    headers: { "sb-api-key-id": env.SENDBLUE_API_KEY, "sb-api-secret-key": env.SENDBLUE_API_SECRET, "content-type": "application/json" },
    body: JSON.stringify({ number: to, from_number: env.SENDBLUE_FROM, content: `${code} is your easydoes code. It works for 10 minutes.\n\n@easydoes.ai #${code}` }),
  })
  if (!r.ok) throw new Error(`Sendblue ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

export async function checkCode(env: Env, to: string, code: string): Promise<"ok" | "wrong" | "expired"> {
  const row = await env.DB.prepare("SELECT hash, expires, tries FROM codes WHERE phone = ?").bind(to).first<{ hash: string; expires: number; tries: number }>()
  if (!row || row.expires < Date.now() || row.tries >= 5) return "expired"
  if (row.hash !== (await hash(env, `${to}|${String(code).replace(/\D/g, "")}`))) {
    await env.DB.prepare("UPDATE codes SET tries = tries + 1 WHERE phone = ?").bind(to).run()
    return "wrong"
  }
  await env.DB.prepare("DELETE FROM codes WHERE phone = ?").bind(to).run()
  return "ok"
}

export async function startSession(env: Env, personId: string): Promise<string> {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")
  await env.DB.prepare("INSERT INTO sessions (hash, person_id, expires) VALUES (?, ?, ?)").bind(await hash(env, token), personId, Date.now() + SESSION_TTL).run()
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`
}

export async function personOf(env: Env, req: Request): Promise<string | null> {
  const token = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  if (!token) return null
  const row = await env.DB.prepare("SELECT person_id, expires FROM sessions WHERE hash = ?").bind(await hash(env, token)).first<{ person_id: string; expires: number }>()
  return row && row.expires > Date.now() ? row.person_id : null
}

export async function endSession(env: Env, req: Request) {
  const token = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE hash = ?").bind(await hash(env, token)).run()
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}
