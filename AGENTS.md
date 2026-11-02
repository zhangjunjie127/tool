# Repository instructions

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, verification, formatting, and
the contribution workflow. [docs/README.md](docs/README.md) maps modules to
their code, documentation, and tests.

## Git

- Keep PRs focused on one feature, bug fix, documentation change, chore, or refactor.
- Start contribution branches from `dev` and target ordinary PRs at `dev`.
  `main` receives maintainer release PRs from `dev`.
- Never open a PR whose head branch is `dev` or `main`. The repository deletes
  head branches after merge, and deleting `dev` closes or retargets every PR
  based on it. Release and synchronization PRs use a temporary `chore/` branch
  pushed from the source branch; see
  [release preparation](docs/maintaining.md#release-preparation).
- Use `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`,
  `refactor/<short-name>`, or `docs/<short-name>` for contribution branches.
- Use Conventional Commit PR titles, for example
  `feat(editor): add marquee selection`, `fix(runtime): handle missing tween state`,
  or `docs(agents): update collaboration rules`.
- PR descriptions must say what changed, why it changed, and how it was checked.

## Changes and verification

- Match existing style and keep unrelated formatting cleanup in a separate PR.
- Update relevant documentation when public behavior or file contracts change.
- `README.md` is the source for `README.zh-CN.md`. Update both in the same PR,
  keeping sections, media, and links aligned; say so in the PR if the
  translation must follow later.
- Add new UI text to both `src/renderer/locales/en.ts` and `zh-CN.ts` in the
  same PR, and keep text sent to the agent in English. See
  [UI languages](docs/ui-languages.md).
- Use the [checks guidance](CONTRIBUTING.md#make-and-check-your-change) for the
  change type. Record skipped checks and manual validation still needed.

## Interactive Story Editing Rules

- Keep the editing hierarchy clear: chapters contain episodes, episodes contain
  scenes, and the story tree visualizes their order and branching flow. Manage
  chapter, episode, and scene structure in the Chapters tab; keep the Story Tree
  tab read-only as a story-flow view, without duplicate content editors or
  structure controls.
- Treat the story tree as the source for generating and synchronizing canvas
  nodes. Preserve independent canvas edits; only sync actual differences and
  require confirmation before overwriting edited nodes.
- Removing a scene from the story tree detaches its canvas node as an ordinary
  node and keeps the red removal marker on the canvas. New story-tree content
  creates corresponding canvas nodes and connections.
- Keep red removal warnings and detached-node lists out of the Story Tree tab.
  Recovery controls may live in the Chapters tab; canvas removal markers remain
  visible on the canvas.
- For inline chapter, episode, and scene renaming, replace the displayed name
  area with the input when editing; do not constrain the editor to the pencil
  button's narrow width.
