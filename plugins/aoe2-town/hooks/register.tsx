import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Town, TownTask, TaskStatus, UnitKind } from '../types'
import { STRIP_ROWS, drawStrip, toRasterCells } from './pixels'
import { townSvg } from './svg'
import { BURN_MS, HOMEWARD_MS, WORLD_H, WORLD_W, ageName } from './world'

const TICK_MS = 300

const EMPTY_TOWN: Town = {
  mood: 'idle',
  tasks: [],
  units: [],
  age: 0,
  contextPercent: null,
  trained: 0,
  burningUntil: 0,
  tcBuiltAt: null,
}

const town = atom({ plugin: 'aoe2-town', key: 'town' } as const, EMPTY_TOWN)
const frame = atom({ plugin: 'aoe2-town', key: 'frame' } as const, 0)
const isHidden = atom({ plugin: 'aoe2-town', key: 'isHidden' } as const, false)

/** The town as stored, with any field an older version did not keep. */
function filled(t: Town): Town {
  return { ...EMPTY_TOWN, ...t }
}

/** Whether a terminal drew the band last: only it needs the clock's frames. */
let isTerminalDrawn = false

const MOOD_TEXT: Record<Town['mood'], string> = {
  idle: 'Idle',
  working: 'Working…',
  permission: 'Wololo! Awaiting orders',
  error: 'Under attack!',
}

function unitKind(agentType: string): UnitKind {
  const type = agentType.toLowerCase()
  if (type.includes('explore')) return 'scout'
  if (type.includes('plan')) return 'monk'
  if (type === 'general-purpose' || type === 'fork' || type === 'claude' || type === '') return 'villager'
  return 'militia'
}

/** The age a share of finished tasks has reached. */
function ageFor(tasks: readonly TownTask[]): number {
  if (tasks.length === 0) return 0
  const share = tasks.filter(task => task.status === 'completed').length / tasks.length
  return share >= 1 ? 3 : share >= 2 / 3 ? 2 : share >= 1 / 3 ? 1 : 0
}

function statusLine(t: Town): string {
  const built = t.tasks.filter(task => task.status === 'completed').length
  const parts = [ageName(t.age), MOOD_TEXT[t.mood]]
  const working = t.units.filter(unit => unit.doneAt === null).length
  if (working > 0) parts.push(`${working} unit${working === 1 ? '' : 's'} at work`)
  if (t.tasks.length > 0) parts.push(`${built}/${t.tasks.length} built`)
  if (t.contextPercent !== null) parts.push(`pop ${Math.round(t.contextPercent * 2)}/200`)
  return `⚔ ${parts.join(' · ')}`
}

let soundMode = 'extras'
const lastPlayed = new Map<string, number>()


/**
 * Plays a category through the scripts install.sh put in
 * ~/.claude/sounds/aoe2, the same ones the settings hooks run, so volume,
 * category toggles and no-repeat all hold. A category with no folder of
 * its own falls back to `fallback`.
 */
async function play($: EngineInterface, category: string, fallback?: string, cooldownMs = 2000, stdin?: string) {
  if (soundMode === 'off') return
  try {
    const now = await $.clock.now()
    if (now - (lastPlayed.get(category) ?? 0) < cooldownMs) return
    lastPlayed.set(category, now)

    const isWindows = (await $.env.get('OS')) === 'Windows_NT'
    const home = (isWindows ? await $.env.get('USERPROFILE') : await $.env.get('HOME')) ?? ''
    const sep = isWindows ? '\\' : '/'
    const root = [home, '.claude', 'sounds', 'aoe2'].join(sep)
    const hasOwn = await $.fs.exists([root, 'sounds', category].join(sep))
    const chosen = hasOwn ? category : fallback
    if (chosen === undefined) return

    const script = category === 'error' ? 'play-error' : 'play-random'
    const argv = isWindows
      ? ['powershell', '-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', [root, 'scripts', `${script}.ps1`].join(sep), chosen]
      : ['bash', [root, 'scripts', `${script}.sh`].join(sep), chosen]
    await $.process.run(argv, { stdin, timeoutMs: 10000 })
  } catch {
    // a sound that cannot play never stops the town
  }
}

