# Instrument HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw the Memory and Review panes and the band as an instrument panel: an SVG cluster of gauges on desktop, one-line rows with aligned trust columns, details on hover.

**Architecture:** Pure modules build everything from plain data: `instruments.ts` returns SVG source strings, `view.ts` returns row text, `hud-view.tsx` returns element trees from `{ Box, Text, Button, Svg? }`. `feature-hud.tsx` only reads state, runs the kernel and passes the surface, the pane's `bodyColumns` and the clock to the views. The snapshot script gains two fields per Fact.

**Tech Stack:** Claude Code mod API 2.1.295 (TSX hooks, `claude plugin test` with `claude-code/testing`), Python 3.11 + pytest for `tools/snapshot.py`.

**Spec:** `docs/instrument-hud-spec.md`

## Global Constraints

- Desktop first; the terminal must work (same tree, no `Svg`, hover lines always shown).
- Elements: `Box`, `Text`, `Button`, `Svg` (desktop only). Pane buttons `plain={true}`.
- SVG width: `bodyColumns × 5.7` px, no `preserveAspectRatio="none"`; under 60 columns the cluster is a 2 × 2 grid.
- SVG palette: one light and one dark set, switched by `@media (prefers-color-scheme: dark)` inside the SVG. Blue = loaded, amber = waiting, green = kept/done, red = failed, grey = secondary.
- SVG type: `-apple-system, system-ui, sans-serif`; labels 12–13 px, figures 20 px.
- Theme keys in components: `suggestion` (blue), `warning` (amber), `success` (green), `error` (red), `dimColor` for grey.
- Copy, exactly: `LOADED NOW · N`, `NOT LOADED · N`, `FORGOTTEN · N`, `WAITING FOR YOU · N`, `DONE · N`, `❝ yours`, `◇ inferred`, `Inferred by the assistant, kept by you`, `Replaced “<sentence>”`, `+N older Facts not shown`.
- The product name in the HUD stays `AgentZero`.
- Version `1.4.0-rc.1`; kernel AgentRoot 0.5.0 (c27880a).

## Review Focus

- No active Facts but a hot set loaded: gauges read `0 / 0`, no `NaN` in the SVG (Task 3).
- A sentence with `<`, `&`, `"` or `'` in a timeline `<title>`: escaped, the SVG still parses (Task 3).
- A very narrow pane (20 columns): the SVG is at least 180 px wide and in the grid layout (Task 3).
- A Fact with `createdAt: null`: no timeline dot, the age column reads `—` (Tasks 2, 3).
- A hot set listing a Fact forgotten elsewhere: "Loaded" counts Facts with `inHotSet`, not `hotSet.factIds.length` (Task 4).

---

### Task 1: Commit the work already done

**Files:** already modified: `plugins/agentzero/kernel/**` (AgentRoot 0.5.0), `plugins/agentzero/hooks/test-world.ts`, `plugins/agentzero/hooks/hud-view.tsx`, `plugins/agentzero/hooks/feature-hud.tsx`, `plugins/agentzero/hooks/view.ts`, `plugins/agentzero/hooks/*.test.ts`

- [ ] **Step 1: Run both suites**

Run: `python3 -m pytest -q` then `claude plugin test plugins/agentzero`
Expected: 21 passed; 180 pass, 0 fail.

- [ ] **Step 2: Commit in two parts**

```bash
git add plugins/agentzero/kernel
git commit -m "Kernel: AgentRoot 0.5.0 (c27880a)"
git add plugins/agentzero/hooks docs/instrument-hud-spec.md docs/superpowers
git commit -m "HUD rows with marks and sections; test kit 2.1.295; instrument HUD spec and plan"
```

---

### Task 2: Snapshot data and row text

**Files:**
- Modify: `plugins/agentzero/tools/snapshot.py` (`_facts`)
- Modify: `plugins/agentzero/types/index.d.ts` (`Fact`)
- Modify: `plugins/agentzero/hooks/snapshot.ts` (`fact`)
- Modify: `plugins/agentzero/hooks/view.ts`
- Test: `tests/test_snapshot.py`, `plugins/agentzero/hooks/snapshot.test.ts`, `plugins/agentzero/hooks/view.test.ts`

