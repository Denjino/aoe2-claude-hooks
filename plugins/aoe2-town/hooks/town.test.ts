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

const PANE = { plugin: 'aoe2-town', component: 'Pane', requestId: 'aoe2-town' } as const
const PANE_PROPS = { title: 'AoE II', isFocused: false, bodyColumns: 40, placement: 'dock' } as never

test('subagents become units and tasks become houses, on every surface', { options: { sounds: 'off' } }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  engine(on)

  await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Write the parser' })
  await $.classic.TaskCreated({ task_id: '2', task_subject: 'Add tests' })
  await $.classic.TaskCreated({ task_id: '3', task_subject: 'Update docs' })
  await $.classic.TaskCompleted({ task_id: '1', task_subject: 'Write the parser' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PANE_PROPS })
    expect(await ui.find({ text: /Units 1/ })).toBeDefined()
    expect(await ui.find({ text: /Built 1\/3/ })).toBeDefined()
    expect(await ui.find({ text: /Scout: Explore/ })).toBeDefined()
    expect(await ui.find({ text: /Write the parser/ })).toBeDefined()
    // a third of the tasks done: the town has reached the Feudal Age
    expect(await ui.find({ text: /Feudal Age/ })).toBeDefined()
    expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeDefined()
    await ui.unmount()
  }

  await $.classic.SubagentStop({ agent_id: 'a1', agent_type: 'Explore', stop_hook_active: false, agent_transcript_path: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PANE_PROPS })
  expect(await ui.find({ text: /Units 0/ })).toBeDefined()
  await ui.unmount()
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
