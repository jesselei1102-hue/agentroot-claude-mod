export type PendingItem = { id: string; kind: string; sentence: string; provenance: string; createdAt: string | null }
export type Fact = { id: string; sentence: string; said: string | null; author: string; createdAt: string | null; scope: string; inHotSet: boolean }
// facts is null when the snapshot's list was missing or malformed: the pane then says so.
export type Snapshot = { active: number; pending: PendingItem[]; hotSet: { at: string | null; factIds: string[] } | null; facts: Fact[] | null }
export type HudState = { snapshot: Snapshot | null; error: string | null; stale: boolean }
export type PaneResult = { item: PendingItem; outcome: 'kept' | 'rejected' | 'failed'; message: string }
export type PaneResults = { [id: string]: PaneResult }
export type RawOpen = { [toolUseId: string]: boolean }
export type MemoryRowState = 'confirming' | 'forgotten' | 'failed'
export type MemoryResult = { fact: Fact; outcome: MemoryRowState; message: string; citedBy: string[] }
export type MemoryResults = { [id: string]: MemoryResult }
export type PaneNote = { verb: 'forgot' | 'restored' | 'kept' | 'rejected'; kind: string; sentence: string }

declare module 'claude-code' {
  interface PluginState {
    agentzero: {
      hud: HudState
      hotSetError: string | null
      paneResults: PaneResults
      rawOpen: RawOpen
      memoryResults: MemoryResults
      paneNotes: PaneNote[]
    }
  }
}
