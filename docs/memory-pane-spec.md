Status: written 2026-10-08 from the operator's answers of 2026-10-07; waiting for the operator's review.

# Spec: the Memory pane (plugin 1.2, sub-project D)

In this document, "the operator" is the person who works with the assistant. "The Review pane", "the band" and "the snapshot" are those of [the memory HUD](hud-spec.md) (sub-project A).

## Problem

The HUD shows how many Facts are active, but not which ones. To see what the assistant will apply, why each Fact was recorded, or to remove one that is wrong or out of date, the operator must ask the assistant to run commands. A wrong Fact stays active because removing it takes effort.

There is a second gap, in the Review pane of 1.1. When the operator keeps or rejects an item there, the assistant is not told. Its hot set was loaded earlier, so it acts on the old memory until the next load (a new conversation, a compaction, or six hours).

## Goals

- The operator sees every active Fact, with the words it was recorded from, without a terminal.
- The operator removes a wrong Fact with two clicks.
- The assistant learns about every change the operator makes in a pane, on the next message.

Order of priority, as for A: the operator's own daily use first; the demo effect also matters.

## Scope

Sub-project D was "memory graph pane" (idea 4 of the 2026-10-05 brainstorm). The lab workspace's `graph.yaml` is empty, and the kernel builds a graph only when the operator asks for one, so a graph pane would be empty in daily use. The SVG in a pane cannot be clicked either. D is therefore reshaped into a pane that lists Facts.

## Decisions (operator, 2026-10-07)

| Question | Answer |
|---|---|
| What the pane is for | B: look and clean up. No editing: an edit is a forget plus a new `remember` |
| What it lists | A: active Facts only. Skills are seen with other panes or commands. No graph |
| Where it lives | A: its own pane, "AgentZero · Memory", next to the Review pane |
| How a forget works | A: two clicks: "Forget", then "✗ Forget" to confirm |
| Order | A: one list, newest first; Facts in the hot set carry an "in hot set" tag |
| Telling the assistant | A: on the next message, for both panes |
| Where the list comes from | Option 1: the existing snapshot gets a `facts` list |
| Look | The mockup of 2026-10-07: the Review pane's style, one card per Fact |

## Design

### The snapshot gets `facts`

`tools/snapshot.py` adds one field. Each entry is an active Fact (status `active`), newest first by `created_at`:

```json
{
  "schema": 1,
  "active": 4,
  "pending": [],
  "hotSet": { "at": "2026-10-06T10:38:00+08:00", "factIds": ["reply-language-20261006-101711"] },
  "facts": [
    { "id": "fact:reply-language-20261006-101711",
      "sentence": "In this project, always reply in English, regardless of the language the operator writes in.",
      "said": "记得这个项目无论我讲什么你都用英文回复",
      "author": "human", "createdAt": "2026-10-06T10:17:11.791+08:00",
      "scope": "project", "inHotSet": true }
  ]
}
```

| Field | Source | Shown as |
|---|---|---|
| `id` | `fact:` plus the Fact's id, the form `memory forget` takes | Not shown |
| `sentence` | `rule` | The bold text |
| `said` | `said`, or `null` | `Your words: “<said>”` |
| `author` | `human` (the operator said it) or `agent` (proposed by the assistant, kept by the operator) | When `said` is `null`: `Inferred by the assistant, kept by you` |
| `createdAt` | `created_at`, or `null` when it is not a date | The date and time, `MM-DD HH:MM` |
| `scope` | `project` or `task` | A grey `task` tag, only for `task` |
| `inHotSet` | The id is in `hotSet.factIds` | A blue `in hot set` tag |

- `active` becomes `len(facts)`, so the band and the pane always agree.
- `inHotSet` refers to the last hot set loaded in this workspace, by any session. With two sessions open it can be the other session's. This is accepted (multi-session sync, C, is dropped).
- `parseSnapshot` checks `facts`. If it is missing or malformed, the band and the Review pane work as before, and the Memory pane says `memory unreadable (fact list)`. It never shows an empty list for a list it could not read.

### Components

