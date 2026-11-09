// satori's layout engine is Emscripten code that reads self.location.href when it loads (it thinks it's in a web
// worker); Workers have no location, so it gets a stand-in. Imported before satori so it's there at load.
const g = globalThis as any
if (!g.location?.href) Object.defineProperty(g, "location", { value: { href: "https://easydoes.ai/" }, configurable: true, writable: true })
export {}