**Interfaces:**
- Produces: `Fact` gains `factKey: string | null; replaces: string | null`.
- Produces (`view.ts`): `age(now: number, iso: string | null): string` → `'now'` under 1 h, `'5h'` under 24 h, `'3d'` under 14 days, else `'5w'`; `'—'` for null or unparsable. `sourceChip(fact: Fact): { text: '❝ yours' | '◇ inferred'; dim: boolean }` (`said !== null` → yours, not dim). `factDetail(row: MemoryRow): string[]` → the lines hover shows: the words (`“…”` uncut, or `Inferred by the assistant, kept by you`), then `Replaced “<replaces>”` when not null.

- [ ] **Step 1: Write the failing Python tests** in `tests/test_snapshot.py`

```python
def test_a_fact_names_its_key_and_what_it_replaced(ws):
    mem(ws, "remember", "Stand-up at 9.", "--said", "Stand-up at 9.", "--fact-key", "standup")
    mem(ws, "remember", "Stand-up at 10.", "--said", "Stand-up at 10.", "--fact-key", "standup")
    _, snap = snapshot(ws)
    [f] = snap["facts"]
    assert f["factKey"] == "standup" and f["replaces"] == "Stand-up at 9."

def test_a_fact_without_a_key_replaces_nothing(ws):
    mem(ws, "remember", "Use pnpm.", "--said", "Use pnpm.")
    _, snap = snapshot(ws)
    [f] = snap["facts"]
    assert f["factKey"] is None and f["replaces"] is None
```

- [ ] **Step 2: Run them**

Run: `python3 -m pytest tests/test_snapshot.py -q -k "key or replaces"`
Expected: FAIL with `KeyError: 'factKey'`.

- [ ] **Step 3: Implement in `_facts`**: parse every entry once; for an active Fact with an explicit `fact_key`, `replaces` is the `rule` of the newest entry with `status == "retired"`, the same `fact_key` and an earlier `created_at` (`_when`), else `None`.

- [ ] **Step 4: Run the Python suite**

Run: `python3 -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Write the failing TS tests**: in `snapshot.test.ts`, a fact with `factKey: 'k', replaces: 'old'` parses to those values and a fact without the two fields parses to `null` for both. In `view.test.ts`:

```ts
const NOW = Date.parse('2026-10-15T12:00:00Z')
test('age', () => {
  expect(age(NOW, '2026-10-15T11:30:00Z')).toBe('now')
  expect(age(NOW, '2026-10-15T07:00:00Z')).toBe('5h')
  expect(age(NOW, '2026-10-12T12:00:00Z')).toBe('3d')
  expect(age(NOW, '2026-09-10T12:00:00Z')).toBe('5w')
  expect(age(NOW, null)).toBe('—')
})
test('sourceChip', () => {
  expect(sourceChip(fact({ said: '周五别部署' }))).toEqual({ text: '❝ yours', dim: false })
  expect(sourceChip(fact({ said: null }))).toEqual({ text: '◇ inferred', dim: true })
})
test('factDetail shows the whole words and what it replaced', () => {
  expect(factDetail(row(fact({ said: 'x'.repeat(80), replaces: 'Stand-up at 9.' }))))
    .toEqual([`“${'x'.repeat(80)}”`, 'Replaced “Stand-up at 9.”'])
})
```

- [ ] **Step 6: Run them**

Run: `claude plugin test plugins/agentzero`
Expected: the new tests FAIL (`age is not a function`).

- [ ] **Step 7: Implement** `Fact` fields, the parser (absent → `null`, a non-string non-null → the fact is unreadable as today), `age`, `sourceChip`, `factDetail`. Add `factKey: null, replaces: null` to the Facts in `test-world.ts` and the memory test fixtures.

- [ ] **Step 8: Run the plugin suite**

Run: `claude plugin test plugins/agentzero`
Expected: all pass.

- [ ] **Step 9: Commit** `git commit -am "Snapshot: each Fact's key and the sentence it replaced; age and source for rows"`

---

### Task 3: The SVG instruments

**Files:**
- Create: `plugins/agentzero/hooks/instruments.ts`
- Test: `plugins/agentzero/hooks/instruments.test.ts`

**Interfaces:**
- Produces:
  - `PX_PER_COLUMN = 5.7`; `columnsToPx(columns: number): number` → `Math.max(180, Math.round(columns * 5.7))`.
  - `escapeXml(s: string): string` (`& < > " '`).
  - `ringPath(fraction: number, r: number, cx: number, cy: number): string | null` → an SVG arc `d` from 12 o'clock clockwise; `null` for 0 (nothing lit); a full circle for 1 (two arcs).
  - `dotX(days: number, left: number, right: number): number` → `right` at 0 days, `left` at ≥ 30, linear between.
  - `type Dot = { days: number; loaded: boolean; title: string }`
  - `type MemoryFigures = { loaded: number; active: number; yours: number; waiting: number; loadedAt: string | null; dots: Dot[]; oldest: string | null; newest: string | null }` (`loadedAt` already formatted `HH:MM`; `oldest`/`newest` already ages from `view.age`).
  - `memoryCluster(f: MemoryFigures, columns: number): string` → `<svg …>`: rings **LOADED** `3 / 5` with `at 14:02` (or `not loaded yet`), **YOUR WORDS** `4 / 5` with `1 inferred`, the timeline with `OLDEST 9d · NEWEST 2h` and one `<circle>` per dot holding `<title>`, the **WAITING** light (amber glow filter when > 0, grey at 0). One row under 60 columns → 2 × 2 grid.
  - `reviewCluster(f: { waiting: number; done: number }, columns: number): string` → **WAITING** light and **DONE** figure (green when > 0).
  - `textGauge(n: number, of: number, cells?: number): string` → `▰`×lit + `▱`×rest, 5 cells by default, at least one lit when `n > 0`; all `▱` when `of === 0`.
