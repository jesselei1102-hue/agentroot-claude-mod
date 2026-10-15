# Desktop app: after the first press in a plugin pane, every Button takes two clicks

**Product:** Claude Code desktop app (Code tab), engine 2.1.289, macOS. Function-hooks plugin with a `Pane`.

## What happens

In a pane drawn by a plugin's `ui.render` hook, the first click on a `Button` after the pane opens runs its `onPress`. Every later click on any Button in that pane does nothing; a second click on the same Button runs it.

The app's log (`~/Library/Logs/Claude/claude.ai-web.log`) has one line for each lost click:

```
[warn] [LOCAL_SESSION] engine surface: ui_press not handled {"plugin":"<plugin>","handle":915720305,"key":"<button key>"}
```

Between two lost clicks the handle numbers move by 7–10, in a pane with two or three buttons: the engine has drawn the pane several times since the drawing the app holds.

## Why we think it happens

From the engine's protocol notes (strings in the 2.1.289 binary):

- "a redraw hands out new handles"
- `ui_press` answers `{handled: false}` when "the handle named no held element … nothing ran, and the tree the surface holds is stale: it asks ui_render again"
- `ui_input` and `ui_select` re-resolve "a handle a redraw just retired" by `key`, `component` and `instance_id`, "so typing across a re-render is not lost". `ui_press` has no such re-resolve.

So after a press, the engine redraws the pane at least once more than the app receives; the app keeps a drawing whose Button handles are retired; the next click is refused and only makes the app fetch the drawing again.

## Reproduce

Seen in our plugin's panes. The plugin below has the same shape, one pane and one counter (not yet run on its own):

```tsx
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const count = atom({ plugin: 'two-clicks', key: 'count' } as const, 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'two-clicks', description: 'Open the two-clicks pane' })
    return next(e)
  })
  on('command.run', { command: 'two-clicks' }, async $ => {
    await $.ui.open({ id: 'two-clicks', title: 'Two clicks', focus: true })
    return { text: 'opened' }
  })
  on('ui.render', { component: 'Pane', requestId: 'two-clicks' }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const n = await read($, count)
    return (
      <Box flexDirection="column">
        <Text>{`pressed ${n} times`}</Text>
        <Button key="more" label="Press" plain onPress={() => update($, count, c => c + 1)} />
      </Box>
    )
  })
}
```

1. Load it in the desktop app and run `/two-clicks`.
2. Click `Press` once: the text reads "pressed 1 times".
3. Click `Press` again: nothing changes, and the log has `ui_press not handled`. A further click counts.

Expected: every click counts, as it does in the terminal and in `claude plugin test`.

## What we tried in the plugin (none helped)

- Opening the pane with `focus: true`, so the first click does not move the keyboard.
- Plain Buttons instead of bordered ones.
- A hidden element that changes on every drawing, in case the app skipped a redraw with the same content.

## Suggested fix

Re-resolve a `ui_press` whose handle a redraw retired by `key`, `component` and `instance_id`, as `ui_input` and `ui_select` already do; or make sure the app receives the last redraw after a press.
