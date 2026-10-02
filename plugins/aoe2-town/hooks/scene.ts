// The town, drawn as pixels: one framebuffer, read out as terminal Raster
// cells (two pixels a cell, upper and lower half) or as SVG rects.
import type { Town, TownTask, TownUnit, UnitKind } from '../types'

export const WIDTH = 38
export const HEIGHT = 40
/** Terminal rows the scene takes: two pixels a row. */
export const ROWS = HEIGHT / 2

/** The terminal's own color: what the void around the map draws as. */
export const VOID = 0x01000000

const PLAYER = 0x2f5fe0
const PLAYER_DARK = 0x1f3f9a
const SKIN = 0xe2b48a
const LEGS = 0x4a3020
const GOLD = 0xe8c040
const SHADOW = 0x3a5e24

/** The base front vertices of the house slots tasks are built on. */
export const SLOTS: ReadonlyArray<readonly [number, number]> = [
  [9, 29],
  [29, 29],
  [14, 34],
  [24, 34],
  [19, 38],
  [4, 34],
  [34, 34],
]

const TC_X = 19
const TC_Y = 23
const DOOR: Point = [15, 24]
const WOOD: Point = [9, 22]
const GOLD_SITE: Point = [29, 21]

type Point = readonly [number, number]

type AgePalette = {
  wallL: number
  wallR: number
  roofL: number
  roofR: number
  trim: number
}

const AGES: [AgePalette, AgePalette, AgePalette, AgePalette] = [
  // Dark Age: timber and thatch
  { wallL: 0x9c7448, wallR: 0x7d5a36, roofL: 0x8a6a38, roofR: 0x6a4e28, trim: 0x5a3c22 },
  // Feudal Age: plaster and red tile
  { wallL: 0xdccca6, wallR: 0xb4a482, roofL: 0xb8522e, roofR: 0x8e3c22, trim: 0x6a4a2a },
  // Castle Age: stone and slate
  { wallL: 0xb0aea4, wallR: 0x8a887e, roofL: 0x4e6290, roofR: 0x3a4a72, trim: 0x5a5a56 },
  // Imperial Age: white stone, blue roofs, gold trim
  { wallL: 0xeee6d0, wallR: 0xc8c0a8, roofL: 0x3a6ab8, roofR: 0x2a508e, trim: GOLD },
]

export const AGE_NAMES = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'] as const

export function ageName(age: number): string {
  return AGE_NAMES[Math.max(0, Math.min(3, age))] ?? AGE_NAMES[0]
}

function agePalette(age: number): AgePalette {
  return AGES[Math.max(0, Math.min(3, age))] ?? AGES[0]
}

class Canvas {
  readonly px = new Uint32Array(WIDTH * HEIGHT).fill(VOID)

  set(x: number, y: number, color: number) {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= WIDTH || iy >= HEIGHT) return
    this.px[iy * WIDTH + ix] = color
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return VOID
    return this.px[y * WIDTH + x] ?? VOID
  }

  column(x: number, from: number, to: number, color: number) {
    for (let y = Math.round(from); y <= Math.round(to); y++) this.set(x, y, color)
  }

  /** A sprite of one-letter rows, `.` transparent, anchored at its feet's center. */
  sprite(x: number, y: number, rows: readonly string[], palette: Record<string, number>, isMirrored = false) {
    const w = rows[0]?.length ?? 0
    const left = Math.round(x) - Math.floor(w / 2)
    const top = Math.round(y) - rows.length + 1
    rows.forEach((row, r) => {
      for (let c = 0; c < w; c++) {
        const ch = row[isMirrored ? w - 1 - c : c]
        const color = ch === undefined ? undefined : palette[ch]
        if (color !== undefined) this.set(left + c, top + r, color)
      }
    })
  }
}

// ── Ground ───────────────────────────────────────────────────────────────────

const GROUND_X = 19
const GROUND_Y = 25
const GROUND_A = 34
const GROUND_B = 17

