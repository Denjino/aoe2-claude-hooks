// The town as one SVG document for the desktop, drawn as pixel art in the
// look of Age of Empires II. The scene is a grid of art pixels, each P world
// units square. Buildings are blocks and roofs in a small iso renderer with
// a depth buffer, so overhangs, posts and sheds sit in front of and behind
// each other properly; scenery is painted straight onto canvases. Every
// canvas is written out as one stroked path per colour, a horizontal run per
// stretch of a row. SMIL does the motion (walks, smoke, flames, the flag, the
// bell), so it moves with no redraw. Every animation begins at a negative
// offset taken from the clock, so a redraw picks each one up where it was
// rather than starting it over.
import type { Town, TownTask, TownUnit, UnitKind } from '../types'
import type { Point, Walk } from './world'
import {
  BUILD_MS,
  DOOR,
  GOLD_MINE,
  HOMEWARD_MS,
  SLOTS,
  TC,
  TREES,
  WOOD,
  WORLD_H,
  WORLD_W,
  homeVillagerWalk,
  homewardAt,
  unitWalk,
  visibleTasks,
} from './world'

/** World units per art pixel, and the scene's size in art pixels. */
const P = 2
const GW = WORLD_W / P
const GH = WORLD_H / P

const n = (v: number) => (Math.round(v * 100) / 100).toString()
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const grid = ([x, y]: Point): Point => [x / P, y / P]
const cell = (p: Point): Point => [Math.round(p[0] / P), Math.round(p[1] / P)]

/** `begin` for a looping animation of `seconds`, in phase with the clock. */
function phase(now: number, seconds: number, offset = 0): string {
  const into = (((now / 1000 + offset) % seconds) + seconds) % seconds
  return `-${into.toFixed(2)}s`
}

/** Fixed noise in [0, 1) for a pixel, so the scenery never shimmers between redraws. */
function hash(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// ── Palette ────────────────────────────────────────────────────────────────

const INK = '#1a1208'
const PLAYER = '#2c5ce0'
const PLAYER_DARK = '#1c3a9c'

const GRASS = '#5a8a2c'
const MEADOW_LIGHT = '#689a34'
const MEADOW_DARK = '#4e7c26'
const TUFT = ['#3a6a1c', '#7cac40'] as const
const DIRT = ['#94743e', '#ae8e52', '#c2a264'] as const
const SOIL = '#6e5030'
const CROP = ['#3a6a20', '#5a922c', '#86b83c'] as const
const OAK = ['#1e3c16', '#2e5e22', '#46842c', '#6aa83c', '#8cc454'] as const
const AUTUMN = ['#5a2e10', '#8a4a18', '#b86e22', '#dc9a3a', '#f0c060'] as const
const PINE = ['#123020', '#1f4832', '#2f6446', '#47805c', '#62a078'] as const
const TRUNK = ['#3a2412', '#5e3c1e'] as const
const ROCK = ['#4e483e', '#6e675a', '#8e8676'] as const
const GOLD = ['#a87810', '#e8b830', '#fff0a0'] as const
const SCAFFOLD = '#c8a060'

/** A sprite's letters: each a colour, `.` and space for nothing. */
const INKS: Record<string, string> = {
  h: '#5a3418', s: '#e8b080', b: PLAYER, B: PLAYER_DARK, w: '#6a4422', p: '#4a3020', k: INK,
  g: '#9a9aa8', G: '#e2e2ea', r: '#b02a20', R: '#8a1a14', y: '#f0c840', Y: '#fff2a0', o: '#7a5230',
  t: '#c8985a', T: '#946a38', n: '#9a6a3a', N: '#5e3a1c', f: '#ff9420', F: '#d8401a', i: '#f4f0e6',
}

// ── Materials by Age ───────────────────────────────────────────────────────

type Pair = readonly [string, string]
type Shingles = { lit: readonly [string, string, string]; shade: readonly [string, string, string] }

/** What the buildings are made of in an Age: [lit, shaded] pairs, roofs as [tile, gap, glint]. */
type Material = {
  plaster: Pair
  beam: Pair
  stone: readonly [string, string, string]
  trim: Pair
  roof: Shingles
  /** How many floors are stone, from the ground up; the rest are timber frame. */
  stoneFloors: number
}

const WOOD_SHINGLES: Shingles = { lit: ['#8a6644', '#553a22', '#aa865a'], shade: ['#64462c', '#3c2814', '#7c5c3c'] }

const MATERIALS: [Material, Material, Material, Material] = [
  // Dark Age: timber frame and plaster under wooden shingles
  { plaster: ['#e8e2d2', '#b6ae9a'], beam: ['#4e3420', '#33210f'], stone: ['#9a968c', '#74706a', '#56524c'], trim: [PLAYER, PLAYER_DARK], roof: WOOD_SHINGLES, stoneFloors: 0 },
  // Feudal Age: a stone ground floor, red tiles
  {
    plaster: ['#ece4d2', '#bab09a'],
    beam: ['#4e3420', '#33210f'],
    stone: ['#d4c8ac', '#a89c82', '#827862'],
    trim: [PLAYER, PLAYER_DARK],
    roof: { lit: ['#b85c34', '#7a3418', '#d47c4c'], shade: ['#8c4226', '#5a2410', '#a45836'] },
    stoneFloors: 1,
  },
  // Castle Age: all stone, slate
  {
    plaster: ['#ece4d2', '#bab09a'],
    beam: ['#5a5650', '#3e3a34'],
    stone: ['#bebaae', '#8e8a7e', '#6a665c'],
    trim: [PLAYER, PLAYER_DARK],
    roof: { lit: ['#5a6a88', '#38445e', '#7a8aa8'], shade: ['#465470', '#2a344a', '#5c6c8a'] },
    stoneFloors: 2,
  },
  // Imperial Age: white stone, blue roofs, gold trim
  {
    plaster: ['#f6f0e4', '#cec6b2'],
    beam: ['#8a7a5a', '#6a5c40'],
    stone: ['#f2ece0', '#cac2ae', '#a29a86'],
    trim: ['#e8c040', '#a8862a'],
    roof: { lit: ['#3a6ac4', '#1e3e84', '#5c8ce2'], shade: ['#2c5098', '#16306a', '#4472c2'] },
    stoneFloors: 2,
  },
]

const materialFor = (age: number): Material => MATERIALS[Math.max(0, Math.min(3, age))] ?? MATERIALS[0]

// ── Canvas: a grid of art pixels written out as runs ───────────────────────

class Canvas {
  readonly w: number
  readonly h: number
  readonly cells: (string | undefined)[]
  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.cells = new Array<string | undefined>(w * h)
  }

  get(x: number, y: number): string | undefined {
    x = Math.floor(x)
    y = Math.floor(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return undefined
    return this.cells[y * this.w + x]
  }

  /** Paints a pixel; nothing (undefined) leaves what is there. */
  set(x: number, y: number, color: string | undefined): void {
    x = Math.floor(x)
    y = Math.floor(y)
    if (color === undefined || x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.cells[y * this.w + x] = color
  }

  fill(x: number, y: number, w: number, h: number, color: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color)
  }

  /** Paints rows of sprite letters with their top-left at (x, y). */
  stamp(rows: readonly string[], x: number, y: number): void {
    rows.forEach((row, j) => [...row].forEach((ch, i) => this.set(x + i, y + j, INKS[ch])))
  }

  /** Rings every painted shape with `color`, one pixel out. */
  outline(color: string): this {
    const add: number[] = []
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.cells[y * this.w + x] !== undefined) continue
        const near = [this.get(x - 1, y), this.get(x + 1, y), this.get(x, y - 1), this.get(x, y + 1)]
        if (near.some(c => c !== undefined && c !== color)) add.push(y * this.w + x)
      }
    }
    for (const i of add) this.cells[i] = color
    return this
  }

  /**
   * One stroked path per colour, offset by (dx, dy). After the first run
   * each move is relative to where the last run ended, which keeps the
   * numbers short: the desktop takes at most 131072 characters.
   */
  svg(dx = 0, dy = 0): string {
    const runs = new Map<string, { d: string[]; x: number; y: number }>()
    for (let y = 0; y < this.h; y++) {
      let x = 0
      while (x < this.w) {
        const color = this.cells[y * this.w + x]
        if (color === undefined) {
          x++
          continue
        }
        let end = x + 1
        while (end < this.w && this.cells[y * this.w + end] === color) end++
        const pen = runs.get(color)
        if (pen === undefined) runs.set(color, { d: [`M${x + dx} ${y + dy + 0.5}h${end - x}`], x: end, y })
        else {
          pen.d.push(`m${x - pen.x} ${y - pen.y}h${end - x}`)
          pen.x = end
          pen.y = y
        }
        x = end
      }
    }
    return [...runs].map(([color, pen]) => `<path stroke="${color}" d="${pen.d.join('')}"/>`).join('')
  }
}

