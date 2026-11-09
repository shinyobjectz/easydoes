import type { Group } from "./group"

export interface Env {
  DB: D1Database
  GROUP: DurableObjectNamespace<Group>
  ASSETS: Fetcher
  CODE_LIMIT: RateLimit
  SENDBLUE_FROM: string
  ORIGIN: string
  // secrets
  SENDBLUE_API_KEY: string
  SENDBLUE_API_SECRET: string
  SESSION_PEPPER: string
  AGENT_TOKEN: string // raea admin agent's bearer for /api/agent/*
  NOTIFY_URL?: string // where board events go for texting (raea admin's /hooks/board)
  NOTIFY_SECRET?: string
  DEV_CODES?: string // "1" in local dev: codes are logged instead of texted
}