| File | Does | Kind |
|---|---|---|
| `tools/snapshot.py` | Adds `facts` (above) | Python, pytest |
| `hooks/snapshot.ts` | Parses `facts` into `Fact[]`; a separate flag says whether the list was readable | Pure, unit tests |
| `hooks/memory.ts` (new) | The Memory pane's rows: merges the snapshot's Facts with this pane's results (confirming, forgotten, failed); keeps a forgotten Fact listed after it leaves the snapshot; never lets a failure replace a forget; caps the list at 200. Builds the forget argv and reads its result, including a skill citation | Pure, unit tests |
| `hooks/notes.ts` (new) | The queue of pane changes for the assistant, and the text of the note | Pure, unit tests |
| `hooks/svg.ts` | Adds the Memory pane's header and Fact card | Pure, unit tests |
| `hooks/band.ts` | The model gets `showMemory`: true whenever a snapshot was read | Pure, unit tests |
| `hooks/feature-hud.tsx` | The Memory pane render hook and its buttons; the band's "Memory" button; queues a note after each keep, reject and forget; clears the pane's results on close | Engine tests |
| `hooks/feature-hotset.ts` | Its `prompt.submit` hook adds the note to the message (below) | Engine tests |
| `hooks/command.ts` | `/agentzero memory` | Engine tests |
| `types/index.d.ts` | `Fact`; `Snapshot.facts`; `PluginState.agentzero` gets `memoryResults` and `paneNotes` | Types |

The engine's rules from 1.0 and 1.1 still hold: one hook per event and matcher per plugin, and `$` never passed into another file. So the note goes into the existing `prompt.submit` hook in `feature-hotset.ts`, not into a new one.

### The pane

Opened by the band's "Memory" button (next to "Review") or by `/agentzero memory`, which replies `Opened the AgentZero memory pane.` Title "AgentZero · Memory". The Review button keeps its rule (shown only when items wait); the Memory button shows whenever a snapshot was read, even with no Facts.

- Header SVG: "Your memory" in bold; on its own line "Facts the assistant applies here. Forget any that are wrong."; then chips `N active` (green), `N in hot set` (blue), and `N forgotten` (grey, only after a forget in this pane).
- One rounded card per Fact, 360 px wide, as in the Review pane: the date, then the `in hot set` and `task` tags; the sentence in bold, wrapped to at most two lines and then cut with `…`; the `Your words` or `Inferred` line, cut to one line. The full sentence is the SVG's `alt`.
- Under each card, a grey text button "Forget".
- At most 200 cards; beyond that the last line says `+N older Facts not shown`.

Card states:

| State | Card | Under the card |
|---|---|---|
| Active | White, green outline | "Forget" |
| Confirming | Light red, red outline | `Forget this Fact?` "✗ Forget" "Cancel" |
| Forgotten | Grey, sentence struck through, `✗ Forgotten` top right | Nothing |
| Failed | Red, the kernel's first error line in place of the words line | "Forget" |
| Forgotten, cited by a skill | As forgotten, plus an amber line `Cited by skill <id>, which needs a new version` | Nothing |

### Forget

1. "Forget" sets the row to confirming. Nothing runs. "Cancel" sets it back.
2. "✗ Forget" runs `[<workspace>/a0, 'memory', 'forget', <id>]` with `cwd: workspace` and the Review pane's timeout (10 s).
3. Success means exit 0 and a line starting `forgot:` in the output. The row becomes forgotten. If the output has a line `skill:<id> cites it`, the row records the skill. The snapshot refreshes through the existing refresh gate. The Fact leaves the snapshot, but the row stays, from the copy kept in the result, until the pane closes.
4. Anything else is a failure: the row shows the first non-empty line of stderr, else of stdout, else `exit <code>` or `timed out`, and "Forget" stays.
5. Closing the pane clears the confirming, forgotten and failed rows (`ui.close`, as for the Review pane). There is no undo: the kernel retires the Fact and keeps its file, but has no command to make it active again.

### Telling the assistant