/** Changes the town, re-reads the age, and keeps the status line current. */
async function change($: EngineInterface, fn: (t: Town) => Town) {
  const before = await read($, town)
  const after = await update($, town, t => {
    const next = fn(filled(t))
    return { ...next, age: Math.max(next.age, ageFor(next.tasks)) }
  })
  $.ui.status(statusLine(after))
  if (after.age > before.age) {
    $.ui.toast(`Advanced to the ${ageName(after.age)}!`)
    await play($, 'age-up', 'task-complete')
  }
  return after
}

async function setTask($: EngineInterface, id: string, patch: Partial<TownTask>) {
  const before = (await read($, town)).tasks.find(task => task.id === id)
  if (patch.status === 'completed' && before?.status !== 'completed') {
    await play($, 'research-complete', 'task-complete', 1500)
  }
  await change($, t => {
    const isKnown = t.tasks.some(task => task.id === id)
    const tasks = isKnown
      ? t.tasks.map(task => (task.id === id ? { ...task, ...patch } : task))
      : [...t.tasks, { id, subject: patch.subject ?? `Task ${id}`, status: patch.status ?? 'pending' }]
    return { ...t, tasks }
  })
}

function setMood($: EngineInterface, mood: Town['mood']) {
  return change($, t => (t.mood === mood ? t : { ...t, mood }))
}

async function trainUnit($: EngineInterface, id: string, agentType: string, label?: string) {
  const isNew = !(await read($, town)).units.some(unit => unit.id === id)
  if (isNew) await play($, 'unit-trained', 'session-start')
  await change($, t => {
    const known = t.units.find(unit => unit.id === id)
    if (known !== undefined) {
      return { ...t, units: t.units.map(unit => (unit.id === id && label !== undefined ? { ...unit, label } : unit)) }
    }
    const unit = { id, kind: unitKind(agentType), label: label ?? agentType, slot: t.trained, doneAt: null }
    return { ...t, trained: t.trained + 1, units: [...t.units, unit] }
  })
}