- Every SVG: `width` = `columnsToPx(columns)`, a matching `viewBox`, a `<style>` with the light palette and a `@media (prefers-color-scheme: dark)` block.

- [ ] **Step 1: Write the failing tests**

```ts
const F: MemoryFigures = { loaded: 3, active: 5, yours: 4, waiting: 2, loadedAt: '14:02',
  dots: [{ days: 0.1, loaded: true, title: 'a < b & "c"' }, { days: 40, loaded: false, title: 'old' }],
  oldest: '6w', newest: 'now' }
test('columnsToPx', () => { expect(columnsToPx(140)).toBe(798); expect(columnsToPx(20)).toBe(180) })
test('ringPath', () => {
  expect(ringPath(0, 20, 30, 30)).toBeNull()
  expect(ringPath(0.2, 20, 30, 30)).toMatch(/^M30 10 A20 20 0 0 1 /)
  expect(ringPath(1, 20, 30, 30)!.match(/A20 20/g)!.length).toBe(2)
})
test('dotX', () => { expect(dotX(0, 10, 310)).toBe(310); expect(dotX(15, 10, 310)).toBe(160); expect(dotX(45, 10, 310)).toBe(10) })
test('memoryCluster: figures, escaped titles, both palettes, no NaN', () => {
  const svg = memoryCluster(F, 140)
  for (const s of ['LOADED', '3 / 5', 'at 14:02', 'YOUR WORDS', '4 / 5', '1 inferred', 'OLDEST 6w · NEWEST now', 'WAITING'])
    expect(svg).toContain(s)
  expect(svg).toContain('<title>a &lt; b &amp; &quot;c&quot;</title>')
  expect(svg).toContain('prefers-color-scheme: dark')
  expect(svg).toContain('width="798"')
  expect(svg).not.toContain('NaN')
})
test('memoryCluster with nothing active reads 0 / 0', () => {
  const svg = memoryCluster({ ...F, loaded: 0, active: 0, yours: 0, dots: [], oldest: null, newest: null }, 140)
  expect(svg).toContain('0 / 0'); expect(svg).not.toContain('NaN')
})
test('a narrow pane gets the grid', () => {
  expect(memoryCluster(F, 34)).toContain('data-layout="grid"')
  expect(memoryCluster(F, 140)).toContain('data-layout="row"')
})
test('textGauge', () => { expect(textGauge(3, 5)).toBe('▰▰▰▱▱'); expect(textGauge(1, 50)).toBe('▰▱▱▱▱'); expect(textGauge(0, 0)).toBe('▱▱▱▱▱') })
```

- [ ] **Step 2: Run them**

Run: `claude plugin test plugins/agentzero`
Expected: FAIL (`instruments` not found).

- [ ] **Step 3: Implement `instruments.ts`** to the interfaces above. Mark the root `<svg>` with `data-layout="row"` or `"grid"`. Pick the palette values so blue/amber/green/red read on `#f4f4f2`-ish light and `#262624`-ish dark backgrounds; the cluster's own background is transparent.

- [ ] **Step 4: Run the suite**

Run: `claude plugin test plugins/agentzero`
Expected: all pass.

