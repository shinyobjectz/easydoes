# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Recommended and accepted (2026-11-09): Vite + React + TypeScript + Tailwind + shadcn-style components + Motion for
the web app; one Cloudflare Worker on easydoes.ai serving the app and its API; a Durable Object per group for the live
board (WebSockets: presence, edits, drags); D1 for people, groups, invites and sessions. Sign-in by text message code.

## Users

Any group of people who need to get things done together: friends, families, clubs, teams, a startup's crew. They
are mostly on their phones, often between other things, and not all of them are "project management" people. The
first group is raea's team with raea's admin agent working beside them.

## Product Purpose

A group's shared place for what needs doing: you sign in with your phone number, join a group from an invite, and
everyone sees the same projects (boards of cards) and one todo list, changing live as people work. Success is a
group that actually uses it every day because adding, moving and finishing things is quicker than texting about them.

## Positioning

The group's AI agent is a member, not a sidebar: it has an avatar on the board, is seen working live like anyone else,
and can be asked by text to add, move and finish things. Phone-number sign-in and invite links mean nobody needs an
account, an email or a workspace setup to join.

## Operating Context

- Joining happens from a link sent in a group chat or text; first use is on a phone.
- The raea admin agent (raea-admin, a Cloudflare Worker) texts the group's people from its own number and reads and
  edits their board; sign-in codes come from the same number.
- Several people may have the same board open at once.

## Capabilities and Constraints

- Sign in: phone number + six-digit code by text (Sendblue). No passwords, no email required.
- Groups: create, invite by link or code, join; members have a name, an avatar (emoji on a colour) and a role.
- Projects: many per group; each is a board with columns and cards. Cards have a title, notes, assignees, an emoji,
  due date, checklist todos and reactions.
- Todo list: one per group, gathering every open card and checklist item, plus quick standalone todos.
- Live: presence (who's here, what they're looking at), edits and moves appear for everyone instantly; works offline
  for a moment and reconciles.
- Agents: an agent member acts through an API key on the group; its edits are shown as its own.
- The repository is public: no phone numbers, keys or any group's data in it.
- Undecided: pricing, product name beyond "easydoes", notifications beyond the agent's texts.

## Brand Commitments

Name: easydoes (lowercase). Domain: easydoes.ai.

## Evidence on Hand

None yet: no users, testimonials or metrics. Nothing may be invented.

## Product Principles

1. Faster than a text: the common actions (add, move, finish) take one or two taps.
2. Live by default: nobody refreshes; you see people and changes as they happen.
3. Everyone's welcome: no accounts, jargon or setup between an invite and the board.
4. The agent is a teammate: its work is visible, attributable and undoable like anyone's.
5. Phone first, never phone only.

## Accessibility & Inclusion

WCAG 2.2 AA. Every drag has a tap or keyboard alternative; colour is never the only signal (avatars carry emoji and
initials); reduced motion respected.
