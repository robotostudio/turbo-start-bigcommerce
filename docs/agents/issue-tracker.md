# Issue tracker: Linear

Issues and specs for this repo live in Linear, in the **Roboto studio** team, under the
**Turbo Start BigCommerce** project. This matches the sibling starters: `Turbo Start Shopify` and
`Turbo Start Sanity` are already Linear projects on the same team.

- Workspace: https://linear.app/roboto
- Project: https://linear.app/roboto/project/turbo-start-bigcommerce-722a1acc2da0
- Team key `ROB`, so issue identifiers look like `ROB-2526`.
- The spec is [ROB-2526](https://linear.app/roboto/issue/ROB-2526).
- Its 28 build tickets are `ROB-2527` to `ROB-2554`, filed as sub-issues of it with native `blockedBy`
  relations. Ticket titles are number-prefixed (`01 — …`) so dependency order reads off the board.

All operations go through the Linear MCP tools (`mcp__claude_ai_Linear__*`). There is no CLI. If the
tools are deferred in your session, load them in one `ToolSearch` call before starting — a comma
separated `select:` query, not one call per tool.

## Where things go

| Thing | Where |
| --- | --- |
| Team | `Roboto studio` |
| Project | `Turbo Start BigCommerce` |
| Default status on create | `Backlog` for unscoped work, `Todo` once it is specced |

Always pass both `team` and `project`. An issue created without a project lands in the team's general
backlog and is effectively lost among the client work.

## Conventions

**Create an issue** — `save_issue` with no `id`:

```
save_issue({
  team: "Roboto studio",
  project: "Turbo Start BigCommerce",
  title: "...",
  description: "...",   // Markdown, literal newlines, no escape sequences
  labels: ["ready-for-agent"],
  state: "Todo",
})
```

**Update an issue** — the same tool with `id` set to the identifier (e.g. `ROB-123`). For a small edit
to a long description, prefer the `patch` array over resending the whole body; each anchor must match
exactly once and the whole patch is atomic.

**Read an issue** — `get_issue({ id: "ROB-123", includeRelations: true })`. Comments come from
`list_comments`.

**List issues** — `list_issues({ team: "Roboto studio", project: "Turbo Start BigCommerce", state: "Todo", includeArchived: false, fields: ["title", "status", "labels", "url", "parentId"] })`.

Two things to get right here. `includeArchived` **defaults to true**, so pass `false` explicitly or
archived issues pollute every query. And `fields` controls payload size — ask for what you need rather
than taking the default response.

**Comment** — `save_comment({ issueId: "ROB-123", body: "..." })`. Reply to a thread with `parentId`
instead of `issueId`.

**Close** — `save_issue({ id: "ROB-123", state: "Done" })`, or `state: "Canceled"` for work that will
not be actioned.

## The label trap

`save_issue`'s `labels` parameter **replaces the entire label set**. Labels not included are removed.

So "apply the `ready-for-agent` label" is never a one-liner. Read the issue's current labels first, then
write the union:

```
const issue = await get_issue({ id: "ROB-123" })
await save_issue({ id: "ROB-123", labels: [...currentLabelNames, "ready-for-agent"] })
```

Omitting `labels` entirely leaves them unchanged, which is what you want on any update that is not
about labels.

## Statuses on the Roboto studio team

`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`.

`state` accepts the name, the type, or the ID. Use the name.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Linear does not hold PRs, and the GitHub repo does not exist yet. Once
`robotostudio/turbo-start-bigcommerce` is public, external contributions will arrive as GitHub issues
and PRs rather than Linear issues, and that is a second surface this file does not cover. Revisit at
that point: the likely answer is GitHub for public traffic, Linear for the build.

## When a skill says "publish to the issue tracker"

Create a Linear issue on the `Roboto studio` team, in the `Turbo Start BigCommerce` project.

## When a skill says "fetch the relevant ticket"

`get_issue({ id, includeRelations: true })`, plus `list_comments` if the discussion matters.

## Wayfinding operations

Used by `/wayfinder`. The **map** is one issue; tickets are its sub-issues. The `wayfinder:*` labels
already exist in this workspace, so use them as they are — do not create new ones.

- **Map** — an issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket** — `save_issue` with `parentId` set to the map's identifier, labelled
  `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`. Assign it to
  the driving dev once claimed.
- **Blocking** — Linear has native relations. `save_issue({ id, blockedBy: ["ROB-45"] })`. These are
  append-only; remove with `removeBlockedBy`. This is the canonical, UI-visible representation, so do
  not fall back to a "Blocked by:" line in the body.
- **Frontier query** — `list_issues({ parentId: "<map>", state: "Todo", includeArchived: false, fields: ["title", "status", "assignee", "labels"] })`, then drop anything with an open blocker (fetch with
  `get_issue({ includeRelations: true })`) or an existing assignee. First in map order wins.
- **Claim** — `save_issue({ id, assignee: "me", state: "In Progress" })`.
- **Resolve** — comment the answer, set `state: "Done"`, then append a context pointer to the map's
  Decisions-so-far with a `patch` operation.