/** A sprite from rows of letters, ringed in ink unless `outline` is null. */
function spriteCanvas(rows: readonly string[], outline: string | null = INK): Canvas {
  const w = Math.max(...rows.map(row => row.length)) + 2
  const c = new Canvas(w, rows.length + 2)
  c.stamp(rows, 1, 1)
  return outline === null ? c : c.outline(outline)
}

/** A sprite's paths, standing on (0, 0): its bottom centre there. */
function sprite(rows: readonly string[], outline: string | null = INK): string {
  const c = spriteCanvas(rows, outline)
  return c.svg(-Math.floor(c.w / 2), 1 - c.h)
}

/** Flip-book frames: each shown for an equal share of a loop of `seconds`. */
function frames(list: readonly string[], seconds: number, now: number, offset = 0): string {
  return list
    .map((frame, i) => {
      const values = list.map((_, j) => (j === i ? 'visible' : 'hidden')).join(';')
      return `<g visibility="${i === 0 ? 'visible' : 'hidden'}"><animate attributeName="visibility" values="${values}" calcMode="discrete" dur="${seconds}s" begin="${phase(now, seconds, offset)}" repeatCount="indefinite"/>${frame}</g>`
    })
    .join('')
}

// ── Iso renderer: blocks and roofs with a depth buffer ─────────────────────

/**
 * Local iso space: `a` runs back to the right along a building's right wall,
 * `b` back to the left along its left wall, `z` up. Its origin sits on the
 * canvas at the building's front-bottom corner.
 */
type Paint = (u: number, v: number) => string | undefined
type Side = 'L' | 'R' | 'B'

class Iso {
  readonly c: Canvas
  readonly depth: number[]
  private ox = 0
  private oy = 0

  constructor(c: Canvas) {
    this.c = c
    this.depth = new Array<number>(c.w * c.h).fill(Infinity)
  }

  /** Puts the local origin at canvas pixel (x, y). */
  at(x: number, y: number): this {
    this.ox = x
    this.oy = y
    return this
  }

  project(a: number, b: number, z: number): Point {
    return [this.ox + a - b, this.oy - (a + b) / 2 - z]
  }

  plot(a: number, b: number, z: number, color: string | undefined): void {
    if (color === undefined) return
    const x = Math.floor(this.ox + a - b)
    const y = Math.floor(this.oy - (a + b) / 2 - z)
    if (x < 0 || y < 0 || x >= this.c.w || y >= this.c.h) return
    // nearer the viewer is lower a + b and higher z; shifted by the origin so
    // every building shares one depth scale
    const d = a + b - z - 2 * this.oy
    const i = y * this.c.w + x
    if (d <= (this.depth[i] ?? Infinity)) {
      this.depth[i] = d
      this.c.cells[i] = color
    }
  }

  /** A flat face from `o`, `lu` along `du` and `lv` along `dv`; `paint` gets whole units. */
  face(o: readonly [number, number, number], du: readonly [number, number, number], lu: number, dv: readonly [number, number, number], lv: number, paint: Paint): void {
    const step = 0.3
    for (let u = 0; u < lu; u += step) {
      for (let v = 0; v < lv; v += step) {
        this.plot(o[0] + du[0] * u + dv[0] * v, o[1] + du[1] * u + dv[1] * v, o[2] + du[2] * u + dv[2] * v, paint(Math.floor(u), Math.floor(v)))
      }
    }
  }

  /** A block's two front walls and top: `left` on the a = a0 face, `right` on b = b0. */
  box(a0: number, b0: number, z0: number, A: number, B: number, H: number, left: Paint, right: Paint, top?: Paint): void {
    this.face([a0, b0, z0], [0, 1, 0], B, [0, 0, 1], H, left)
    this.face([a0, b0, z0], [1, 0, 0], A, [0, 0, 1], H, right)
    if (top !== undefined) this.face([a0, b0, z0 + H], [1, 0, 0], A, [0, 1, 0], B, top)
  }

