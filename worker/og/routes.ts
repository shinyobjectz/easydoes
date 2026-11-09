// Link previews. Every easydoes link that's shared (an invite, a project, a card, the to-do list, the site) gets its own
// title, description and social image: the page's HTML is the app's index.html with those tags put in its <head>, and
// the image is drawn for that exact thing at /og/<the same path>.png. A preview shows what the link points to, to
// whoever holds the link (group ids are unguessable; the board itself still needs signing in).
import type { Board } from "../../shared/board"
import type { Env } from "../env"
import { cardImage, dueText, homeImage, inviteImage, listImage, type Face } from "./designs"
import { png, type Node } from "./render"

type Preview = { title: string; description: string; version: string; image: () => Node | Promise<Node> }

const SITE: Preview = {
  title: "easydoes",
  description: "Your group's projects and to-dos, live, with an AI teammate. Sign in with your phone.",
  version: "1",
  image: homeImage,
}

async function groupOf(env: Env, id: string) {
  const g = await env.DB.prepare("SELECT id, name, emoji, color FROM groups WHERE id = ?").bind(id).first<{ id: string; name: string; emoji: string; color: string }>()
  if (!g) return null
  const m = await env.DB.prepare("SELECT p.id, p.name, p.emoji, p.color FROM members m JOIN people p ON p.id = m.person_id WHERE m.group_id = ? ORDER BY m.joined_at").bind(id).all<{ id: string; name: string; emoji: string; color: string }>()
  return { ...g, members: m.results }
}

const faceOf = (m: { name: string; emoji: string; color: string }): Face => ({ name: m.name, emoji: m.emoji, color: m.color })

async function resolve(env: Env, path: string, q: URLSearchParams): Promise<Preview | null> {
  if (path === "/" || path === "") return SITE

  const inv = path.match(/^\/j\/(\w+)$/)
  if (inv) {
    const row = await env.DB.prepare("SELECT id FROM groups WHERE invite = ?").bind(inv[1]).first<{ id: string }>()
    const g = row && (await groupOf(env, row.id))
    if (!g) return null
    const n = g.members.length
    return {
      title: `Join ${g.emoji} ${g.name} on easydoes`,
      description: `${n} ${n === 1 ? "person is" : "people are"} on its board. Sign in with your phone to join.`,
      version: `${g.name}|${g.emoji}|${n}`,
      image: () => inviteImage({ color: g.color, name: g.name, emoji: g.emoji, people: g.members.map(faceOf) }),
    }
  }

  const gm = path.match(/^\/g\/([\w-]+)(?:\/(todos|p\/([\w-]+)))?$/)
  if (!gm) return null
  const g = await groupOf(env, gm[1])
  if (!g) return null
  const { board } = (await env.GROUP.get(env.GROUP.idFromName(g.id)).snapshot()) as { board: Board }
  const people = g.members.map(faceOf)
  const who = (id: string) => g.members.find((m) => m.id === id)

  // a card
  const cid = q.get("c")
  const card = cid ? board.cards[cid] : undefined
  if (card) {
    const p = board.projects[card.projectId]
    const col = board.columns[card.columnId]
    const due = dueText(card.due)
    const assignees = card.assignees.map(who).filter(Boolean).map((m) => faceOf(m!))
    return {
      title: `${card.emoji ? card.emoji + " " : ""}${card.title || "Untitled"}`,
      description: [card.done ? "Done" : col?.name, p && `${p.emoji} ${p.name}`, due && !card.done && `due ${due.text}`, assignees.length && `for ${assignees.map((a) => a.name.split(" ")[0]).join(", ")}`, g.name].filter(Boolean).join(" · "),
      version: String(card.editedAt),
      image: () =>
        cardImage({
          color: g.color,
          group: g.name,
          people,
          emoji: card.emoji,
          title: card.title,
          project: p?.name ?? "",
          projectEmoji: p?.emoji ?? "",
          section: col?.name ?? "",
          due: card.due,
          done: card.done,
          checks: [card.checklist.filter((x) => x.done).length, card.checklist.length],
          assignees,
        }),
    }
  }

  // the to-do list
  if (gm[2] === "todos") {
    const all = Object.values(board.todos)
    const open = all.filter((t) => !t.done).sort((a, b) => a.pos - b.pos)
    return {
      title: `To-dos · ${g.emoji} ${g.name}`,
      description: open.length ? `${open.length} to go: ${open.slice(0, 3).map((t) => t.text).join(", ")}${open.length > 3 ? "…" : ""}` : "All clear.",
      version: `${all.length}|${open.length}|${Math.max(0, ...all.map((t) => t.at))}|${open.slice(0, 4).map((t) => t.id).join(",")}`,
      image: () => listImage({ color: g.color, group: g.name, people, emoji: "☑️", name: "To-dos", open: open.length, done: all.length - open.length, items: open.map((t) => ({ title: t.text, who: who(t.assignee) && faceOf(who(t.assignee)!) })) }),
    }
  }

  // a project (the group's first when none is named)
  const projects = Object.values(board.projects).sort((a, b) => a.pos - b.pos)
  const p = gm[3] ? board.projects[gm[3]] : projects[0]
  if (!p) return { ...SITE, title: `${g.emoji} ${g.name} on easydoes` }
  const cards = Object.values(board.cards).filter((c) => c.projectId === p.id)
  const cols = Object.values(board.columns).filter((c) => c.projectId === p.id).sort((a, b) => a.pos - b.pos)
  const order = new Map(cols.map((c, i) => [c.id, i]))
  const open = cards.filter((c) => !c.done).sort((a, b) => (order.get(a.columnId) ?? 0) - (order.get(b.columnId) ?? 0) || a.pos - b.pos)
  return {
    title: `${p.emoji} ${p.name}`,
    description: `${open.length} to go, ${cards.length - open.length} done · ${g.name}`,
    version: `${p.name}|${p.emoji}|${cards.length}|${open.length}|${Math.max(0, ...cards.map((c) => c.editedAt))}`,
    image: () => listImage({ color: g.color, group: g.name, people, emoji: p.emoji, name: p.name, open: open.length, done: cards.length - open.length, items: open.map((c) => ({ title: `${c.emoji ? c.emoji + " " : ""}${c.title}`, who: c.assignees[0] && who(c.assignees[0]) ? faceOf(who(c.assignees[0])!) : undefined })) }),
  }
}

