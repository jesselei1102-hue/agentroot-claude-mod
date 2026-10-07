# Changelog

## 1.3.0-rc.1 — kernel 0.4.7 (333cd6e)

- **The HUD is drawn with the app's own components.** The band, the Review and Memory panes and the cards use the app's text, borders and buttons instead of SVG images, so they take the app's font, sizes and theme. Colour is a theme key and means one thing each: amber waits for you, red failed or is being confirmed, green saved, blue in the hot set or a skill. The band loses its black name pill and the ring; "0 waiting" is no longer shown. Sentences wrap in full in the panes. See `docs/native-ui-spec.md`.
- A long quote on a card is cut at 60 characters, so "✓ checked" stays on the line.

## 1.2.0-rc.3 — kernel 0.4.7 (333cd6e)

- The Memory and Review panes open with the keyboard. In the desktop app the first click into a pane moves the keyboard there; that redraw retires the pane's buttons, so the click's press ran nothing ("ui_press not handled" in the app's log) and every button took two clicks. rc.2's refresh after `Forget` and `Cancel` did not help and is removed.

## 1.2.0-rc.2 — kernel 0.4.7 (333cd6e)

- `Forget` and `Cancel` in the Memory pane work on the first click. The desktop app drew a write of the pane's own state one press late, so each needed two clicks; they now refresh the snapshot as `✗ Forget` and the Review pane's buttons do.

## 1.2.0-rc.1 — kernel 0.4.7 (333cd6e)

- **The Memory pane.** `Memory` on the band, or `/agentzero memory`, opens a pane of the active Facts, newest first: each with the operator's words (or "Inferred by the assistant, kept by you"), the date, and tags for the hot set and for task scope. `Forget`, then `✗ Forget` to confirm, runs the kernel's `memory forget`; a forgotten Fact stays listed, struck through, until the pane closes, and a Skill that cites it is named.
- **The assistant is told.** After a forget in the Memory pane, or a keep or reject in the Review pane, the next message carries a note to the assistant (not shown to the operator) listing what changed. The note is sent even when that message loads a fresh hot set, because the earlier hot set or a compaction summary can still hold the forgotten Fact.
- `tools/snapshot.py` adds the list of active Facts; the band's active count is its length.

## 1.1.0-rc.4 — kernel 0.4.7 (333cd6e)

- The band, the pane and the cards are in English (they were in Chinese). Text is cut and wrapped by display width, so English and Chinese both fit.

## 1.1.0-rc.3 — kernel 0.4.7 (333cd6e)

- **The memory band.** A band above the prompt shows the active Facts, the ones waiting for the operator's yes, when the hot set was last loaded (red with the reason when it failed), and how much of the context is used.
- **The review pane.** `Review` on the band, or `/agentzero review`, opens a pane of what waits; keep and reject run the kernel's `memory review --confirm/--reject`. A press that fails shows the kernel's error on that item.
- **Write cards.** Each `./a0` write (remember, propose, forget, review, link, promote, skills draft, knowledge add) and each skill use (Read tool, shell read, `skills run`) is drawn as a card. In the desktop app the cards are drawn inside the folded command group; a card for a slow write often stays hidden there (see the README's limits).
- `tools/snapshot.py` prints the memory state as JSON through the workspace's own AgentZero modules; it names a Python without PyYAML as such, and the plugin looks for another Python when the cached one fails.
- `kernel/` carries AgentZero 0.4.7 (commit 333cd6e). From 0.4.6: a Skill read through the shell now counts as loaded (AgentZero #92). From 0.4.7: a drafted Skill no longer lists another task's scripts as its own when the run's result sat directly in `work/` (AgentZero #93, found in the lab workspace).
- Verified in the lab workspace: a Skill is offered and drafted when the operator says a task recurs (#91) and after a script turns a batch of inputs into the result (#72). See `docs/verify.md`.

## 1.0.0-rc.1 — kernel 0.4.5 (c7fcd47)

First release candidate. Carries AgentZero 0.4.5 (commit c7fcd47) in `kernel/`, checked file by file against `kernel/SOURCE.json`.

- `/agentzero init`, `upgrade` and `status`, running the kernel's `adapter init`, `materialize` and `preflight` for Claude Code. `init` refuses the home folder, the filesystem root and any folder in or at a workspace.
- Loads the hot set on the first prompt, after `/compact` or `/clear`, and after six hours, with the prompt's first 200 characters as hints. If it fails, it says why and attaches nothing.
- Checks the operator's words in `memory remember --said`. Words the operator did not type in this session turn the call into `memory propose fact`, with a note to ask the operator. A `remember` the plugin cannot read runs unchanged and says so.
- `scripts/sync_kernel.py` pins a commit of AgentZero into `kernel/` and refuses denylisted terms.
