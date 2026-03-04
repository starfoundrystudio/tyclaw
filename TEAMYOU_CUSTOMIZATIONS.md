# TeamYou Fork Customizations

Merge checklist: when syncing upstream, review any file listed here carefully.

## Upstream files modified

| File                           | What changed                                                                         | Why                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `package.json`                 | `name`, `repository`, `homepage`, `bugs`, `author`, `publishConfig`, release scripts | Publish as `@starfoundrystudio/tyclaw` to GitHub Packages |
| `README.md`                    | Added fork sync section, release instructions, updated install section               | TeamYou-specific docs                                     |
| `src/infra/openclaw-root.ts`   | Added `@starfoundrystudio/tyclaw` to `CORE_PACKAGE_NAMES`                            | Package root resolution requires our scoped name          |
| `src/infra/update-runner.ts`   | Added `@starfoundrystudio/tyclaw` to `CORE_PACKAGE_NAMES`                            | Same — update runner uses its own copy of the set         |
| `src/cli/update-cli/shared.ts` | Added `@starfoundrystudio/tyclaw` to `CORE_PACKAGE_NAMES`                            | Same — CLI update logic uses its own copy of the set      |

## Files added (no upstream conflict)

| File                            | Purpose                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| `.github/workflows/publish.yml` | Auto-publish to GitHub Packages on `v*` tags                             |
| `scripts/release.mjs`           | Calver release script (bump, tag, push)                                  |
| `scripts/sync-teamyou-skill.ts` | Refresh vendored `skills/teamyou/` from TeamYou                          |
| `skills/teamyou/**`             | Bundled TeamYou baseline skill, vendored from `../teamyou/teamyou-skill` |
| `TEAMYOU_CUSTOMIZATIONS.md`     | This file                                                                |

## Config changes (not in git)

| File                    | What                                               |
| ----------------------- | -------------------------------------------------- |
| `.openclaw/config.json` | (future: disabled plugins, TeamYou tool allowlist) |

## Upstream sync notes

- `git rerere` is enabled — conflict resolutions are remembered automatically.
- Default release sync source is `upstream-stable`, which should advance only to upstream stable tags.
- Upstream release tags are mirrored locally as namespaced tags under `upstream/v...`; never use plain local `v...` tags as upstream references.
- `upstream-main` is optional and should be treated as an inspection-only mirror of upstream dev head.
- `package.json` will conflict on nearly every upstream sync (version bumps). Resolution is always: keep our identity fields (`name`, `repository`, `homepage`, `bugs`, `author`, `publishConfig`), take their functional changes (version, scripts, deps).
- Last synced: (not yet synced)