  /**
   * A hipped roof over the rectangle, its eaves `over` out past the walls at
   * height z0, rising `rise` to a ridge. `paint` gets the slope's side, how
   * far up it from the eave, how far along it, and whether on a hip line.
   */
  roof(a0: number, b0: number, z0: number, A: number, B: number, rise: number, over: number, paint: (side: Side, up: number, along: number, isHip: boolean) => string | undefined): void {
    const a1 = a0 - over
    const b1 = b0 - over
    const a2 = a0 + A + over
    const b2 = b0 + B + over
    const peak = Math.min(A, B) / 2 + over
    const step = 0.25
    for (let a = a1; a < a2; a += step) {
      for (let b = b1; b < b2; b += step) {
        const da = Math.min(a - a1, a2 - a)
        const db = Math.min(b - b1, b2 - b)
        const up = Math.min(da, db, peak)
        const z = z0 - over * 0.5 + (up / peak) * rise
        const side: Side = da < db ? (a - a1 < a2 - a ? 'L' : 'B') : b - b1 < b2 - b ? 'R' : 'B'
        const along = side === 'L' ? b - b1 : a - a1
        this.plot(a, b, z, paint(side, up, along, Math.abs(da - db) < 0.4 && up < peak))
      }
    }
  }
}

// ── Walls and roofs ────────────────────────────────────────────────────────

const pick = (pair: Pair, side: Side) => (side === 'L' ? pair[0] : pair[1])

type WallOptions = { length: number; height: number; floor: number; door?: boolean; windows?: boolean }

/**
 * A wall pixel: a stone footing, then stone or timber-frame-and-plaster
 * floors, a band of trim between floors, lit windows and the door.
 */
function wall(m: Material, side: Side, u: number, v: number, o: WallOptions): string {
  const { length, height, floor } = o
  if (v === 0) return pick([m.stone[1], m.stone[2]], side)
  if (v === height - 1) return pick(m.beam, side)
  if (v === floor && height > floor + 2) return pick(m.trim, side)
  const storey = v < floor ? 0 : 1
  const vf = storey === 0 ? v : v - floor - 1
  if (o.door === true && side === 'L' && storey === 0 && u >= 2 && u <= 4) {
    if (v <= 4) return u === 3 && v <= 3 ? '#2a1a0c' : v === 4 ? pick(m.beam, side) : '#4a2e14'
  }
  const bay = u % 5
  const isWindow = o.windows !== false && vf >= 1 && vf <= 2 && (bay === 2 || bay === 3) && Math.floor(u / 5) % 2 === 0 && u > 1 && u < length - 1
  if (isWindow && !(o.door === true && side === 'L' && storey === 0 && u <= 5)) {
    return vf === 2 && bay === 2 ? '#fff0b0' : side === 'L' ? '#f0b040' : '#c88a2a'
  }
  if (storey < m.stoneFloors) {
    // coursed stone: mortar every other row, joints staggered
    const course = Math.floor(v / 2)
    const isJoint = v % 2 === 0 || (u + (course % 2) * 2) % 4 === 0
    if (isJoint) return pick([m.stone[1], m.stone[2]], side)
    return hash(u, v, side === 'L' ? 3 : 4) < 0.15 ? pick([m.stone[1], m.stone[2]], side) : pick([m.stone[0], m.stone[1]], side)
  }
  // timber frame: posts every bay and at the corners, a brace across the upper bays
  if (bay === 0 || u === length - 1) return pick(m.beam, side)
  if (storey === 1 && !isWindow && Math.floor(u / 5) % 2 === 1 && bay === vf + 1) return pick(m.beam, side)
  return hash(u, v, side === 'L' ? 5 : 6) < 0.08 ? pick([m.plaster[1], m.beam[0]], side) : pick(m.plaster, side)
}

/** A roof pixel: courses of shingles or tiles, light on the left slope. */
function shingle(roof: Shingles, side: Side, up: number, along: number, isHip: boolean): string {
  const [tile, gap, glint] = side === 'L' ? roof.lit : roof.shade
  if (isHip) return glint
  if (up < 0.5) return gap
  const course = Math.floor(up / 1.5)
  if (up % 1.5 < 0.42) return gap
  const slot = Math.floor(along + (course % 2) * 1.5)
  if (slot % 3 === 0 && hash(slot, course, 9) < 0.6) return gap
  return hash(slot, course, 11) < 0.14 ? glint : tile
}

/** A plain plank or post. */
const timber: Paint = () => '#a07448'
const timberShade: Paint = () => '#6e4c2a'

// ── Ground ─────────────────────────────────────────────────────────────────

/** Grass texture: flecks and clumps over whatever lies beneath. */
function grassPattern(): string {
  const dark = new Canvas(64, 32)
  const light = new Canvas(64, 32)
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      const r = hash(x, y, 1)
      if (r < 0.17) dark.set(x, y, '#000')
      else if (r < 0.27) light.set(x, y, '#fff')
      if (hash(x, y, 2) < 0.02) dark.fill(x, y, 2, 2, '#000')
    }
  }
  return `<pattern id="grass" width="64" height="32" patternUnits="userSpaceOnUse"><g opacity="0.17">${dark.svg()}</g><g opacity="0.1">${light.svg()}</g></pattern>`
}

/** An irregular patch, ragged at the edge. */
function blob(c: Canvas, cx: number, cy: number, rx: number, ry: number, seed: number, paint: (x: number, y: number) => string | undefined): void {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
      if (d < 0.72 + hash(x, y, seed) * 0.5) c.set(x, y, paint(x, y))
    }
  }
}

const dirt = (x: number, y: number): string => {
  const r = hash(x, y, 7)
  return r < 0.2 ? DIRT[0] : r < 0.32 ? DIRT[2] : DIRT[1]
}

/** A worn track between two points. */
function track(c: Canvas, from: Point, to: Point, seed: number): void {
  const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]))
  for (let i = 0; i <= steps; i++) {
    const t = i / Math.max(1, steps)
    blob(c, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 2.4, 1.4, seed + i, dirt)
  }
}

/** Tufts of long grass scattered over the meadow. */
function tufts(c: Canvas): void {
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(hash(i, 0, 33) * GW)
    const y = 3 + Math.floor(hash(i, 1, 33) * (GH - 3))
    c.set(x, y, TUFT[0])
    c.set(x - 1, y - 1, TUFT[0])
    c.set(x + 1, y - 1, TUFT[0])
    c.set(x, y - 1, TUFT[1])
    if (hash(i, 2, 33) < 0.4) c.set(x + 1, y - 2, TUFT[1])
  }
}

