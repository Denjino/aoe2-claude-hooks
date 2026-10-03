import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

/** What the engine would answer beneath the plugin, kept quiet. */
function engine(on: On) {
  for (const name of ['SubagentStart', 'SubagentStop', 'TaskCreated', 'TaskCompleted'] as const) {
    on(`classic.${name}`, async () => ({}))
  }
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
}

const BAND = { plugin: 'aoe2-town', component: 'AbovePrompt' } as const
const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } as never

test('subagents become units and tasks become houses, on every surface', { options: { sounds: 'off' } }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  engine(on)

  await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Write the parser' })
  await $.classic.TaskCreated({ task_id: '2', task_subject: 'Add tests' })
  await $.classic.TaskCreated({ task_id: '3', task_subject: 'Update docs' })
  await $.classic.TaskCompleted({ task_id: '1', task_subject: 'Write the parser' })

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal', props: BAND_PROPS })
  expect(await terminal.find({ type: 'Raster' })).toBeDefined()
  // a third of the tasks done: the town has reached the Feudal Age
  expect(await terminal.find({ text: /Feudal Age.*1 unit at work.*1\/3 built/ })).toBeDefined()
  await terminal.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: BAND_PROPS })
  const svg = String((await desktop.find({ type: 'Svg' }))?.props.source)
  expect(svg).toContain('Feudal Age')
  expect(svg).toContain('<title>Write the parser</title>')
  expect(svg).toContain('<title>Explore</title>')
  await desktop.unmount()

  await $.classic.SubagentStop({ agent_id: 'a1', agent_type: 'Explore', stop_hook_active: false, agent_transcript_path: '' })
  const after = await $.ui.mount({ ...BAND, surface: 'terminal', props: BAND_PROPS })
  expect(await after.find({ text: /Feudal Age/ })).toBeDefined()
  expect(await after.find({ text: /unit at work/ })).toBeUndefined()
  await after.unmount()
})

test('the first turn raises the Town Center', { options: { sounds: 'off' } }, async ($, on) => {
  mock.clock(on, { now: 2_000_000 })
  engine(on)
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))

  const before = await $.ui.mount({ ...BAND, surface: 'desktop', props: BAND_PROPS })
  expect(String((await before.find({ type: 'Svg' }))?.props.source)).not.toContain('clip-path="url(#rise)"')
  await before.unmount()

  await $.turn.start({ text: 'hello', turnId: 't1' })
  const during = await $.ui.mount({ ...BAND, surface: 'desktop', props: BAND_PROPS })
  expect(String((await during.find({ type: 'Svg' }))?.props.source)).toContain('clip-path="url(#rise)"')
  await during.unmount()
})

test('a trained unit plays the villager sound through the installed script', async ($, on) => {
  mock.clock(on, { now: 5_000_000 })
  engine(on)
  mock.env(on, { HOME: '/home/me' })
  const runs: string[][] = []
  on('fs.exists', async () => ({ value: false }))
  on('process.run', async (_$, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.classic.SubagentStart({ agent_id: 'v1', agent_type: 'general-purpose' })

  // no unit-trained folder of its own: falls back to the session-start sounds
  expect(runs).toEqual([['bash', '/home/me/.claude/sounds/aoe2/scripts/play-random.sh', 'session-start']])
})
