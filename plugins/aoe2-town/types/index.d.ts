export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type TownTask = { id: string; subject: string; status: TaskStatus }

/** Villager (general work), Scout (Explore), Monk (Plan), Militia (anything else). */
export type UnitKind = 'villager' | 'scout' | 'monk' | 'militia'

export type TownUnit = {
  id: string
  kind: UnitKind
  label: string
  /** Order of training, picks the unit's work site and walk phase. */
  slot: number
  /** Set when the subagent finished: the unit walks home, then leaves. */
  doneAt: number | null
}

/** What the main agent is doing, drawn on the Town Center. */
export type Mood = 'idle' | 'working' | 'permission' | 'error'

export type Town = {
  mood: Mood
  tasks: TownTask[]
  units: TownUnit[]
  /** 0 Dark, 1 Feudal, 2 Castle, 3 Imperial; never goes back down. */
  age: number
  /** Context window fill, 0 to 100, once measured. */
  contextPercent: number | null
  /** Subagents trained this session. */
  trained: number
  /** Until when the Town Center burns after a failure (ms since epoch). */
  burningUntil: number
}

declare module 'claude-code' {
  interface PluginState {
    'aoe2-town': { town: Town; frame: number }
  }
}