/** A farm plot: an iso diamond of crop rows and furrows. */
function farm(c: Canvas, cx: number, cy: number, hw: number): void {
  for (let dy = -Math.floor(hw / 2); dy <= Math.floor(hw / 2); dy++) {
    const span = hw - 2 * Math.abs(dy)
    for (let dx = -span; dx < span; dx++) {
      const x = cx + dx
      const y = cy + dy
      const isEdge = dx === -span || dx === span - 1 || Math.abs(dy) === Math.floor(hw / 2)
      const furrow = (((dx + 2 * dy) % 4) + 4) % 4
      const crop = hash(x, y, 13) < 0.2 ? CROP[2] : furrow === 1 ? CROP[0] : CROP[1]
      c.set(x, y, isEdge || furrow === 0 ? SOIL : crop)
    }
  }
}

/** A cast shadow, to the lower right since the light comes from the upper left. */
function shadow(c: Canvas, x: number, y: number, rx: number, ry: number): void {
  blob(c, x + rx * 0.35, y, rx, ry, 41, () => '#000')
}

// ── Scenery ────────────────────────────────────────────────────────────────

type Tree = { x: number; y: number; kind: 'oak' | 'pine'; size: number; isAutumn: boolean }

/** The woods: thick along both edges, plus the world's own trees. */
const FOREST: Tree[] = (() => {
  const trees: Tree[] = []
  const add = (x: number, y: number, seed: number) => {
    const r = hash(x, y, seed)
    trees.push({ x, y, kind: r < 0.42 ? 'pine' : 'oak', size: 0.8 + hash(x, y, seed + 1) * 0.45, isAutumn: r > 0.9 })
  }
  for (let y = 14; y <= 64; y += 7) {
    const shift = (y / 7) % 2 === 0 ? 0 : 5
    for (let x = -3 + shift; x <= 64; x += 10) {
      if (hash(x, y, 3) < 0.12) continue
      add(x + Math.floor(hash(x, y, 4) * 4), y + Math.floor(hash(x, y, 5) * 3), 6)
    }
    for (let x = 442 + shift; x <= 488; x += 10) {
      if (hash(x, y, 8) < 0.12) continue
      add(x + Math.floor(hash(x, y, 9) * 4), y + Math.floor(hash(x, y, 10) * 3), 11)
    }
  }
  for (const t of TREES) {
    const [x, y] = cell(t.at)
    trees.push({ x, y, kind: t.kind, size: t.size, isAutumn: false })
  }
  return trees.sort((a, b) => a.y - b.y)
})()

function oak(c: Canvas, sh: Canvas, t: Tree): void {
  const colors = t.isAutumn ? AUTUMN : OAK
  const r = 5 * t.size + 1.5
  const cy = t.y - 3 - r
  shadow(sh, t.x + 3, t.y, r + 2, 2.2)
  c.fill(t.x - 1, t.y - 5, 3, 5, TRUNK[1])
  c.fill(t.x + 1, t.y - 5, 1, 5, TRUNK[0])
  const lobes: Array<[number, number, number]> = [
    [t.x, cy - r * 0.35, r],
    [t.x - r * 0.62, cy + r * 0.25, r * 0.78],
    [t.x + r * 0.62, cy + r * 0.3, r * 0.74],
  ]
  for (let y = Math.floor(cy - r * 1.5); y <= cy + r * 1.2; y++) {
    for (let x = Math.floor(t.x - r * 1.5); x <= t.x + r * 1.5; x++) {
      const isInside = lobes.some(([lx, ly, lr]) => Math.hypot(x - lx, y - ly) < lr * (0.86 + hash(x, y, 19) * 0.24))
      if (!isInside) continue
      // leaf clusters: light from the upper left, dappled
      const light = -((x - t.x) + (y - cy)) / r + (hash(x >> 1, y >> 1, 21) - 0.5) * 1.1
      c.set(x, y, light > 1 ? colors[4] : light > 0.4 ? colors[3] : light > -0.3 ? colors[2] : light > -0.95 ? colors[1] : colors[0])
    }
  }
}

function pine(c: Canvas, sh: Canvas, t: Tree): void {
  const height = Math.round(17 * t.size + 4)
  shadow(sh, t.x + 3, t.y, 6 * t.size + 1, 2)
  c.fill(t.x - 1, t.y - 3, 2, 3, TRUNK[1])
  const tier = Math.ceil(height / 4)
  for (let i = 0; i < height; i++) {
    const row = t.y - 3 - height + i
    // four tiers, each flaring out a little wider than the last
    const half = Math.floor(0.5 + (i % tier) * 0.6 + (i / height) * 4.8 * t.size)
    for (let dx = -half; dx <= half; dx++) {
      const light = -dx / Math.max(1, half) - (i % tier) / tier + 0.4 + (hash(t.x + dx, row, 27) - 0.5) * 0.7
      c.set(t.x + dx, row, light > 1 ? PINE[4] : light > 0.35 ? PINE[3] : light > -0.3 ? PINE[2] : light > -0.9 ? PINE[1] : PINE[0])
    }
  }
}

const BUSHES: Point[] = [
  [84, 58],
  [186, 58],
  [222, 36],
  [420, 59],
  [318, 12],
  [190, 18],
  [272, 56],
  [104, 14],
]

function bush(c: Canvas, sh: Canvas, [x, y]: Point): void {
  shadow(sh, x + 1, y, 4, 1.4)
  blob(c, x, y - 2, 3.6, 2.4, 51, (px, py) => {
    const light = -((px - x) + (py - y + 2)) / 2.5 + (hash(px, py, 53) - 0.5)
    return light > 0.9 ? OAK[4] : light > 0.1 ? OAK[3] : light > -0.6 ? OAK[2] : OAK[1]
  })
  if (hash(x, y, 55) < 0.5) {
    c.set(x - 1, y - 3, '#d83a2a')
    c.set(x + 1, y - 2, '#d83a2a')
  }
}

function goldMine(c: Canvas, sh: Canvas): void {
  const [x, y] = cell(GOLD_MINE)
  shadow(sh, x + 2, y + 1, 12, 3)
  blob(c, x, y - 1, 10, 4.5, 61, (px, py) => {
    const light = -((px - x) + (py - y + 1) * 2) / 8 + (hash(px, py, 63) - 0.5) * 0.6
    return light > 0.4 ? ROCK[2] : light > -0.3 ? ROCK[1] : ROCK[0]
  })
  const nuggets: Array<[number, number, number]> = [
    [-6, -3, 2.6],
    [1, -5, 3.2],
    [7, -2, 2.4],
    [-2, 0, 2.2],
    [4, 1, 1.8],
    [-8, 1, 1.6],
  ]
  for (const [dx, dy, r] of nuggets) {
    blob(c, x + dx, y + dy, r, r * 0.8, 67 + dx, (px, py) => {
      const light = -((px - x - dx) + (py - y - dy)) / r
      return light > 0.7 ? GOLD[2] : light > -0.4 ? GOLD[1] : GOLD[0]
    })
  }
}

