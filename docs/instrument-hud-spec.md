Status: design approved by the operator 2026-10-15 ("yes go 1", then "yes" to the full design). This document awaits the operator's review.

# Spec: the instrument HUD (plugin 1.4)

In this document, "the operator" is the person who works with the assistant. "The HUD" is the band above the prompt, the Review and Memory panes ([native-ui-spec.md](native-ui-spec.md)).

## Problem

1.3 drew the HUD in the app's own components only. It works, but next to the mods people pick for their looks (Savvy Progress's live panel, Claude Skins' themes) it reads as a list of bordered boxes: no hierarchy, nothing seen at a glance. The operator's aim is a design at award level, not an MVP (2026-10-15).

## Goal

The Memory pane answers one question at a glance: **what does the assistant remember in this conversation, and can I trust it?** (operator, 2026-10-15: purpose A, "confirm what it remembers now").

Trust is read from four signals, all wanted (operator: "All"):

| Signal | Data |
|---|---|
| Source: the operator's own words, or the assistant's inference | `said`, `author` |
| Freshness, and whether it replaced an older version | `created_at`; the retired Fact it replaced (below) |
| In use: loaded in this conversation | in the hot set; the hot set's load time |
| Scope | `scope` (`project`, `task`) |

"When it last changed what the assistant did" is not recorded anywhere and is left out.

## Decisions (operator, 2026-10-15)

- **The desktop app first.** The terminal must work, not look its best. This allows `Svg` and `hover`.
- **Tone: an instrument panel.** Figures, gauges and status lights, dense with information.
- **Direction ①: an instrument cluster drawn as SVG on top, the list in the app's own components below.** SVG only where a drawing is needed; text, wrapping and buttons stay the app's, which keeps 1.3's fixes (type size, width, plain buttons).

## Feasibility (probe in the desktop app, 2026-10-15, Claude Code 2.1.295)

| Question | Result |
|---|---|
| Does an SVG follow light and dark? | Yes. CSS `@media (prefers-color-scheme: dark)` inside the SVG matched in both the image and the interactive (`isInteractive`) form. The `theme` setting reads `auto`, so the plugin itself cannot tell. |
| Can an SVG fill the pane's width? | Yes, with `width="100%"`. With `preserveAspectRatio="none"` the text is distorted, so the drawing is laid out at the pane's width instead: about 5.7 CSS px per column (140 columns ≈ 780 px, 34 ≈ 200 px). |
| Does `hover` reveal work in a pane? | Yes. A Box `display: "none"` with `hover: { display: "flex" }` under a keyed Box appears while the pointer is on the row. |
| Theme keys as backgrounds | They draw, but strong (dark grey, solid blue): for small chips only, never a large area. |

## Design

### Rules

- Colour in SVG: own palette, a light and a dark set switched by `prefers-color-scheme`. One meaning each, matching the theme keys used in the components: blue = loaded, amber = waits for the operator, green = kept, red = failed, grey = secondary.
- Type in SVG: `-apple-system, system-ui, sans-serif`, 12–13 px for labels and 20 px for figures, so it sits next to the app's own text.
- An SVG is laid out at `bodyColumns × 5.7` px wide (no stretching) and redrawn when the pane's width changes.
- Text in components: plain weight for content; bold only for section titles and figures; dim for secondary text.
- Buttons in panes stay `plain` (1.3: a bordered button loses the next click).

### The Memory pane

**1. The instrument cluster** (one `Svg`, `isInteractive` so the dots carry `<title>` tooltips):

```
 ◯ LOADED         ◯ YOUR WORDS       ─●──●───────●●─●┤ today      ◉ WAITING
   3 / 5            4 / 5            OLDEST 9d · NEWEST 2h          2
   at 14:02         1 inferred
```

- Ring gauge **Loaded**: Facts in the hot set / active Facts; under it the hot set's load time (`at 14:02`), or `not loaded yet`.
- Ring gauge **Your words**: Facts with the operator's words / active Facts; under it `N inferred`.
- **Timeline**: the last 30 days, today at the right; one dot per active Fact at its `created_at` (filled blue when loaded, hollow when not); a Fact older than 30 days sits on the left edge. Under it `OLDEST 9d · NEWEST 2h`. A dot's `<title>` is the Fact's sentence.
- **Waiting** light: the number of items waiting in Review; amber with a soft glow when more than 0, grey at 0.
- Narrower than 96 columns: the four instruments in a 2 × 2 grid (at 60–95 they overlapped in one row; final review, 2026-10-15).

**2. The list** (components):

```
 LOADED NOW · 3                                         loaded 14:02
 ●  Never deploy on Fridays.                 ❝ yours    2d   project
 ●  Explain where new ideas sit…             ❝ yours    1h   project  ↺
 NOT LOADED · 2
 ○  Deploys go out on Tuesdays.              ◇ inferred 7d   project
 FORGOTTEN · 1
 ✕  Use pnpm, not npm  (struck through)                       Restore
```