- After each successful forget in the Memory pane, and each successful keep or reject in the Review pane, the plugin adds an entry to `paneNotes`: the verb, the kind and the sentence. `paneNotes` is in `$.state`, so it survives a reload of the plugin. It belongs to the session.
- On the next prompt, the `prompt.submit` hook adds the note as context (not shown to the operator) and empties the queue:

  ```
  AgentZero: since your last message, the operator changed the memory in the plugin's panes.
  Forgotten, stop applying: "Never deploy on Fridays."
  Kept, now active: fact "Deploys go out on Tuesdays and Thursdays only."
  Rejected: episode "…"
  ```

  Only the lines with entries are written.
- When the same prompt loads a fresh hot set, the queue is emptied and no note is added: the hot set already reflects the change.
- If the hot set load on that prompt fails, the note is added as usual.

### Terminal

The terminal has no `Svg`. The pane draws the same content as `Text`, with the same buttons:

```
Your memory · 4 active · 2 in hot set · 1 forgotten
10-06 10:17 [in hot set] In this project, always reply in English, …
  Your words: “记得这个项目无论我讲什么你都用英文回复”
  [Forget]
```

## Error handling

The rule from A holds: a failure never blocks work, and the pane never claims "no Facts" for a list it could not read.

| Case | Pane shows |
|---|---|
| Not in a workspace | `This is not an AgentZero workspace.` |
| No snapshot yet | `reading memory…` |
| Snapshot unreadable | `memory unreadable (<reason>)`, as the band |
| `facts` missing or malformed | `memory unreadable (fact list)` |
| No active Facts | `No Facts yet.` |
| Forget fails or times out | The row in red with the reason; "Forget" stays |
| A Fact is forgotten elsewhere (the assistant, another session) while the pane is open | It leaves the list at the next refresh, with its confirming state if it had one |

## Testing

- **pytest** (`tests/test_snapshot.py`), against a workspace made by the pinned kernel: two remembered Facts come newest first with every field; a proposed Fact that is then confirmed has `author` `agent` and `said` `null`; `inHotSet` after a hot-set load; proposed and retired Facts are absent; `active == len(facts)`; Chinese is kept as is.
- **Unit:** `memory.ts` for confirm, cancel, success, failure, a forgotten row kept after it leaves the snapshot, a failure not replacing a forget, the 200 cap, the skill citation, and the forget argv; `notes.ts` for the note text and its empty case; `snapshot.ts` for a readable, missing and malformed `facts`; `svg.ts` for the header chips and each card state; `band.ts` for `showMemory`.
- **Engine** (`$.ui.mount`, desktop and terminal): the five states of the error table; two presses run the right `forget` command with the kernel mocked, for success and for failure; the band's Memory button opens the pane; `/agentzero memory` opens it; a forget, a keep and a reject each put a note on the next prompt and not on the one after; no note on a prompt that loads the hot set.
- **By hand, in the lab workspace** (the test kit cannot raise `ui.close`):
  1. Have the assistant remember two or three throwaway Facts. Do not use the "reply in English" Fact: forgetting it changes how the lab works.
  2. Open the Memory pane: count, order, words and `in hot set` are right.
  3. Forget one: the card goes grey; its YAML file says `status: retired`; the band's count drops by one.
  4. Send a message asking which Fact was just forgotten: the assistant knows.
  5. Keep an item in the Review pane: on the next message the assistant knows.
  6. Close and reopen the pane: the forgotten row is gone.
  7. Save a screenshot to `docs/hud/` for the README.
- **Release:** version `1.2.0-rc.1`; README (English and Chinese), `CHANGELOG.md` and `docs/verify.md` updated.

## Out of scope

- The graph of entities and edges.
- Skills, Episodes and other kinds in this pane.
- Editing a Fact; undo of a forget.
- Search, filters and grouping.
- A "show full text" control for long sentences.

## What would show this is wrong

- The operator opens the pane only to look, never to forget: the Forget button is noise, and the pane should be read-only.
- Fact counts grow past 200 in daily use: the list needs search or grouping, not a cap.
- The assistant ignores the note and keeps applying a forgotten Fact: the note must be stronger, or the hot set must reload after a pane change.