const BARREL = ['nnN', 'kkk', 'nnN', 'nnN', 'kkk']
const CRATE = ['tttT', 'tooT', 'tttT', 'TTTT']
const LOGS = ['.NnNnN', 'NnNnN.', '.NnNnN']

/** Barrels, crates and the woodpile: the clutter of a working town. */
function props(c: Canvas, sh: Canvas, age: number, isTcUp: boolean): void {
  const [wx, wy] = cell(WOOD)
  shadow(sh, wx + 6, wy - 4, 5, 1.4)
  c.stamp(LOGS, wx + 3, wy - 7)
  if (!isTcUp) return
  const spots: Array<[readonly string[], number, number]> = [
    [BARREL, 138, 52],
    [BARREL, 141, 53],
    [CRATE, 160, 53],
    [BARREL, 178, 49],
  ]
  if (age >= 1) spots.push([CRATE, 116, 47], [BARREL, 192, 41])
  for (const [rows, x, y] of spots) {
    shadow(sh, x + 2, y + rows.length, 2.5, 1)
    c.stamp(rows, x, y)
  }
}

/** A watchtower: a stone footing, a timber stage banded in the player's blue, a roof. */
function tower(iso: Iso, sh: Canvas, x: number, y: number, m: Material): void {
  shadow(sh, x + 5, y - 2, 9, 2.5)
  iso.at(x, y)
  const stoneSide = (side: Side): Paint => (u, v) => wall(MATERIALS[2], side, u, v + 1, { length: 6, height: 99, floor: 99, windows: false })
  iso.box(0, 0, 0, 6, 6, 7, stoneSide('L'), stoneSide('R'))
  const stage = (side: Side): Paint => (u, v) => {
    if (v === 5 || v === 6) return pick(m.trim, side)
    if (u === 0 || u === 5 || v === 0 || v === 9) return pick(m.beam, side)
    if (v >= 2 && v <= 3 && u >= 2 && u <= 3) return INK
    return side === 'L' ? '#a07444' : '#7e5630'
  }
  iso.box(-0.5, -0.5, 7, 7, 7, 10, stage('L'), stage('R'))
  iso.roof(-0.5, -0.5, 17, 7, 7, 7, 1.5, (side, up, along, isHip) => shingle(m.roof, side, up, along, isHip))
}

// ── Houses: the tasks ──────────────────────────────────────────────────────

const HOUSE = 10

function house(iso: Iso, ground: Canvas, sh: Canvas, task: TownTask, [x, y]: Point, m: Material, age: number): void {
  iso.at(x, y)
  if (task.status === 'pending') {
    // a staked-out foundation
    for (let i = 0; i <= HOUSE; i += 2) {
      for (const [a, b] of [
        [i, 0],
        [0, i],
        [i, HOUSE],
        [HOUSE, i],
      ] as const) {
        const [px, py] = iso.project(a, b, 0)
        ground.set(px, py, '#e8d098')
      }
    }
    for (const [a, b] of [
      [0, 0],
      [HOUSE, 0],
      [0, HOUSE],
    ] as const) {
      iso.box(a, b, 0, 0.6, 0.6, 2, timber, timberShade)
    }
    return
  }
  const [cx, cy] = iso.project(HOUSE / 2, HOUSE / 2, 0)
  blob(ground, cx, cy + 1, HOUSE + 5, 7, 71 + x, dirt)
  shadow(sh, cx + 6, cy, 13, 5)
  if (task.status === 'in_progress') {
    iso.box(0, 0, 0, HOUSE, HOUSE, 1, () => m.stone[1], () => m.stone[2], () => m.stone[0])
    const frame = (side: Side): Paint => (u, v) => (u % 5 === 0 || v === 3 ? pick(m.beam, side) : undefined)
    iso.box(0, 0, 1, HOUSE, HOUSE, 4, frame('L'), frame('R'))
    for (const [a, b] of [
      [-1, -1],
      [HOUSE, -1],
      [-1, HOUSE],
    ] as const) {
      iso.box(a, b, 0, 0.7, 0.7, 14, () => SCAFFOLD, () => '#a07c42')
    }
    iso.box(-1, -1, 9, 0.6, HOUSE + 1, 0.6, () => SCAFFOLD, () => SCAFFOLD)
    iso.box(-1, -1, 9, HOUSE + 1, 0.6, 0.6, () => SCAFFOLD, () => SCAFFOLD)
    return
  }
  const height = age === 0 ? 8 : 12
  const floor = age === 0 ? 99 : 6
  const side = (s: Side): Paint => (u, v) => wall(m, s, u, v, { length: HOUSE, height, floor, door: true })
  iso.box(0, 0, 0, HOUSE, HOUSE, height, side('L'), side('R'))
  iso.roof(0, 0, height, HOUSE, HOUSE, 7, 1.5, (s, up, along, isHip) => shingle(m.roof, s, up, along, isHip))
  if (hash(x, y, 77) < 0.6) {
    const [bx, by] = iso.project(-2, 7, 0)
    iso.c.stamp(BARREL, bx - 1, by - 5)
  }
}

/** The houses' hover areas, each titled with its task. */
function houseTitles(tasks: readonly TownTask[]): string {
  return visibleTasks(tasks)
    .map((task, i) => {
      const [x, y] = cell(SLOTS[i] ?? [0, 0])
      return `<g><title>${esc(task.subject)}</title><rect x="${x - HOUSE - 2}" y="${y - 30}" width="${HOUSE * 2 + 4}" height="31" fill="#000" fill-opacity="0"/></g>`
    })
    .join('')
}

// ── Town Center ────────────────────────────────────────────────────────────

/**
 * The Town Center's front corner, after the Dark Age one: a two-storey
 * timber-framed hall under a hipped roof, an open shed on posts at each
 * corner, a chimney, barrels by the porch.
 */
