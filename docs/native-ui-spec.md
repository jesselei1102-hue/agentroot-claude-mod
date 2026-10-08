Status: approved by the operator 2026-10-08 ("都用A"; "写设计说明吧。写完之后直接改").

# Spec: the HUD in the app's own components (plugin 1.3)

In this document, "the operator" is the person who works with the assistant. "The HUD" is what [hud-spec.md](hud-spec.md) and [memory-pane-spec.md](memory-pane-spec.md) added: the band above the prompt, the Review and Memory panes, and the cards in the transcript.

## Problem

The HUD draws itself as SVG images with colours and a font chosen by the plugin. In the desktop app (operator's screenshot, 2026-10-08):

- Two type sizes sit side by side: the SVG text is drawn smaller than the app's own buttons under it.
- Cards are a fixed 360 px wide and cut sentences ("…language t…") in a wider pane.
- The pane repeats itself: "AgentZero · Memory", then "Your memory"; "in hot set" in the header and on the card.
- The band's loudest element is a black "AgentZero" pill that says nothing; five pills in four colours look like buttons but are not.
- The colours are fixed for a light theme.

## Goal

The HUD looks like part of Claude Code: the app's font, sizes and theme, colour only where it means something.

## Decision (operator, 2026-10-08)

Option A of the two mockups, for the band, both panes and the cards: the app's own `Box`, `Text` and `Button` elements; no SVG.

## Design

### Rules

- Elements: `Box`, `Text`, `Button` and `Code` only. No `Svg`.
- Colours are the app's theme keys, never raw values, so light and dark themes both work. One meaning each:

| Theme key | Meaning |
|---|---|
| `warning` | waits for the operator; context at 80% or more |
| `error` | failed; a forget being confirmed |
| `success` | saved, kept |
| `suggestion` | in the hot set; a skill used |
| `dimColor` (no key) | secondary text: dates, words, provenance |

- Plain weight for content. Bold only for the one label that names a thing (the band's name, a card's label).
- Wrapping and cutting are the app's (`Text` `wrap`), not the plugin's: no width estimates.
- One tree for every surface. The terminal and the desktop draw the same elements; the only surface branch left is the terminal's expanded `ToolGroup`.

### The band

One row:

```
AgentZero  2 active · 1 waiting · hot set 3 h ago · context 41%            [Review] [Memory]
```

- `AgentZero` bold, then the parts joined by a dim ` · `.
- `N active` plain. `N waiting` in `warning`, shown only when N > 0. `memory unreadable` / `reading memory…` dim in place of both when there is no snapshot.
- `hot set <relative>` dim; `hot set not loaded (<reason>)` in `error`; `hot set not loaded yet` dim.
- `context N%` dim; from 80% in `warning`, followed by ` · reloads after compaction`. No ring.
- Right-aligned: `Review` (shown when items wait, `variant: primary`) and `Memory` (shown when a snapshot was read).

### The Review pane

- A dim summary line: `N waiting · M done`.
- One row per item: a `Box` with a round, dim border, padding 1 across, laid out as a row:
  - left, growing: the kind (`Fact`, `Episode`, …) dim, then the sentence, wrapping; under it a dim line `<provenance> · <date>`; a kept item adds `✓ Kept` in `success`, a rejected one strikes the sentence through and adds `✗ Rejected` dim, a failed one adds the error in `error`;
  - right: `Keep` and `Reject` buttons while the item can be decided.
- Empty: `Nothing is waiting for you ✓` in `success`.

### The Memory pane

- A dim summary line: `N active · N in hot set`, then ` · N forgotten` when any.
- One row per Fact, the same box as the Review pane:
  - left: the sentence, wrapping; under it a dim line: `“<said>”` or `Inferred by the assistant, kept by you`, then ` · <date>`, then ` · in hot set` in `suggestion`, then ` · task` for a task-scoped Fact;
  - confirming: `Forget this Fact?` in `error` with the buttons `Forget` and `Cancel`;
  - forgotten: the sentence dim and struck through, `forgotten` dim; no button;
  - failed: the error in `error`; `Forget` again;
  - cited by a skill: the existing cited line in `warning`;
  - right: `Forget` while the row is actionable.
- The states and copy of [memory-pane-spec.md](memory-pane-spec.md) otherwise hold (`No Facts yet.`, `memory unreadable (fact list)`, `+N older Facts not shown`).

Dates are `Mon D` (`Oct 6`), read from the date part of `createdAt`, so the time zone never moves the day.

### Cards

- Line 1: the icon and label in the card's theme key, bold (`📌 Remembered`), then the title plain.
- Line 2, when there is a detail: the detail, dim, cut by the app at its end. The quote in `Your words: “…” ✓ checked` is cut first at 60 characters, so the app's cut never takes `✓ checked` (amended during implementation: the plugin no longer estimates widths, but counts characters here).
- An unchecked card (the old grey outline) is told by its detail, `Quote not checked`; nothing else marks it.
- `Raw command` / `Hide` as before. A folded group draws the same two lines per card, then `+N other commands`.

Card tones map to theme keys: green → `success`, amber → `warning`, blue → `suggestion`, grey → dim.

### Code

- `hooks/svg.ts` and its tests are removed, with the width estimate (`textWidth`, `cutToWidth`, `wrap`).
- `hooks/band.ts`: the model's pills lose `AgentZero` and `0 waiting`.
- A small pure module, `hooks/view.ts`, holds the theme mapping and the text of the meta lines and dates, unit-tested.
- Engine tests find text and keys, not SVG sources.
- Version `1.3.0-rc.1`.

## Testing

- Unit: `view.ts` (theme keys per tone, `Oct 6` from an ISO date and from a date in another zone, the Fact and Review meta lines); `band.ts` (the new pills).
- Engine, desktop and terminal: the band's text and buttons; each pane's rows, summary, states and buttons; a card's two lines; a folded group; no `Svg` drawn anywhere.
- By hand in the lab, light and dark theme: the band, both panes and a card look like the app's own; theme keys draw in colour on the desktop. If the desktop ignores theme keys, fall back to raw colours chosen per theme.

## Out of scope

- Markdown for a larger title in cards (possible later: the app's Markdown has headings).
- Hover styles.

## What would show this is wrong

- The panes feel bare without the coloured chips, and the operator misses at a glance what is in the hot set.
- The desktop draws theme keys as plain text colour: then the colours need raw values per theme.

## Amendment (2026-10-08, lab)

Rows are one column, not a row with the buttons on the right: in the desktop app a long line made the row wider than the pane and pushed `Forget` out of sight. A Fact's box reads, top to bottom: the sentence; its words (or `Inferred by the assistant, kept by you`); `Oct 6 · in hot set · task`; then its state lines and buttons. A Review item: the sentence; `<Kind> · <provenance> · <date>`; state; `Keep` `Reject`. The app's theme keys draw in colour on the desktop (`in hot set` in blue, seen).

Buttons in the panes are `plain` (text buttons): a bordered button takes the keyboard on a click, and after the redraw that removes it the next click into the pane is lost (lab, 2026-10-08; see CHANGELOG 1.3.0-rc.3). The band keeps bordered buttons.

Known fault (2026-10-08, desktop app, Claude Code 2.1.289): in a pane, every press after the first takes two clicks. The app's log reads `ui_press not handled` for the first click of each: the engine has redrawn the pane since the drawing the app holds, a redraw retires every Button handle, and a Button (unlike an Input or a Select) is not re-resolved by its key. Tried and not the cause: focus on open, plain buttons, a drawing that always differs. Reported upstream; the panes keep plain buttons and need as few presses as possible.