function onGround(x: number, y: number): number {
  return Math.abs(x - GROUND_X) / GROUND_A + Math.abs(y - GROUND_Y) / GROUND_B
}

function drawGround(c: Canvas) {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const d = onGround(x, y)
      if (d <= 1) {
        const isDither = (x * 7 + y * 13) % 11 === 0 || (x + y * 3) % 17 === 0
        const isEdge = d > 0.94
        c.set(x, y, isEdge ? 0x6c9c3c : isDither ? 0x48742a : 0x58883a)
      } else if (y > GROUND_Y) {
        // cliff face under the near edges, two pixels deep
        const above1 = onGround(x, y - 1) <= 1
        const above2 = onGround(x, y - 2) <= 1
        if (above1) c.set(x, y, 0x7a5232)
        else if (above2) c.set(x, y, 0x55381f)
      }
    }
  }
}

// ── Iso blocks ───────────────────────────────────────────────────────────────

type Block = {
  /** front (lowest) vertex of the footprint */
  x: number
  y: number
  /** half the footprint's width */
  w: number
  wall: number
  roof: number
  wallL: number
  wallR: number
  roofL: number
  roofR: number
}

function drawBlock(c: Canvas, b: Block) {
  const apexY = b.y - b.w / 2 - b.wall - b.roof
  for (let dx = -b.w; dx <= b.w; dx++) {
    const ad = Math.abs(dx)
    const x = b.x + dx
    const bottom = b.y - Math.floor(ad / 2)
    const wallTop = bottom - b.wall + 1
    if (b.wall > 0) c.column(x, wallTop, bottom, dx < 0 ? b.wallL : b.wallR)
    const roofTop = b.roof > 0 ? apexY + (ad * b.roof) / b.w : b.y - b.w - b.wall + Math.floor(ad / 2) + 1
    c.column(x, roofTop, wallTop - 1, dx < 0 ? b.roofL : b.roofR)
  }
}

// ── Scenery ─────────────────────────────────────────────────────────────────

const TREE = ['..g..', '.gGg.', 'gGgGg', '.gGg.', 'gGgGg', '..t..', '..t..']
const TREE_COLORS = { g: 0x1f4214, G: 0x33662a, t: 0x4a2e18 }

const GOLD_PILE = ['..y..', '.yYy.', 'yYoYy']
const GOLD_COLORS = { y: 0xb08820, Y: 0xe8c040, o: 0xfff080 }

function scenery(): Drawable[] {
  const trees: Point[] = [
    [2, 21],
    [5, 19],
    [8, 17],
    [3, 25],
    [6, 23],
  ]
  return [
    ...trees.map(([x, y]): Drawable => ({ y, draw: c => c.sprite(x, y, TREE, TREE_COLORS) })),
    { y: 19, draw: c => c.sprite(31, 19, GOLD_PILE, GOLD_COLORS) },
    { y: 22, draw: c => c.sprite(34, 22, GOLD_PILE, GOLD_COLORS) },
  ]
}

// ── Town Center ──────────────────────────────────────────────────────────────