const TCX = Math.round(TC[0] / P)
const TCY = Math.round(TC[1] / P) - 6
const HALL = 15
const HALL_H = 15
const HALL_FLOOR = 7
const HALL_RISE = 10
const SHEDS: ReadonlyArray<readonly [number, number]> = [
  [14, 14],
  [-8, 13],
  [13, -8],
]
const SHED = 10
const SHED_H = 7

function townCenter(iso: Iso, m: Material): void {
  iso.at(TCX, TCY)
  const shedRoof = (s: Side, up: number, along: number, isHip: boolean) => shingle(m.stoneFloors >= 2 ? m.roof : WOOD_SHINGLES, s, up, along, isHip)
  for (const [a, b] of SHEDS) {
    // four posts and a roof, open underneath
    for (const [pa, pb] of [
      [0, 0],
      [SHED - 1, 0],
      [0, SHED - 1],
      [SHED - 1, SHED - 1],
    ] as const) {
      iso.box(a + pa, b + pb, 0, 1, 1, SHED_H, timber, timberShade)
    }
    iso.roof(a, b, SHED_H, SHED, SHED, 4, 1.2, shedRoof)
  }
  const side = (s: Side): Paint => (u, v) => wall(m, s, u, v, { length: HALL, height: HALL_H, floor: HALL_FLOOR, door: true })
  iso.box(0, 0, 0, HALL, HALL, HALL_H, side('L'), side('R'))
  // a blue band under the eaves, as the player's colour
  iso.box(-0.3, -0.3, HALL_H - 2, HALL + 0.3, HALL + 0.3, 1, () => m.trim[0], () => m.trim[1])
  iso.roof(0, 0, HALL_H, HALL, HALL, HALL_RISE, 2, (s, up, along, isHip) => shingle(m.roof, s, up, along, isHip))
  // the chimney, stone, through the right slope
  iso.box(10, 3, HALL_H, 2, 2, 11, () => m.stone[1], () => m.stone[2], () => '#2a2420')
  // the porch: two steps up to the door
  iso.box(-2, 2, 0, 2, 4, 1, () => m.stone[0], () => m.stone[1], () => m.stone[0])
}

const flagTop = (iso: Iso): Point => iso.project(HALL / 2, HALL / 2, HALL_H + HALL_RISE + 8)

function flag(town: Town, iso: Iso, now: number): string {
  const [x, y] = flagTop(iso)
  const px = Math.round(x)
  const py = Math.round(y)
  const still = ['bbbbbbB', 'bbbbbbB', 'bbbbbB']
  const waving = ['bbbbbB', 'bbbbbbB', '.bbbbbB']
  const at = (rows: readonly string[]) => spriteCanvas(rows, null).svg(px, py - 1)
  const cloth = town.mood === 'idle' ? at(still) : frames([at(still), at(waving)], 0.8, now)
  return `<path stroke="${INK}" d="M${px} ${py}v8.5"/>${cloth}`
}

function smoke(x: number, y: number, now: number, color: string): string {
  return [0, 1, 2, 3]
    .map(i => {
      const begin = phase(now, 3, i * 0.75)
      const anim = (attr: string, values: string) => `<animate attributeName="${attr}" values="${values}" dur="3s" begin="${begin}" repeatCount="indefinite"/>`
      return `<rect x="${x}" y="${y}" width="2" height="2" fill="${color}">${anim('y', `${y};${y - 16}`)}${anim('x', `${x};${x + 2};${x + 6}`)}${anim('width', '2;4')}${anim('height', '2;4')}${anim('opacity', '0.85;0')}</rect>`
    })
    .join('')
}

const FLAME_A = ['..y..', '.yYy.', 'fyYyf', 'ffyff', 'FfffF', '.FFF.']
const FLAME_B = ['.y...', '..y..', '.yYy.', 'fyYyf', 'FfyfF', '.FFF.']

function fire(town: Town, iso: Iso, now: number): string {
  const spots: Array<[number, number, number]> = [
    [-3, 18, SHED_H + 2],
    [18, -3, SHED_H + 2],
    [4, 6, HALL_H + 4],
    [9, 10, HALL_H + 7],
    [0, 10, 10],
  ]
  // fade the flames out over the last half second of the burn
  const left = Math.max(0, (town.burningUntil - now) / 1000)
  const flames = spots
    .map(([a, b, z], i) => {
      const [x, y] = iso.project(a, b, z).map(Math.round) as [number, number]
      return `<circle cx="${x}" cy="${y - 3}" r="7" fill="#ff8a20" opacity="0.25"/><g transform="translate(${x} ${y})">${frames([sprite(FLAME_A, null), sprite(FLAME_B, null)], 0.3 + i * 0.04, now, i * 0.1)}</g>`
    })
    .join('')
  const [sx, sy] = iso.project(HALL / 2, HALL / 2, HALL_H + HALL_RISE)
  return `<g><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="${left.toFixed(2)}s" fill="freeze"/>${flames}${smoke(Math.round(sx), Math.round(sy), now, '#3a3a3a')}</g>`
}

function bell(x: number, y: number, now: number): string {
  const glow = `<circle cx="${x}" cy="${y}" r="7" fill="#ffd860" opacity="0.3"><animate attributeName="opacity" values="0.35;0;0.35" dur="0.8s" repeatCount="indefinite" begin="${phase(now, 0.8)}"/></circle>`
  const body = sprite(['..o..', '.yyy.', '.yYy.', 'yyyyy', 'yyyyy', '..k..'])
  return `${glow}<g transform="translate(${x} ${y + 4})"><g><animateTransform attributeName="transform" type="rotate" values="-18 0 -7;18 0 -7;-18 0 -7" dur="0.8s" repeatCount="indefinite" begin="${phase(now, 0.8)}"/>${body}</g></g>`
}

