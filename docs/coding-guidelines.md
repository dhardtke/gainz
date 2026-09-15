# Coding guidelines

Dependencies are pinned to exact versions — no `^` or `~` ranges — so an install resolves the same
tree on any machine and upgrades only ever happen deliberately. `bunfig.toml` sets `install.exact`,
which keeps a later `bun add` from writing a caret range and undoing that. `engines.bun` records
the required runtime, but Bun does not enforce the field on install: it documents the requirement
rather than gating it.

TypeScript and JavaScript use single quotes, CSS double; `bun run fmt` enforces both.

A member that overrides one from its base class is marked `override`. `noImplicitOverride` makes
`bun run typecheck` enforce it both ways, so a renamed or misspelled `GzElement` hook fails the
check instead of silently never running.

Private class members use `#` names, never TypeScript's `private` modifier. A `#` name is private
at runtime as well as to the compiler, and it cannot collide with a member a class inherits — which
matters for components, whose base is `HTMLElement`. Since a `#` name cannot be a parameter
property, `bun run lint` bans parameter properties altogether (`typescript/parameter-properties`);
a `private` method or field in a class body is not caught by any rule.

Code carries no comments unless one records something the code cannot: a non-obvious constraint, an
external quirk, a reason a surprising choice is deliberate. Never a restatement of what the next
lines do — if that is what a comment would say, the fix is a clearer name or a smaller function.
Explanation of why the code is the way it is belongs in these documents and in commit messages.

Commits go directly on `main`; don't open a feature branch unless asked.