export const register: Register = (on, options) => {
  soundMode = String(options.sounds ?? 'extras')

  // ── The session and its clock ────────────────────────────────────────────

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'aoe2', description: 'Show or hide the Age of Empires II town above the prompt' })

    $.clock.every(TICK_MS, async () => {
      const now = await $.clock.now()
      const t = await read($, town)
      if (isTerminalDrawn) await update($, frame, n => (n + 1) % 1_000_000)
      if (t.units.some(unit => unit.doneAt !== null && now - unit.doneAt > HOMEWARD_MS)) {
        await change($, s => ({ ...s, units: s.units.filter(unit => unit.doneAt === null || now - unit.doneAt <= HOMEWARD_MS) }))
      }
    })

    $.ui.status(statusLine(filled(await read($, town))))
    if (soundMode === 'all') await play($, 'session-start')
    return next(e)
  })

  on('command.run', { command: 'aoe2' }, async $ => {
    const hidden = await update($, isHidden, was => !was)
    return { text: hidden ? 'The town is hidden. /aoe2 brings it back.' : 'The town is back above the prompt. Wololo.' }
  })

  // ── The main agent: the Town Center ──────────────────────────────────────

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    // the first turn raises the Town Center; every turn sets it working
    await change($, t => ({ ...t, mood: 'working', tcBuiltAt: t.tcBuiltAt ?? now }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await setMood($, 'idle')
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    if (soundMode === 'all') await play($, 'task-complete')
    return next(e)
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    await setMood($, 'permission')
    if (soundMode === 'all') await play($, 'permission')
    return next(e)
  })

  on('classic.PostToolUseFailure', async ($, e, next) => {
    if (e.is_interrupt !== true) {
      const now = await $.clock.now()
      await change($, t => ({ ...t, burningUntil: now + BURN_MS }))
      if (soundMode === 'all' && (e.tool_name === 'Bash' || e.tool_name === 'PowerShell')) await play($, 'error', undefined, 0, JSON.stringify(e))
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const percent = e.context.percent
    if (percent !== undefined) {
      const known = (await read($, town)).contextPercent
      if (known === null || Math.abs(known - percent) >= 0.5) await change($, t => ({ ...t, contextPercent: percent }))
    }
    return next(e)
  })

  // ── Tasks: houses on the map ─────────────────────────────────────────────

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if ((await read($, town)).mood === 'permission') await setMood($, 'working')
    if (ran.deny !== undefined || ran.isError === true) return ran

    if (e.tool === 'TaskUpdate') {
      if (e.status === 'deleted') {
        await change($, t => ({ ...t, tasks: t.tasks.filter(task => task.id !== e.taskId) }))
      } else {
        const patch: Partial<TownTask> = {}
        if (e.status !== undefined) patch.status = e.status
        if (e.subject !== undefined) patch.subject = e.subject
        await setTask($, e.taskId, patch)
      }
    } else if (e.tool === 'TodoWrite') {
      const before = (await read($, town)).tasks
      const tasks = e.todos.map((todo, i): TownTask => ({
        id: `todo-${i}`,
        subject: todo.content,
        status: todo.status as TaskStatus,
      }))
      const finished = tasks.some(task => task.status === 'completed' && before.find(old => old.subject === task.subject)?.status !== 'completed')
      if (finished) await play($, 'research-complete', 'task-complete', 1500)
      await change($, t => ({ ...t, tasks }))
    }
    return ran
  })

  on('classic.TaskCreated', async ($, e, next) => {
    await setTask($, e.task_id, { subject: e.task_subject })
    return next(e)
  })

  on('classic.TaskCompleted', async ($, e, next) => {
    await setTask($, e.task_id, { subject: e.task_subject, status: 'completed' })
    return next(e)
  })

  // ── Subagents: units walking the map ─────────────────────────────────────

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.agentId !== undefined) await trainUnit($, spawned.agentId, e.subagentType, e.description)
    return spawned
  })

  on('classic.SubagentStart', async ($, e, next) => {
    await trainUnit($, e.agent_id, e.agent_type)
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const now = await $.clock.now()
    await change($, t => ({
      ...t,
      units: t.units.map(unit => (unit.id === e.agent_id && unit.doneAt === null ? { ...unit, doneAt: now } : unit)),
    }))
    return next(e)
  })

  // ── The band above the prompt ────────────────────────────────────────────

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const t = filled(await read($, town))
    const ui = $.ui.resolve(e)

    if (e.surface === 'terminal' && 'Raster' in ui) {
      isTerminalDrawn = true
      await read($, frame)
      const width = Math.max(40, Math.min(e.props.bodyColumns, 200))
      const now = await $.clock.now()
      const { Box, Text, Raster } = ui
      return (
        <Box flexDirection="column">
          <Raster key="town" columns={width} rows={STRIP_ROWS} cells={toRasterCells(drawStrip(t, now, width), width)} />
          <Text wrap="truncate" dimColor>
            {statusLine(t)}
          </Text>
        </Box>
      )
    }
    if ('Svg' in ui) {
      isTerminalDrawn = false
      const { Box, Svg } = ui
      // The desktop frame ignores the markup's own size, so give it one: the band's
      // columns at ~8 CSS px each, keeping the world's aspect ratio.
      const width = Math.max(320, e.props.bodyColumns * 8)
      return (
        <Box flexDirection="column">
          <Svg source={townSvg(t, await $.clock.now())} alt={statusLine(t)} width={width} height={Math.round((width * WORLD_H) / WORLD_W)} isInteractive />
        </Box>
      )
    }
    return next(e)
  })
}
