// The Worker's JSON API. Errors carry the server's own sentence, ready to show.
export type Person = { id: string; name: string; emoji: string; color: string; phone: string }
export type GroupRow = { id: string; name: string; emoji: string; color: string; invite: string; role: string; size: number }
export type Me = { person: Person | null; groups: GroupRow[] }

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error("You're offline. Check your connection and try again.")
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error ?? "Something went wrong. Try again."), { status: r.status })
  return j as T
}