function townCenterLayer(town: Town, m: Material, now: number): string {
  const c = new Canvas(GW, GH)
  const iso = new Iso(c)
  townCenter(iso, m)
  const building = c.outline(INK).svg() + flag(town, iso, now)
  const progress = Math.min(1, Math.max(0, (now - (town.tcBuiltAt ?? now)) / BUILD_MS))
  let drawn = building
  if (progress < 1) {
    // rising out of its foundation, scaffolding falling away as it tops out
    const left = ((1 - progress) * BUILD_MS) / 1000
    const bottom = TCY + 6
    const from = bottom - bottom * progress
    const poles = new Canvas(GW, GH)
    const rig = new Iso(poles).at(TCX, TCY)
    for (const [a, b] of [
      [-10, -10],
      [26, -10],
      [-10, 26],
    ] as const) {
      rig.box(a, b, 0, 0.8, 0.8, 30, () => '#d8b878', () => '#b89858')
    }
    for (const z of [10, 20]) {
      rig.box(-10, -10, z, 0.6, 36, 0.6, () => '#c09a5c', () => '#c09a5c')
      rig.box(-10, -10, z, 36, 0.6, 0.6, () => '#c09a5c', () => '#c09a5c')
    }
    drawn = `<clipPath id="rise"><rect x="0" y="${n(from)}" width="${GW}" height="${GH + 2}"><animate attributeName="y" to="-2" dur="${left.toFixed(2)}s" fill="freeze"/></rect></clipPath>
<g clip-path="url(#rise)">${building}</g><g><animate attributeName="opacity" to="0" dur="${left.toFixed(2)}s" fill="freeze"/>${poles.svg()}</g>`
  }
  let effects = ''
  if (town.mood === 'working' && progress >= 1) {
    const [x, y] = iso.project(11, 4, HALL_H + 11)
    effects += smoke(Math.round(x) - 1, Math.round(y) - 3, now, '#d8d8d8')
  }
  if (town.burningUntil > now) effects += fire(town, iso, now)
  if (town.mood === 'permission') {
    const [x, y] = iso.project(-2, 26, SHED_H + 8)
    effects += bell(Math.round(x), Math.round(y), now)
  }
  return `<g>${drawn}${effects}</g>`
}

// ── People ─────────────────────────────────────────────────────────────────

const VILLAGER_TOP = ['..hh..', '..ss..', '.bbbb.', 'sbbbbs', '.bbbb.', '.wwww.']
const STRIDE_A = ['.p..p.', '.p..p.', 'kk..kk']
const STRIDE_B = ['..pp..', '..pp..', '..kk..']

const BODIES: Record<UnitKind, readonly [readonly string[], readonly string[]]> = {
  villager: [
    [...VILLAGER_TOP, ...STRIDE_A],
    [...VILLAGER_TOP, ...STRIDE_B],
  ],
  militia: [
    ['..gg...', '.gggg..', '..ss...', 'rBBBB.G', 'rBBBBsG', 'rBBBB.G', '.wwww..', '.p..p..', '.p..p..', 'kk..kk.'],
    ['..gg...', '.gggg..', '..ss...', 'rBBBB.G', 'rBBBBsG', 'rBBBB.G', '.wwww..', '..pp...', '..pp...', '..kk...'],
  ],
  monk: [
    ['..TT..y', '.TssT.o', '.tbbt.o', 'sttttso', '.tttt.o', '.tttt.o', 'tttttto', 'tttttt.'],
    ['..TT..y', '.TssT.o', '.tbbt.o', 'sttttso', '.tttt.o', '.tttt.o', '.ttttto', 'tttttt.'],
  ],
  scout: [
    ['....gg......', '....ss......', '...bbbb...nn', '...bbbb..nnn', '..nnBBnnnnN.', 'Nnnnnnnnnn..', 'N.nnnnnnnn..', '..N.N..N.N..', '..N..N.N..N.'],
    ['....gg......', '....ss......', '...bbbb...nn', '...bbbb..nnn', '..nnBBnnnnN.', 'Nnnnnnnnnn..', 'N.nnnnnnnn..', '...NN...NN..', '...NN...NN..'],
  ],
}

function figure(kind: UnitKind, now: number, offset = 0): string {
  const [a, b] = BODIES[kind]
  return frames([sprite(a), sprite(b)], kind === 'scout' ? 0.3 : 0.4, now, offset)
}

const LOAD = { wood: `<g transform="translate(-3 -6)">${sprite(['oooo'])}</g>`, gold: `<g transform="translate(-3 -6)">${sprite(['yy', 'yy'])}</g>` }

/** A unit walking its loop: SMIL moves it, flips it and swaps its load. */
function walker(walk: Walk, body: string, now: number, offset: number, title?: string): string {
  const points = walk.points.map(grid)
  const path = `M${points.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')}`
  const begin = phase(now, walk.seconds, offset)
  // which way each leg of the loop heads, as a discrete scale animation
  let total = 0
  const lengths: number[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] ?? [0, 0]
    const b = points[i] ?? a
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    lengths.push(length)
    total += length
  }
  let walked = 0
  const times: string[] = []
  const flips: string[] = []
  lengths.forEach((length, i) => {
    const a = points[i] ?? [0, 0]
    const b = points[i + 1] ?? a
    times.push((walked / Math.max(total, 0.001)).toFixed(4))
    flips.push(b[0] < a[0] ? '-1 1' : '1 1')
    walked += length
  })
  const load =
    walk.carries === undefined
      ? ''
      : `<g opacity="0">${LOAD[walk.carries]}<animate attributeName="opacity" values="0;1" keyTimes="0;0.5" calcMode="discrete" dur="${walk.seconds}s" begin="${begin}" repeatCount="indefinite"/></g>`
  return `<g>${title === undefined ? '' : `<title>${esc(title)}</title>`}<animateMotion path="${path}" dur="${walk.seconds}s" begin="${begin}" repeatCount="indefinite" calcMode="paced"/>
<g><animateTransform attributeName="transform" type="scale" values="${flips.join(';')}" keyTimes="${times.join(';')}" calcMode="discrete" dur="${walk.seconds}s" begin="${begin}" repeatCount="indefinite"/>${body}${load}</g></g>`
}

function unitSvg(unit: TownUnit, now: number): string {
  if (unit.doneAt !== null) {
    const from = grid(homewardAt(unit, unit.doneAt))
    const here = grid(homewardAt(unit, now))
    const door = grid(DOOR)
    const left = Math.max(0.05, (HOMEWARD_MS - (now - unit.doneAt)) / 1000)
    const isLeft = door[0] < from[0]
    return `<g transform="translate(${n(here[0])} ${n(here[1])})"><animateTransform attributeName="transform" type="translate" to="${n(door[0])} ${n(door[1])}" dur="${left.toFixed(2)}s" fill="freeze"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.8;1" dur="${left.toFixed(2)}s" fill="freeze"/><g transform="scale(${isLeft ? -1 : 1} 1)">${figure(unit.kind, now)}</g></g>`
  }
  return walker(unitWalk(unit), figure(unit.kind, now, unit.slot * 0.13), now, unit.slot * 1.7, unit.label)
}