function townCenter(town: Town, frame: number, now: number): Drawable {
  return {
    y: TC_Y,
    draw: c => {
      const p = agePalette(town.age)
      // the wide base with its flat terrace
      drawBlock(c, { x: TC_X, y: TC_Y, w: 9, wall: 4, roof: 0, wallL: p.wallL, wallR: p.wallR, roofL: p.trim, roofR: p.trim })
      // arcade openings along the base
      for (const dx of [-7, -4, 4, 7]) {
        const x = TC_X + dx
        const bottom = TC_Y - Math.floor(Math.abs(dx) / 2)
        c.column(x, bottom - 2, bottom, 0x3a2818)
      }
      // door
      c.column(DOOR[0], DOOR[1] - 4, DOOR[1] - 1, 0x2a1a10)
      c.column(DOOR[0] + 1, DOOR[1] - 4, DOOR[1] - 2, 0x2a1a10)
      // the central hall and its roof
      const hallY = TC_Y - 9 / 2 - 4 + 5 / 2
      drawBlock(c, { x: TC_X, y: hallY, w: 5, wall: 4, roof: 5, wallL: p.wallL, wallR: p.wallR, roofL: p.roofL, roofR: p.roofR })
      c.set(TC_X - 2, hallY - 3, 0x2a1a10)
      c.set(TC_X + 2, hallY - 3, 0x2a1a10)
      // flag on the ridge, waving while work goes on
      const top = Math.round(hallY - 5 / 2 - 4 - 5)
      c.column(TC_X, top - 4, top, 0x4a3a2a)
      const isWaving = town.mood !== 'idle' && frame % 2 === 1
      const flag = isWaving ? ['bb.', '.bb'] : ['bbb', 'bbb']
      c.sprite(TC_X + 2, top - 3, flag, { b: PLAYER })
      if (town.age >= 3) c.set(TC_X, top - 5, GOLD)

      if (town.mood === 'working') smoke(c, TC_X + 3, top + 3, frame, [0xc8c8c8, 0xa8a8a8, 0x888888])
      if (town.burningUntil > now) fire(c, frame)
      if (town.mood === 'permission') bell(c, frame, top)
    },
  }
}

function smoke(c: Canvas, x: number, y: number, frame: number, shades: number[]) {
  for (let i = 0; i < 3; i++) {
    const rise = (frame + i * 3) % 9
    const drift = Math.round(Math.sin((frame + i * 5) / 2) * 0.8) + Math.floor(rise / 3)
    const shade = shades[Math.min(shades.length - 1, Math.floor(rise / 3))] ?? VOID
    c.set(x + drift, y - rise, shade)
    if (rise < 5) c.set(x + drift + 1, y - rise, shade)
  }
}

const FLAMES: Point[] = [
  [12, 18],
  [25, 18],
  [17, 13],
  [22, 14],
  [10, 21],
]

function fire(c: Canvas, frame: number) {
  const tongues = [0xffe060, 0xff9020, 0xe84010] as const
  FLAMES.forEach(([x, y], i) => {
    const h = 1 + ((frame + i) % 3)
    for (let k = 0; k < h; k++) c.set(x, y - k, tongues[(k + frame + i) % 3] ?? tongues[0])
    c.set(x + ((frame + i) % 2), y - h, tongues[0])
  })
  smoke(c, 21, 9, frame, [0x5a5a5a, 0x3e3e3e, 0x2a2a2a])
}

function bell(c: Canvas, frame: number, top: number) {
  if (frame % 2 === 1) return
  c.sprite(TC_X - 5, top - 1, ['.y.', 'yYy', 'yYy', 'y.y'], { y: 0xc89820, Y: 0xfff080 })
}

// ── Houses: the tasks ───────────────────────────────────────────────────────

function house(task: TownTask, slot: Point, town: Town, frame: number): Drawable {
  const [x, y] = slot
  return {
    y,
    draw: c => {
      const p = agePalette(town.age)
      if (task.status === 'pending') {
        // the foundation: a dashed outline on the grass
        for (let dx = -3; dx <= 3; dx++) {
          if ((dx + 3) % 2 === 1) continue
          const ad = Math.abs(dx)
          c.set(x + dx, y - Math.floor(ad / 2), 0xd8c088)
          c.set(x + dx, y - 3 + Math.floor(ad / 2), 0xd8c088)
        }
        return
      }
      if (task.status === 'in_progress') {
        const wall = 1 + (Math.floor(frame / 3) % 3)
        drawBlock(c, { x, y, w: 3, wall, roof: 0, wallL: 0xb88a50, wallR: 0x946a3a, roofL: 0xc89a60, roofR: 0xa87a48 })
        // scaffolding poles at the corners
        c.column(x - 3, y - 6, y - 1, 0xe0c080)
        c.column(x + 3, y - 6, y - 1, 0xe0c080)
        c.column(x, y - 5, y, 0xe0c080)
        // the builder, hammering
        const isUp = frame % 2 === 0
        c.sprite(x - 5, y + 1, isUp ? ['.s.h', 'TTT.', '.T..', 'l.l.'] : ['.s..', 'TTTh', '.T..', 'l.l.'], {
          s: SKIN,
          T: PLAYER,
          l: LEGS,
          h: 0x8a8a8a,
        })
        return
      }
      drawBlock(c, { x, y, w: 3, wall: 3, roof: 3, wallL: p.wallL, wallR: p.wallR, roofL: p.roofL, roofR: p.roofR })
      c.column(x - 1, y - 2, y - 1, 0x2a1a10)
    },
  }
}

