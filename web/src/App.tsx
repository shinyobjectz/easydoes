// easydoes: who you are decides the screen. Signed out: sign in (or an invite's sign-in). New: your name and face,
// then a first group. Otherwise your group's live board at /g/:id (/p/:project or /todos).
import { useEffect, useState } from "react"
import { Loader, Toasts } from "./components/ui"
import { api, type Me } from "./lib/api"
import { go, Redirect, usePath } from "./lib/route"
import { GroupScreen } from "./screens/Group"
import { Join, NewGroup, Profile, SignIn } from "./screens/Welcome"

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const path = usePath()
  useEffect(() => {
    api<Me>("/me").then(setMe, () => setMe(null))
  }, [])
  return (
    <>
      <Screen me={me} setMe={setMe} path={path} editing={editing} setEditing={setEditing} />
      <Toasts />
    </>
  )
}

function Screen({ me, setMe, path, editing, setEditing }: { me: Me | null | undefined; setMe: (m: Me) => void; path: string; editing: boolean; setEditing: (v: boolean) => void }) {
  if (me === undefined)
    return <Loader />
  const join = path.match(/^\/j\/(\w+)/)?.[1]
  if (!me) return <SignIn invite={join} onIn={setMe} />
  if (!me.person?.name || editing) return <Profile me={me} onDone={(m) => (setMe(m), setEditing(false))} onCancel={me.person?.name ? () => setEditing(false) : undefined} />
  if (join) return <Join code={join} onJoined={(m, id) => (setMe(m), go(`/g/${id}`, true))} onCancel={() => go("/", true)} />
  if (path === "/new" || !me.groups.length) return <NewGroup me={me} onMade={(m, id) => (setMe(m), go(`/g/${id}`, true))} onCancel={me.groups.length ? () => history.back() : undefined} />
  const g = path.match(/^\/g\/([\w-]+)(?:\/(todos|p\/[\w-]+))?/)
  const group = g && me.groups.find((x) => x.id === g[1])
  if (!group) return <Redirect to={`/g/${me.groups[0].id}`} />
  return <GroupScreen key={group.id} me={me} group={group} sub={g![2]} onProfile={() => setEditing(true)} />
}
