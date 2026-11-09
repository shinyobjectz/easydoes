// Social images: satori lays out a tree of styled boxes (its standalone build, with its layout engine passed in as a
// precompiled module, since Workers can't compile wasm at run time) to SVG, and resvg turns that into a PNG.
// Type is Inter (Apple's SF can't be embedded); emoji are Twemoji (CC-BY 4.0), fetched once per isolate.
import "./location"
import { initWasm, Resvg } from "@resvg/resvg-wasm"
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm"
import satori, { init } from "satori/standalone"
import yoga from "satori/yoga.wasm"

export const W = 1200
export const H = 630

let ready: Promise<void> | undefined
const boot = () => {
  return (ready ??= Promise.all([init(yoga), initWasm(resvgWasm).catch((e) => { if (!String(e).includes("Already initialized")) throw e })]).then(() => {}))
}

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: "normal" }
let fonts: Promise<Font[]> | undefined
/** fetches one of the app's own static files by its path */
export type Get = (path: string) => Promise<Response>

// the fonts are the app's own static files (public/fonts, OFL)
const loadFonts = (get: Get) =>
  (fonts ??= Promise.all(
    ([400, 600, 800] as const).map(async (weight) => {
      const r = await get(`/fonts/inter-${weight}.woff`)
      if (!r.ok) throw new Error(`font ${weight}: ${r.status}`)
      return { name: "Inter", data: await r.arrayBuffer(), weight, style: "normal" as const }
    }),
  ).catch((e) => {
    fonts = undefined
    throw e
  }))

const emojiCache = new Map<string, Promise<string>>()
const code = (s: string) => {
  const cps = [...s].map((c) => c.codePointAt(0)!.toString(16))
  return (s.includes("‍") ? cps : cps.filter((c) => c !== "fe0f")).join("-")
}
function emoji(segment: string): Promise<string> {
  const k = code(segment)
  let p = emojiCache.get(k)
  if (!p) {
    p = fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${k}.svg`, { cf: { cacheTtl: 30 * 86400, cacheEverything: true } } as RequestInit)
      .then((r) => (r.ok ? r.text() : ""))
      .then((svg) => (svg ? `data:image/svg+xml;base64,${btoa(svg)}` : ""))
    emojiCache.set(k, p)
  }
  return p
}

/** a box: h("div", { style }, ...children) — satori's element shape, without JSX */
export type Node = { type: string; props: Record<string, unknown> }
export function h(type: string, props: Record<string, unknown> | null, ...children: (Node | string | number | false | null | undefined)[]): Node {
  const kids = children.flat().filter((c) => c !== false && c !== null && c !== undefined && c !== "")
  const p: Record<string, any> = { ...(props ?? {}) }
  // satori wants every box with more than one child to say how it lays them out; flex is the default here
  if (type === "div") p.style = { display: "flex", ...(p.style ?? {}) }
  return { type, props: { ...p, children: kids.length === 1 ? kids[0] : kids } }
}

// the app's own pictures a design names by path ("/art/..."), as data URIs, fetched once per isolate
const art = new Map<string, Promise<string>>()
async function inline(n: Node | string | number, get: Get): Promise<void> {
  if (typeof n !== "object") return
  const src = n.props.src
  if (n.type === "img" && typeof src === "string" && src.startsWith("/art/")) {
    let p = art.get(src)
    if (!p) {
      p = get(src).then(async (r) => {
        if (!r.ok) throw new Error(`${src}: ${r.status}`)
        const b = new Uint8Array(await r.arrayBuffer())
        let s = ""
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
        return `data:${r.headers.get("content-type") ?? "image/png"};base64,${btoa(s)}`
      })
      p.catch(() => art.delete(src))
      art.set(src, p)
    }
    n.props.src = await p
  }
  const kids = n.props.children
  await Promise.all((Array.isArray(kids) ? kids : [kids]).filter((k) => k && typeof k === "object").map((k) => inline(k as Node, get)))
}

export async function png(tree: Node, get: Get): Promise<Uint8Array> {
  await Promise.all([boot(), inline(tree, get)])
  const svg = await satori(tree as any, {
    width: W,
    height: H,
    fonts: await loadFonts(get),
    loadAdditionalAsset: async (kind: string, segment: string) => (kind === "emoji" ? emoji(segment) : ""),
  })
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng()
}