// ── Units: the subagents ────────────────────────────────────────────────────

const UNIT_SPRITES: Record<UnitKind, { rows: string[][]; palette: Record<string, number> }> = {
  villager: {
    rows: [
      ['.s.', 'TTT', '.T.', 'l.l'],
      ['.s.', 'TTT', '.T.', '.l.'],
    ],
    palette: { s: SKIN, T: PLAYER, l: LEGS },
  },
  scout: {
    rows: [
      ['..b..', '.hbhH', 'hhhh.', 'l.l.l'],
      ['..b..', '.hbhH', 'hhhh.', '.l.l.'],
    ],
    palette: { b: PLAYER, h: 0x8a5a30, H: 0x6a4020, l: 0x4a2a14 },
  },
  monk: {
    rows: [
      ['.s.y', 'RRRt', 'RbRt', 'RRRt'],
      ['.s.y', 'RRRt', 'RbRt', '.R.t'],
    ],
    palette: { s: SKIN, R: 0xc89a5a, b: PLAYER, t: 0x6a4a2a, y: GOLD },
  },
  militia: {
    rows: [
      ['.m.', 'TTTw', '.T.w', 'l.l.'],
      ['.m.', 'TTTw', '.T.w', '.l..'],
    ],
    palette: { m: 0xa0a0a8, T: PLAYER_DARK, l: LEGS, w: 0xd8d8e0 },
  },
}

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Where a unit at work stands this frame, and whether it carries a load. */
function workPosition(unit: TownUnit, frame: number): { at: Point; load: number | null } {
  const phase = frame + unit.slot * 5
  if (unit.kind === 'scout') {
    // scouting: a wide loop around the town
    const angle = phase / 6
    return { at: [19 + Math.cos(angle) * 14, 27 + Math.sin(angle) * 7], load: null }
  }
  if (unit.kind === 'monk') {
    const t = (Math.sin(phase / 5) + 1) / 2
    return { at: lerp([13, 28], [24, 28], t), load: null }
  }
  if (unit.kind === 'militia') {
    const t = (Math.sin(phase / 4) + 1) / 2
    return { at: lerp([9, 32], [29, 32], t), load: null }
  }
  // villagers shuttle between the door and their resource
  const site = unit.slot % 2 === 0 ? WOOD : GOLD_SITE
  const trip = 16
  const step = phase % (trip * 2)
  const isReturning = step >= trip
  const t = isReturning ? 1 - (step - trip) / trip : step / trip
  return { at: lerp(DOOR, site, Math.min(1, t * 1.15)), load: isReturning ? (site === WOOD ? 0x8a5a30 : GOLD) : null }
}

function unitDrawable(unit: TownUnit, frame: number, now: number): Drawable {
  let at = workPosition(unit, frame).at
  let load = workPosition(unit, frame).load
  if (unit.doneAt !== null) {
    // done: walk home to the Town Center over a few seconds
    const t = Math.min(1, (now - unit.doneAt) / 3000)
    at = lerp(at, DOOR, t)
    load = unit.kind === 'villager' ? GOLD : null
  }
  const prev = workPosition(unit, frame - 1).at
  const isMirrored = at[0] < prev[0]
  const sprite = UNIT_SPRITES[unit.kind]
  return {
    y: at[1],
    draw: c => {
      c.set(at[0] - 1, at[1] + 1, SHADOW)
      c.set(at[0], at[1] + 1, SHADOW)
      c.set(at[0] + 1, at[1] + 1, SHADOW)
      c.sprite(at[0], at[1], sprite.rows[frame % 2] ?? [], sprite.palette, isMirrored)
      if (load !== null) c.set(at[0] + (isMirrored ? 1 : -1), at[1] - 4, load)
    },
  }
}

