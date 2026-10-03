// The town's layout in world units: a wide, short strip, 960 by 120, the
// shape of the band above the prompt. Both renderers (SVG on desktop,
// pixels on the terminal) place things from here, and every walk is a
// function of the clock, so a redraw never resets anyone's stride.
import type { Town, TownTask, TownUnit } from '../types'

export const WORLD_W = 960
export const WORLD_H = 120

export type Point = readonly [number, number]

/** How long the Town Center takes to go up, and a failure to burn out. */
export const BUILD_MS = 1500
export const BURN_MS = 4000
/** How long a finished subagent walks home before it leaves the map. */
export const HOMEWARD_MS = 3500

/** The Town Center's front corner, where its footprint meets the ground. */
export const TC: Point = [300, 108]
export const DOOR: Point = [262, 106]
export const WOOD: Point = [150, 96]
export const GOLD_MINE: Point = [196, 64]

export const TREES: ReadonlyArray<{ at: Point; size: number; kind: 'oak' | 'pine' }> = [
  { at: [18, 70], size: 1.1, kind: 'pine' },
  { at: [46, 58], size: 0.9, kind: 'oak' },
  { at: [30, 104], size: 1.2, kind: 'oak' },
  { at: [74, 82], size: 1.0, kind: 'pine' },
  { at: [100, 60], size: 0.85, kind: 'pine' },
  { at: [62, 116], size: 1.0, kind: 'pine' },
  { at: [118, 98], size: 1.0, kind: 'oak' },
  { at: [140, 72], size: 0.8, kind: 'oak' },
  { at: [905, 62], size: 0.9, kind: 'pine' },
  { at: [935, 88], size: 1.1, kind: 'oak' },
  { at: [890, 112], size: 1.0, kind: 'pine' },
  { at: [950, 116], size: 0.9, kind: 'pine' },
]

/** House plots for tasks, back row then front row, filled in order. */
export const SLOTS: ReadonlyArray<Point> = [
  [470, 66],
  [560, 66],
  [650, 66],
  [740, 66],
  [515, 106],
  [605, 106],
  [695, 106],
  [785, 106],
]

/** The tasks that get a house: the latest ones, as many as there are plots. */
export function visibleTasks(tasks: readonly TownTask[]): TownTask[] {
  return tasks.slice(-SLOTS.length)
}

/** A walk: a loop of points and how long one lap takes. */
export type Walk = { points: Point[]; seconds: number; carries?: 'wood' | 'gold' }

/** The lone villager of a new session, and the town's own villager after. */
export function homeVillagerWalk(town: Town): Walk {
  if (town.tcBuiltAt === null) {
    return { points: [[200, 104], [236, 88], [262, 108], [214, 112], [200, 104]], seconds: 14 }
  }
  if (town.mood === 'working') {
    return { points: [DOOR, WOOD, DOOR], seconds: 9, carries: 'wood' }
  }
  return { points: [[230, 112], [262, 108], [244, 116], [230, 112]], seconds: 12 }
}

export function unitWalk(unit: TownUnit): Walk {
  switch (unit.kind) {
    case 'scout':
      return { points: ellipse([560, 86], 420, 22, 16), seconds: 22 }
    case 'monk':
      return { points: [[372, 108], [432, 92], [404, 116], [372, 108]], seconds: 13 }
    case 'militia':
      return { points: [[360, 116], [860, 116], [360, 116]], seconds: 26 }
    default: {
      const isWood = unit.slot % 2 === 0
      const site: Point = isWood ? [WOOD[0] - 6 + (unit.slot % 3) * 6, WOOD[1] - 10 + (unit.slot % 4) * 6] : [GOLD_MINE[0] + 6, GOLD_MINE[1] + 12]
      return { points: [DOOR, site, DOOR], seconds: 10 + (unit.slot % 3), carries: isWood ? 'wood' : 'gold' }
    }
  }
}

function ellipse(center: Point, rx: number, ry: number, steps: number): Point[] {
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    points.push([center[0] + Math.cos(a) * rx, center[1] + Math.sin(a) * ry])
  }
  return points
}

/** Where a walk stands at a moment, which way it faces, and if it carries. */
export function walkAt(walk: Walk, ms: number, offsetSeconds = 0): { at: Point; isFacingLeft: boolean; isCarrying: boolean } {
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < walk.points.length; i++) {
    const a = walk.points[i - 1] ?? [0, 0]
    const b = walk.points[i] ?? a
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    lengths.push(length)
    total += length
  }
  const lap = (((ms / 1000 + offsetSeconds) % walk.seconds) + walk.seconds) % walk.seconds
  let distance = (lap / walk.seconds) * total
  const half = total / 2
  const isCarrying = walk.carries !== undefined && distance > half
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i] ?? 0
    const a = walk.points[i] ?? [0, 0]
    const b = walk.points[i + 1] ?? a
    if (distance <= length || i === lengths.length - 1) {
      const t = length === 0 ? 0 : Math.min(1, distance / length)
      return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], isFacingLeft: b[0] < a[0], isCarrying }
    }
    distance -= length
  }
  return { at: walk.points[0] ?? [0, 0], isFacingLeft: false, isCarrying }
}

/** Where a finished unit is: on its way back to the door. */
export function homewardAt(unit: TownUnit, now: number): Point {
  const from = walkAt(unitWalk(unit), unit.doneAt ?? now, unit.slot * 1.7).at
  const t = Math.min(1, (now - (unit.doneAt ?? now)) / HOMEWARD_MS)
  return [from[0] + (DOOR[0] - from[0]) * t, from[1] + (DOOR[1] - from[1]) * t]
}

/** How far up the Town Center stands: 0 not started, 1 finished. */
export function tcProgress(town: Town, now: number): number {
  if (town.tcBuiltAt === null) return 0
  return Math.max(0, Math.min(1, (now - town.tcBuiltAt) / BUILD_MS))
}

export const AGE_NAMES = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'] as const

export function ageName(age: number): string {
  return AGE_NAMES[Math.max(0, Math.min(3, age))] ?? AGE_NAMES[0]
}

export type AgePalette = { wallL: string; wallR: string; roofL: string; roofR: string; trim: string; base: string; baseDark: string }

const AGES: [AgePalette, AgePalette, AgePalette, AgePalette] = [
  // Dark Age: timber and thatch
  { wallL: '#a07848', wallR: '#7a5632', roofL: '#9a7a40', roofR: '#74582c', trim: '#5a3c22', base: '#8a7a64', baseDark: '#655845' },
  // Feudal Age: plaster, timber frame, red tile
  { wallL: '#e2d2ac', wallR: '#b8a682', roofL: '#c25a32', roofR: '#923f22', trim: '#6a4a2a', base: '#a49a88', baseDark: '#7a7062' },
  // Castle Age: stone and blue slate
  { wallL: '#c4c0b4', wallR: '#94907f', roofL: '#55699a', roofR: '#3c4c78', trim: '#5a5a56', base: '#a8a498', baseDark: '#7c786c' },
  // Imperial Age: white stone, blue roofs, gold trim
  { wallL: '#f2ead6', wallR: '#cdc4aa', roofL: '#3d70c0', roofR: '#2a5292', trim: '#e2b83c', base: '#d8d0bc', baseDark: '#aaa28e' },
]

export function agePalette(age: number): AgePalette {
  return AGES[Math.max(0, Math.min(3, age))] ?? AGES[0]
}