const BUILDER_UP = ['..hh..g', '..ss..o', '.bbbbso', 'sbbbb..', '.bbbb..', '.wwww..', '.p..p..', '.p..p..', 'kk..kk.']
const BUILDER_DOWN = ['..hh....', '..ss....', '.bbbb...', 'sbbbbsoo', '.bbbb..g', '.wwww...', '.p..p...', '.p..p...', 'kk..kk..']

/** A villager hammering at each house going up. */
function builders(tasks: readonly TownTask[], now: number): string {
  return visibleTasks(tasks)
    .map((task, i) => {
      if (task.status !== 'in_progress') return ''
      const [x, y] = cell(SLOTS[i] ?? [0, 0])
      return `<g transform="translate(${x - HOUSE - 4} ${y})">${frames([sprite(BUILDER_UP), sprite(BUILDER_DOWN)], 0.5, now, i * 0.2)}</g>`
    })
    .join('')
}

function wololo(now: number): string {
  const x = TCX + 42
  const y = TCY + 10
  const rings = [0, 1, 2]
    .map(i => {
      const begin = phase(now, 1.5, i * 0.5)
      return `<circle cx="${x}" cy="${y - 6}" r="3" fill="none" stroke-width="1"><animate attributeName="r" values="3;16" dur="1.5s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1.5s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="stroke" values="${PLAYER};#d8282a;#e8c040;${PLAYER}" calcMode="discrete" dur="1.5s" begin="${begin}" repeatCount="indefinite"/></circle>`
    })
    .join('')
  const chant = ['..TT..y', '.TssT.o', '.tbbt.o', 'sttttso', '.tttt.o', '.tttt.o', 'tttttt.', 'tttttt.']
  const raised = ['..TT.y.', '.TssTo.', '.tbbtos', 'stttt..', '.tttt..', '.tttt..', 'tttttt.', 'tttttt.']
  return `${rings}<g transform="translate(${x} ${y}) scale(-1 1)">${frames([sprite(chant), sprite(raised)], 0.6, now)}</g>
<text x="${x}" y="${y - 18}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="bold" font-size="6" fill="#ffe680" stroke="#3a2808" stroke-width="1.3" paint-order="stroke">Wololo!<animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite"/></text>`
}

function sparkles(now: number): string {
  const [x, y] = cell(GOLD_MINE)
  return [
    [x + 1, y - 7, 2.4, 0],
    [x - 6, y - 4, 3.1, 1.2],
    [x + 7, y - 3, 2.7, 0.6],
  ]
    .map(([sx, sy, dur, off]) => `<rect x="${sx}" y="${sy}" width="1" height="1" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="${dur}s" begin="${phase(now, dur ?? 1, off)}" repeatCount="indefinite"/></rect>`)
    .join('')
}

/** The one stat worth shouting over the scene: context nearly full. */
function warning(town: Town): string {
  if ((town.contextPercent ?? 0) < 90) return ''
  return `<text x="${WORLD_W / 2 + 60}" y="18" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="13" fill="#ff8a6a" stroke="#2a0a04" stroke-width="2.5" paint-order="stroke">You need to build more houses!<animate attributeName="opacity" values="1;0.6;1" dur="1.6s" repeatCount="indefinite"/></text>`
}

// ── The whole document ─────────────────────────────────────────────────────

export function townSvg(town: Town, now: number): string {
  const m = materialFor(town.age)
  const tasks = visibleTasks(town.tasks)
  const isTcUp = town.tcBuiltAt !== null

  const meadow = new Canvas(GW, GH)
  for (const [x, y, rx, ry, color] of [
    [105, 14, 34, 9, MEADOW_LIGHT],
    [285, 44, 45, 10, MEADOW_LIGHT],
    [372, 18, 40, 8, MEADOW_DARK],
    [210, 60, 36, 7, MEADOW_DARK],
    [420, 50, 26, 9, MEADOW_LIGHT],
    [250, 8, 30, 6, MEADOW_LIGHT],
  ] as const) {
    blob(meadow, x, y, rx, ry, 81 + x, () => color)
  }

  const ground = new Canvas(GW, GH)
  const shade = new Canvas(GW, GH)
  const scenery = new Canvas(GW, GH)
  const builds = new Iso(scenery)
  tufts(ground)
  const door = cell(DOOR)
  const [gx, gy] = cell(GOLD_MINE)
  track(ground, door, cell(WOOD), 91)
  track(ground, door, [gx + 6, gy + 3], 93)
  if (isTcUp) {
    blob(ground, TCX + 2, TCY - 8, 44, 17, 95, dirt)
    shadow(shade, TCX + 12, TCY - 6, 34, 10)
    // the shade under each shed's roof
    const tc = new Iso(shade).at(TCX, TCY)
    for (const [a, b] of SHEDS) {
      const [sx, sy] = tc.project(a + SHED / 2, b + SHED / 2, 0)
      blob(shade, sx, sy, 8, 4, 99, () => '#000')
    }
  }
  if (town.age >= 1) {
    blob(ground, 206, 49, 21, 8, 97, dirt)
    farm(ground, 206, 49, 18)
  }

  goldMine(scenery, shade)
  for (const b of BUSHES) bush(scenery, shade, b)
  props(scenery, shade, town.age, isTcUp)
  tasks.forEach((task, i) => house(builds, ground, shade, task, cell(SLOTS[i] ?? [0, 0]), m, town.age))
  if (town.age >= 1) tower(builds, shade, 425, 54, m)
  const woods = new Canvas(GW, GH)
  for (const t of FOREST) (t.kind === 'oak' ? oak : pine)(woods, shade, t)

  const people = [
    ...town.units.map(unit => unitSvg(unit, now)),
    walker(homeVillagerWalk(town), figure('villager', now), now, 0, 'Your villager'),
  ].join('')

  const scene = [
    `<rect width="${GW}" height="${GH}" fill="${GRASS}"/>`,
    meadow.svg(),
    `<rect width="${GW}" height="${GH}" fill="url(#grass)"/>`,
    ground.svg(),
    `<g opacity="0.3">${shade.svg()}</g>`,
    scenery.outline(INK).svg(),
    woods.outline('#0c1a08').svg(),
    isTcUp ? townCenterLayer(town, m, now) : '',
    sparkles(now),
    builders(town.tasks, now),
    houseTitles(town.tasks),
    people,
    town.mood === 'permission' ? wololo(now) : '',
  ].join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORLD_W} ${WORLD_H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="display:block;background:${GRASS}" shape-rendering="crispEdges"><defs>${grassPattern()}</defs><g transform="scale(${P})" fill="none">${scene}</g>${warning(town)}</svg>`
}