function permissionMonk(frame: number): Drawable {
  // a monk at the door, staff raised: "Wololo"
  const rows = frame % 2 === 0 ? ['...y', '.s.t', 'RRRt', 'RbR.', 'RRR.'] : ['....', '.s.y', 'RRRt', 'RbRt', 'RRR.']
  return {
    y: DOOR[1] + 2,
    draw: c => c.sprite(DOOR[0] - 3, DOOR[1] + 2, rows, { s: SKIN, R: 0xc89a5a, b: PLAYER, t: 0x6a4a2a, y: GOLD }),
  }
}

// ── The whole scene ─────────────────────────────────────────────────────────

type Drawable = { y: number; draw: (c: Canvas) => void }

/** Draws the town for one animation frame; `now` in ms since the epoch. */
export function drawTown(town: Town, frame: number, now: number): Uint32Array {
  const c = new Canvas()
  drawGround(c)
  const items: Drawable[] = [
    ...scenery(),
    townCenter(town, frame, now),
    ...visibleTasks(town.tasks).map((task, i) => house(task, SLOTS[i] ?? [19, 38], town, frame)),
    ...town.units.map(unit => unitDrawable(unit, frame, now)),
  ]
  if (town.mood === 'permission') items.push(permissionMonk(frame))
  items.sort((a, b) => a.y - b.y).forEach(item => item.draw(c))
  return c.px
}

/** The tasks that get a house: the latest ones, as many as there are slots. */
export function visibleTasks(tasks: readonly TownTask[]): TownTask[] {
  return tasks.slice(-SLOTS.length)
}

/** Whether anything in the town moves, so the clock needs to tick. */
export function isAnimated(town: Town, now: number): boolean {
  return (
    town.mood !== 'idle' ||
    town.units.length > 0 ||
    town.burningUntil > now ||
    town.tasks.some(task => task.status === 'in_progress')
  )
}

// ── Output ───────────────────────────────────────────────────────────────────

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

/** The pixels as Raster cells: base64 of `[codePoint, fg, bg]` u32 triplets. */
export function toRasterCells(px: Uint32Array): string {
  const words = new Uint32Array(WIDTH * ROWS * 3)
  for (let row = 0; row < ROWS; row++) {
    for (let x = 0; x < WIDTH; x++) {
      const top = px[row * 2 * WIDTH + x] ?? VOID
      const bottom = px[(row * 2 + 1) * WIDTH + x] ?? VOID
      const i = (row * WIDTH + x) * 3
      if (top === bottom) {
        words.set([SPACE, VOID, top], i)
      } else if (top === VOID) {
        words.set([LOWER_HALF, bottom, VOID], i)
      } else {
        words.set([UPPER_HALF, top, bottom], i)
      }
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}

/** The pixels as an SVG document, one rect per run of a color. */
export function toSvg(px: Uint32Array, scale: number): string {
  const rects: string[] = []
  for (let y = 0; y < HEIGHT; y++) {
    let x = 0
    while (x < WIDTH) {
      const color = px[y * WIDTH + x] ?? VOID
      let end = x + 1
      while (end < WIDTH && px[y * WIDTH + end] === color) end++
      if (color !== VOID) {
        rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="#${color.toString(16).padStart(6, '0')}"/>`)
      }
      x = end
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * scale}" height="${HEIGHT * scale}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}" shape-rendering="crispEdges">${rects.join('')}</svg>`
  )
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? B64.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? B64.charAt(n & 63) : '='
  }
  return out
}
