// The signature moment: a finished card bursts into pieces of itself plus confetti in the group's colours.
// The card's real pixels come from HTML-in-canvas (a canvas with layoutsubtree draws its own child element with
// drawElementImage) where the browser has it; elsewhere the card is redrawn on a canvas from its computed style.

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

async function htmlInCanvas(el: HTMLElement, w: number, h: number, dpr: number): Promise<HTMLCanvasElement | null> {
  const probe = document.createElement("canvas").getContext("2d") as any
  if (!probe || typeof probe.drawElementImage !== "function") return null
  const c = document.createElement("canvas")
  c.setAttribute("layoutsubtree", "")
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  c.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;pointer-events:none;opacity:0;z-index:-1`
  const clone = el.cloneNode(true) as HTMLElement
  clone.style.width = `${w}px`
  clone.style.height = `${h}px`
  clone.style.margin = "0"
  clone.style.transform = "none"
  c.appendChild(clone)
  document.body.appendChild(c)
  try {
    await new Promise<void>((res) => {
      let done = false
      const fin = () => !done && ((done = true), res())
      ;(c as any).onpaint = fin
      ;(c as any).requestPaint?.()
      requestAnimationFrame(() => requestAnimationFrame(fin))
    })
    const ctx = c.getContext("2d") as any
    ctx.scale(dpr, dpr)
    ctx.drawElementImage(clone, 0, 0)
    const out = document.createElement("canvas")
    out.width = c.width
    out.height = c.height
    out.getContext("2d")!.drawImage(c, 0, 0)
    return out
  } catch {
    return null
  } finally {
    c.remove()
  }
}

function redraw(el: HTMLElement, w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  const ctx = c.getContext("2d")!
  ctx.scale(dpr, dpr)
  const cs = getComputedStyle(el)
  ctx.fillStyle = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : "#fff"
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, parseFloat(cs.borderTopLeftRadius) || 18)
  ctx.fill()
  ctx.fillStyle = cs.color
  ctx.font = `600 16px ${cs.fontFamily}`
  const text = (el.querySelector("[data-title]")?.textContent ?? el.textContent ?? "").trim()
  const emoji = el.querySelector("[data-emoji]")?.textContent ?? ""
  ctx.fillText(`${emoji ? emoji + "  " : ""}${text}`.slice(0, 40), 16, Math.min(h - 14, 34), w - 32)
  return c
}

type Bit = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; sx?: number; sy?: number; color?: string }

export async function burst(el: HTMLElement, colors: string[]) {
  if (reduced()) return
  const rect = el.getBoundingClientRect()
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const img = (await htmlInCanvas(el, rect.width, rect.height, dpr)) ?? redraw(el, rect.width, rect.height, dpr)
  const c = document.createElement("canvas")
  c.width = innerWidth * dpr
  c.height = innerHeight * dpr
  c.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:90"
  document.body.appendChild(c)
  const ctx = c.getContext("2d")!
  ctx.scale(dpr, dpr)

  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const bits: Bit[] = []
  const tile = Math.max(12, Math.min(22, rect.width / 14))
  for (let y = 0; y < rect.height; y += tile)
    for (let x = 0; x < rect.width; x += tile) {
      const px = rect.left + x + tile / 2
      const py = rect.top + y + tile / 2
      const a = Math.atan2(py - cy, px - cx)
      const s = 2 + Math.random() * 5
      bits.push({ x: px, y: py, vx: Math.cos(a) * s + (Math.random() - 0.5) * 2, vy: Math.sin(a) * s - 3 - Math.random() * 4, r: 0, vr: (Math.random() - 0.5) * 0.4, w: tile, h: tile, sx: x, sy: y })
    }
  const palette = colors.length ? colors : ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2"]
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2
    const s = 4 + Math.random() * 9
    bits.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, color: palette[i % palette.length] })
  }

  const start = performance.now()
  const LIFE = 1300
  await new Promise<void>((res) => {
    const frame = (t: number) => {
      const k = (t - start) / LIFE
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      for (const b of bits) {
        b.vy += 0.38
        b.vx *= 0.985
        b.x += b.vx
        b.y += b.vy
        b.r += b.vr
        ctx.save()
        ctx.globalAlpha = Math.max(0, 1 - k * k)
        ctx.translate(b.x, b.y)
        ctx.rotate(b.r)
        if (b.color) {
          ctx.fillStyle = b.color
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
        } else {
          const sc = 1 - k * 0.5
          ctx.drawImage(img, b.sx! * dpr, b.sy! * dpr, b.w * dpr, b.h * dpr, (-b.w / 2) * sc, (-b.h / 2) * sc, b.w * sc, b.h * sc)
        }
        ctx.restore()
      }
      if (k < 1) requestAnimationFrame(frame)
      else res()
    }
    requestAnimationFrame(frame)
  })
  c.remove()
}

/** confetti alone, from a point (someone else finished something, or a to-do checked) */
export function sprinkle(x: number, y: number, colors: string[], n = 28) {
  if (reduced()) return
  const span = document.createElement("div")
  span.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;z-index:90`
  document.body.appendChild(span)
  const palette = colors.length ? colors : ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f"]
  const anims: Animation[] = []
  for (let i = 0; i < n; i++) {
    const d = document.createElement("i")
    const w = 5 + Math.random() * 5
    d.style.cssText = `position:absolute;width:${w}px;height:${w * 0.55}px;border-radius:1px;background:${palette[i % palette.length]}`
    span.appendChild(d)
    const a = Math.random() * Math.PI * 2
    const s = 40 + Math.random() * 70
    anims.push(
      d.animate(
        [
          { transform: "translate(0,0) rotate(0)", opacity: 1 },
          { transform: `translate(${Math.cos(a) * s}px, ${Math.sin(a) * s - 30}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${Math.cos(a) * s * 1.2}px, ${Math.sin(a) * s + 60}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
        ],
        { duration: 900 + Math.random() * 300, easing: "cubic-bezier(.2,.7,.3,1)" },
      ),
    )
  }
  Promise.all(anims.map((x) => x.finished)).finally(() => span.remove())
}