- [ ] **Step 5: Commit** `git commit -am "SVG instruments: rings, timeline, waiting light, light and dark"` (after `git add plugins/agentzero/hooks/instruments*.ts`)

---

### Task 4: The Memory pane

**Files:**
- Modify: `plugins/agentzero/hooks/hud-view.tsx` (`memoryPane`, `row`)
- Modify: `plugins/agentzero/hooks/feature-hud.tsx` (Memory pane hook)
- Test: `plugins/agentzero/hooks/feature-hud-memory.test.ts`

**Interfaces:**
- Consumes: `age`, `sourceChip`, `factDetail` (Task 2); `memoryCluster`, `textGauge`, `columnsToPx` (Task 3).
- Produces: `type ViewCtx = { surface: 'terminal' | 'desktop' | 'vscode' | 'mobile'; columns: number; now: number }`; `type Els = { Box: El; Text: El; Button: El; Svg?: El }`; `memoryPane(els: Els, v: MemoryView, act: MemoryActions, ctx: ViewCtx)` with `MemoryView = { rows: MemoryRow[]; active: number; inHotSet: number; waiting: number; hidden: number; loadedAt: string | null }`. Hover is drawn when `ctx.surface !== 'terminal'`.

- [ ] **Step 1: Write the failing engine tests** (fixture Facts A in hot set with `said`, B not, as now; `PANE.bodyColumns` 140 unless named)

```ts
for (const surface of ['desktop', 'terminal'] as const) {
  test(`Memory pane sections and rows on ${surface}`, async ($, on) => {
    // … mount with facts [A, B]
    const t = await allText(ui)
    expect(t).toContain('LOADED NOW · 1')
    expect(t).toContain('NOT LOADED · 1')
    expect(t).toContain('●Never deploy on Fridays.❝ yours')
    expect(t).toContain('○Deploys go out on Tuesdays.◇ inferred')
    expect(await ui.find({ key: 'az-forget-fact:a' })).toBeDefined()
  })
}
test('desktop: a cluster SVG, details on hover', async (…) => {
  expect((await ui.find({ type: 'Svg' }))?.props.source).toContain('1 / 2')
  const hidden = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.display === 'none' && b.props.hover?.display === 'flex')
  expect(hidden.length).toBe(2)
})
test('terminal: text gauges, details always shown', async (…) => {
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await allText(ui)).toContain('LOADED ▰▰▰▱▱ 1/2')
  expect((await ui.findAll({ type: 'Box' })).some((b: any) => b.props.display === 'none')).toBe(false)
  expect(await allText(ui)).toContain('“周五别部署”')
})
test('columns sit beside the sentence from 70 columns', () => { expect(columnsInline(70)).toBe(true); expect(columnsInline(69)).toBe(false) })
test('Loaded counts Facts in the hot set, not the hot set ids', async (…) => {
  // SNAPSHOT.hotSet.factIds lists 'fact:gone' and 'fact:a'; facts [A, B] → svg contains '1 / 2'
})
test('a forgotten row keeps Restore visible', async (…) => {
  // after forget: 'FORGOTTEN · 1' in text; key az-restore-fact:a found and no Box with display 'none' contains it
})
```

Keep the existing tests for forget, restore, failures, plain buttons, `No Facts yet.`, `memory unreadable …`; update their text expectations to the new copy.

- [ ] **Step 2: Run them**

Run: `claude plugin test plugins/agentzero`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**
  - `memoryPane`: the cluster (`Svg` with `source = memoryCluster(…)`, `alt` = `Loaded 1 of 2, 1 in your words, 1 waiting`, `isInteractive`, `width = columnsToPx(ctx.columns)`) when `els.Svg` and not terminal; else one `Text` line of `textGauge`s: `LOADED ▰▰▱ n/m   YOURS ▰▰▱ n/m   WAITING n`.
  - Sections as in the spec; `LOADED NOW` carries `loaded HH:MM` dim at its right.
  - `export function columnsInline(columns: number): boolean` → `columns >= 70`.
  - A row: a keyed `Box` (`key: az-row-<id>`); line 1 = light, sentence (`wrap: truncate-end`), and when `columnsInline` the columns (source chip, `age`, scope, `↺` when `replaces`) at the right with `flexShrink: 0`; under 70 the columns on line 2. Then the detail Box (`factDetail` lines + `Forget` at its right): `display: 'none', hover: { display: 'flex' }` on desktop, plain on terminal. Forgotten and failed rows as the spec says, `Restore` outside the hidden Box.
  - `feature-hud.tsx`: pass `{ surface: e.surface, columns: e.props.bodyColumns, now: await $.clock.now() }`; `loadedAt` from `hud.snapshot.hotSet?.at` formatted `HH:MM` in local time; `MemoryFigures.dots` from active Facts with a `createdAt` (`days = (now − created) / 86 400 000`).

