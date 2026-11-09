# easydoes

Your group's projects and to-dos, live, with an AI teammate. [easydoes.ai](https://easydoes.ai)

- Sign in with a text code. No passwords.
- Groups, with an invite link. Any number of projects per group, each one vertical list in sections, plus one shared to-do list.
- Live: everyone's changes, faces and where they are, as they happen. Finishing something bursts it into confetti and buzzes your phone.
- An AI agent can be a member: it reads the board and changes it over an API, and shows up live like anyone else.

## Stack

One Cloudflare Worker: the React app (Vite, Tailwind 4, Motion) as static assets, a JSON API, a Durable Object per group
holding its board (SQLite, hibernating WebSockets), and D1 for people, groups and sessions. Codes go out by text through
Sendblue.

```sh
pnpm install
cp .dev.vars.example .dev.vars   # DEV_CODES=1 logs sign-in codes instead of texting them
npx wrangler d1 execute easydoes --local --file worker/schema.sql
pnpm dev
```

`deploy.sh` is how easydoes.ai is deployed: secrets come from the macOS keychain.

## The agent API

`Authorization: Bearer $AGENT_TOKEN`

- `GET /api/agent/groups`: the groups the agent is in
- `POST /api/agent/groups` `{ name, emoji, people: [{ phone, name, emoji, color, role }] }`: a new group with the agent and those people in it
- `GET /api/agent/groups/:id/state`: the board and its members
- `POST /api/agent/groups/:id/ops` `{ ops, where }`: changes, in the same ops the browser sends (`shared/board.ts`)
- `POST /api/agent/groups/:id/join` `{ invite }`: join with a group's invite code

MIT licensed.