- Sections: `LOADED NOW · N` (with the load time at its right), `NOT LOADED · N`, `FORGOTTEN · N`; an empty section is not drawn. Newest first within each.
- A row is one line: the light (`●` blue loaded, `○` dim not loaded, `✕` dim forgotten, `!` red failed), the sentence cut at its end, then three columns aligned at the right: source (`❝ yours`, or `◇ inferred` dim), age (`2h`, `3d`, `5w`), scope (`project`, `task`); `↺` when the Fact replaced an older version.
- Narrower than 70 columns: the three columns move to a second line under the sentence.
- **Hover** on a row shows, under it: the whole sentence (when it was cut), the operator's words `“…”` (or `Inferred by the assistant, kept by you`), `Replaced “<older sentence>”` when there is one, and `Forget` at the right.
- A forgotten row: sentence struck through and dim, `Restore` always shown (not on hover). A failed forget: the error in red under the row, `Forget` shown.
- A skill that cites a forgotten Fact: the existing cited line in amber under the row.
- `+N older Facts not shown` and the other states of [memory-pane-spec.md](memory-pane-spec.md) are kept (`No Facts yet.`, `memory unreadable (fact list)`, `reading memory…`).

### The Review pane

- A smaller cluster: the **Waiting** light and a **Done** count (green when more than 0).
- Sections `WAITING FOR YOU · N` and `DONE · N`.
- A row: the light (`○` amber waiting, `✓` green kept, `✗` dim rejected, `!` red failed), the sentence, then the kind (`Fact`, `Skill`, …), its provenance and its age (a waiting item is a proposal, so it carries no source chip); `✓ Keep` and `✗ Reject` always shown at the right, since they are the pane's purpose.

### The band

```
◆ AgentZero   ● 3/5 loaded   ❝ 4/5 yours   ◉ 2 waiting   ▰▰▰▱▱▱▱▱ context 41%      [Review] [Memory]
```

- Components, as now. The figures are the cluster's: loaded, yours, waiting (amber, only when more than 0). `hot set not loaded (<reason>)` in red replaces `● 3/5 loaded` when the load failed.
- The context bar: eight cells `▰`/`▱` in blue, then `context N%` dim; from 80% both in amber, followed by ` · reloads after compaction`.

### The terminal

No `Svg`: the cluster is drawn as text gauges, `LOADED ▰▰▰▱▱ 3/5   YOURS ▰▰▰▰▱ 4/5   WAITING 2`, with no timeline. No hover: the hover lines are always shown under each row. Otherwise the same tree.

## Data

`tools/snapshot.py` adds two fields to each Fact:

- `factKey`: the Fact's `fact_key`, or `null` when none was given.
- `replaces`: the sentence of the newest **retired** Fact with the same explicit `fact_key` and an earlier `created_at`, or `null`. (A Fact without a `fact_key` replaces nothing.)

The `Fact` type in `types/index.d.ts` gains `factKey: string | null` and `replaces: string | null`. Older snapshots without them read as `null`.

## Code

| File | Change |
|---|---|
| `tools/snapshot.py` | `factKey`, `replaces` |
| `hooks/instruments.ts` (new) | pure functions from figures and Facts to SVG source: `memoryCluster`, `reviewCluster`; the light and dark palettes; `columnsToPx` |
| `hooks/view.ts` | `age` (`2h`, `3d`, `5w`), the source chip, the row columns |
| `hooks/hud-view.tsx` | the panes and band above, with the surface and `bodyColumns` as inputs |
| `hooks/feature-hud.tsx` | passes `e.surface`, `e.props.bodyColumns` and the hot set's time to the views |
| `.claude-plugin/plugin.json` | version `1.4.0-rc.1` |
| `CHANGELOG.md`, `README.md` | the new HUD; the kernel at AgentRoot 0.5.0 |

## Testing

- Unit (`instruments.test.ts`): ring arcs for 0, 1 of 5 and all; timeline positions for today, 15 days and more than 30 days; both palettes present; the 2 × 2 layout under 60 columns; a sentence with `<`, `&` and quotes escaped in `<title>`.
- Unit (`view.test.ts`): `age`; the source chip for `said` and for none.
- Engine, desktop and terminal: the sections and their counts; a row's light, sentence and columns; the hover lines and `Forget` in a `display: "none"` Box with `hover` on desktop, shown plainly on terminal; `Restore` on a forgotten row; an `Svg` on desktop and none on terminal; every pane button `plain`.
- Python (`tests/test_snapshot.py`): `factKey` and `replaces`, including a Fact with no key and a forgotten Fact that shares no key.
- By hand in the desktop app, with the operator's screenshots: wide (~140 columns) and narrow (~34) panes, light and dark; hover on a row; Forget then Restore; the band.

## Out of scope

- The cards in the transcript.
- "When it last changed what the assistant did".
- The product name in the HUD: it stays `AgentZero` while AgentRoot's README does.

## What would show this is wrong

- The cluster reads as decoration: the operator still opens the list to answer "what is loaded".
- The 5.7 px per column estimate drifts with the app's font size, and the drawing overflows or leaves a gap.
- Hover hides `Forget` so well that the operator does not find it.