const hash = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s)))].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("")
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/** GET /og/<path>.png: the image, cached at the edge by its version */
export async function ogImage(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url)
  const cache = caches.default
  const hit = await cache.match(req)
  if (hit) return hit
  const path = url.pathname.slice(3).replace(/\.png$/, "").replace(/\/index$/, "/")
  const p = (await resolve(env, path, url.searchParams).catch(() => null)) ?? SITE
  const body = await png(await p.image(), (path) => (env.ASSETS ? env.ASSETS.fetch(new URL(path, url)) : fetch(new URL(path, url))))
  const res = new Response(body, { headers: { "content-type": "image/png", "cache-control": url.searchParams.get("v") ? "public, max-age=604800, immutable" : "public, max-age=300" } })
  ctx.waitUntil(cache.put(req, res.clone()))
  return res
}

/** an app page, with its preview tags */
export async function page(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url)
  // the app's shell: "/" from the assets (asking for /index.html gets a redirect to "/"); in Vite dev there is no ASSETS
  // binding, and any path the worker doesn't take gets the dev server's index.html
  const html = env.ASSETS ? await env.ASSETS.fetch(new Request(new URL("/", url))) : await fetch(new URL("/__shell", url))
  const p = (await resolve(env, url.pathname, url.searchParams).catch((e) => (console.error("easydoes: preview", e), null))) ?? SITE
  const q = new URLSearchParams()
  if (url.searchParams.get("c")) q.set("c", url.searchParams.get("c")!)
  q.set("v", await hash(p.version))
  const image = `${env.ORIGIN}/og${url.pathname === "/" ? "/index" : url.pathname}.png?${q}`
  // a crawler asks for the page, then its picture: start drawing the picture now, so it's in the cache by then
  if (env.ASSETS) ctx.waitUntil(ogImage(new Request(image), env, ctx).catch(() => {}))
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="easydoes">`,
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    `<meta property="og:url" content="${esc(env.ORIGIN + url.pathname + url.search)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(p.title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(p.title)}">`,
    `<meta name="twitter:description" content="${esc(p.description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
  ].join("")
  return new HTMLRewriter()
    .on("title", { element: (e) => void e.setInnerContent(p.title === "easydoes" ? "easydoes" : `${p.title} · easydoes`) })
    .on('meta[name="description"]', { element: (e) => void e.setAttribute("content", p.description) })
    .on("head", { element: (e) => void e.append(tags, { html: true }) })
    .transform(new Response(await html.text(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }))
}