- [ ] **Step 4: Run the suite**

Run: `claude plugin test plugins/agentzero`
Expected: all pass.

- [ ] **Step 5: Commit** `git commit -am "Memory pane: instrument cluster, sections, one-line rows, details on hover"`

---

### Task 5: The Review pane and the band

**Files:**
- Modify: `plugins/agentzero/hooks/hud-view.tsx` (`reviewPane`, `band`)
- Modify: `plugins/agentzero/hooks/band.ts` (`bandModel` pills)
- Modify: `plugins/agentzero/hooks/feature-hud.tsx`
- Test: `plugins/agentzero/hooks/feature-hud-band.test.ts`, `plugins/agentzero/hooks/band.test.ts`

**Interfaces:**
- Consumes: `reviewCluster`, `textGauge` (Task 3); `ViewCtx`, `Els` (Task 4); `age` (Task 2). A review row's columns are the kind (`Fact`, `Skill`, …), its provenance and its age; no source chip.
- Produces: `reviewPane(els, v: ReviewView, act: ReviewActions, ctx: ViewCtx)`; `bandModel(...)` pills become `● n/m loaded` (blue), `❝ n/m yours` (ink), `◉ n waiting` (amber, only when > 0), or the existing red `hot set not loaded (<reason>)` in place of the first.

- [ ] **Step 1: Write the failing tests**: band text on desktop and terminal is exactly `` `◆AgentZero● 1/3 loaded❝ 2/3 yours◉ 1 waiting▰▰▰▱▱▱▱▱context 41%` `` for a fixture of 3 Facts (1 in hot set, 2 with words) and 1 pending; `● 1/3 loaded` has `color: 'suggestion'`; the failed hot set still shows `hot set not loaded (exit 1)` in `error`. Review pane: text contains `WAITING FOR YOU · 1`; after a keep, `DONE · 1` and a `✓` with `color: 'success'`; desktop has an `Svg` whose source contains `WAITING`, terminal none; `✓ Keep` and `✗ Reject` are not inside a `display: 'none'` Box.

- [ ] **Step 2: Run them**

Run: `claude plugin test plugins/agentzero`
Expected: FAIL.

- [ ] **Step 3: Implement** the pills in `bandModel` (it now needs `snap.facts` for the counts; when `facts` is null keep `N active`), the band, and `reviewPane` per the spec; pass `ViewCtx` from both hooks.

- [ ] **Step 4: Run the suite**

Run: `claude plugin test plugins/agentzero`
Expected: all pass.

- [ ] **Step 5: Commit** `git commit -am "Review pane and band in the instrument style"`

---

### Task 6: Release candidate and check in the app

**Files:**
- Modify: `plugins/agentzero/.claude-plugin/plugin.json` (`"version": "1.4.0-rc.1"`)
- Modify: `CHANGELOG.md` (new `## 1.4.0-rc.1 — kernel AgentRoot 0.5.0 (c27880a)` entry), `README.md` and `README.zh-CN.md` (HUD section and screenshot path), `docs/native-ui-spec.md` (a line pointing to the new spec)
- Outside the repo: refresh the preview mod with `sync-preview.sh` and point its fixtures at the new views

- [ ] **Step 1: Validate and run everything**

Run: `claude plugin validate plugins/agentzero && claude plugin test plugins/agentzero && python3 -m pytest -q`
Expected: `Validation passed`, all plugin tests pass, all Python tests pass.

- [ ] **Step 2: Refresh the preview mod** so `/azp` draws the new panes and band from fixtures with a `replaces`, a task Fact, a Fact with no date and a forgotten one.

- [ ] **Step 3: Operator check in the desktop app**: screenshots of `/azp` at ~140 and ~34 columns, light and dark; hover on a row shows the words and `Forget`; the band. Record what was seen in `docs/verify.md` under a new "Instrument HUD (1.4.0-rc.1)" table.

- [ ] **Step 4: Commit** `git commit -am "1.4.0-rc.1: the instrument HUD"`
