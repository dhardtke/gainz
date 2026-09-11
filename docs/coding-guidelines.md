# Coding guidelines

Dependencies are pinned to exact versions — no `^` or `~` ranges — so an install resolves the same
tree on any machine and upgrades only ever happen deliberately. `bunfig.toml` sets `install.exact`,
which keeps a later `bun add` from writing a caret range and undoing that. `engines.bun` records
the required runtime, but Bun does not enforce the field on install: it documents the requirement
rather than gating it.

TypeScript and JavaScript use single quotes, CSS double; `bun run fmt` enforces both.

Commits go directly on `main`; don't open a feature branch unless asked.
