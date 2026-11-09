// A tiny router: the path is state, go() pushes (or replaces) it.
import { useEffect, useSyncExternalStore } from "react"

const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
addEventListener("popstate", emit)

export function go(path: string, replace = false) {
  if (path === location.pathname + location.search) return
  history[replace ? "replaceState" : "pushState"](null, "", path)
  emit()
}

export const usePath = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => location.pathname,
  )

export function Redirect({ to }: { to: string }) {
  useEffect(() => go(to, true), [to])
  return null
}

export function useMedia(q: string) {
  return useSyncExternalStore(
    (f) => {
      const m = matchMedia(q)
      m.addEventListener("change", f)
      return () => m.removeEventListener("change", f)
    },
    () => matchMedia(q).matches,
  )
}
