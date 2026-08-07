# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label
strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label
string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Notes for this workspace

All five exist as **team-scoped labels on `Roboto studio`**, not workspace labels. `ready-for-agent` and
`ready-for-human` were already there from an earlier setup; `needs-triage`, `needs-info` and `wontfix`
were created 2026-08-07. Descriptions match the table above.

Watch out when listing them: `list_issue_labels` without a `team` argument returns workspace labels only
and will not show these. Always pass `team: "Roboto studio"`.

The `wayfinder:*` labels set a precedent for namespacing skill-owned labels. If bare names ever get
confusing next to the product labels, renaming these to `triage:needs-info` and so on is a
right-hand-column edit here plus a rename in Linear. Not worth doing pre-emptively.

**Adjacent labels that already exist and mean something else.** The team has `Needs Review`,
`Needs Clarifying`, `Blocked`, `On hold` and `Waiting on client`. `Needs Clarifying` in particular
overlaps `needs-info`. These are human-applied labels on client work; the five above are the skills'
state machine. Don't collapse them into each other, and don't apply a triage label to a client ticket
that already carries one of the human ones.

`wontfix` is a label here for compatibility with the skills, but Linear's native move for the same thing
is closing the issue as `Canceled`. Do both: apply the label and set the state.

Applying a label is not a one-line update — `save_issue` replaces the whole label set. See the label trap
section in `issue-tracker.md`.
