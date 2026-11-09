// Sharing a link: the phone's share sheet where there is one (touch screens), else the clipboard and a toast. Every
// shared link previews as its own picture (worker/og), so the text can stay short.
import { toast } from "../components/ui"
import { buzz } from "./haptics"

export async function share(path: string, title: string, copied = "Link copied") {
  buzz()
  const url = location.origin + path
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title, url })
    else {
      await navigator.clipboard.writeText(url)
      toast(copied)
    }
  } catch {}
}
