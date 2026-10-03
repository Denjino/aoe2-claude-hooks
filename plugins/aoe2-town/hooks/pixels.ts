// The town as pixels for the terminal: the same layout as the SVG, drawn
// small into a strip of Raster cells, two pixels a cell (upper and lower
// half blocks), redrawn by the clock.
import type { Town, TownTask, TownUnit, UnitKind } from '../types'
import type { Point } from './world'
import { DOOR, GOLD_MINE, SLOTS, TC, TREES, WORLD_H, WORLD_W, homeVillagerWalk, homewardAt, tcProgress, unitWalk, visibleTasks, walkAt } from './world'

/** Terminal rows the strip takes. */
export const STRIP_ROWS = 10
const H = STRIP_ROWS * 2

/** The terminal's own color: drawn where nothing is. */
export const VOID = 0x01000000

const PLAYER = 0x2f5fe0
const PLAYER_DARK = 0x1f3f9a
const SKIN = 0xe2b48a
const LEGS = 0x4a3020
const GOLD = 0xe8c040

type Age = { wallL: number; wallR: number; roofL: number; roofR: number; base: number; baseDark: number }
const AGES: [Age, Age, Age, Age] = [
  { wallL: 0x9c7448, wallR: 0x7d5a36, roofL: 0x8a6a38, roofR: 0x6a4e28, base: 0x8a7a64, baseDark: 0x655845 },
  { wallL: 0xdccca6, wallR: 0xb4a482, roofL: 0xb8522e, roofR: 0x8e3c22, base: 0xa49a88, baseDark: 0x7a7062 },
  { wallL: 0xb0aea4, wallR: 0x8a887e, roofL: 0x4e6290, roofR: 0x3a4a72, base: 0xa8a498, baseDark: 0x7c786c },
  { wallL: 0xeee6d0, wallR: 0xc8c0a8, roofL: 0x3a6ab8, roofR: 0x2a508e, base: 0xd8d0bc, baseDark: 0xaaa28e },
]

class Canvas {
  readonly px: Uint32Array
  constructor(readonly width: number) {
    this.px = new Uint32Array(width * H).fill(VOID)
  }

  set(x: number, y: number, color: number) {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= H) return
    this.px[iy * this.width + ix] = color
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

type Block = { x: number; y: number; w: number; wall: number; roof: number; wallL: number; wallR: number; roofL: number; roofR: number }

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

const TREE = ['.g.', 'gGg', 'GgG', '.t.']
const PINE = ['.g.', '.G.', 'gGg', '.t.']
const TREE_COLORS = { g: 0x1f4214, G: 0x33662a, t: 0x4a2e18 }

const UNIT_SPRITES: Record<UnitKind, { rows: string[][]; palette: Record<string, number> }> = {
  villager: { rows: [['.s.', 'TTT', 'l.l'], ['.s.', 'TTT', '.l.']], palette: { s: SKIN, T: PLAYER, l: LEGS } },
  scout: { rows: [['.b..', 'hbhH', 'l.l.'], ['.b..', 'hbhH', '.l.l']], palette: { b: PLAYER, h: 0x8a5a30, H: 0x6a4020, l: 0x4a2a14 } },
  monk: { rows: [['.s.y', 'RRRt', 'RRRt'], ['.s.y', 'RRRt', '.R.t']], palette: { s: SKIN, R: 0xc89a5a, t: 0x6a4a2a, y: GOLD } },
  militia: { rows: [['.m.w', 'TTTw', 'l.l.'], ['.m.w', 'TTTw', '.l..']], palette: { m: 0xa0a0a8, T: PLAYER_DARK, l: LEGS, w: 0xd8d8e0 } },
}

/** Draws the strip `width` cells wide at a moment (ms since the epoch). */
export function drawStrip(town: Town, now: number, width: number): Uint32Array {
  const c = new Canvas(width)
  const sx = width / WORLD_W
  const sy = H / WORLD_H
  const map = ([x, y]: Point): Point => [x * sx, y * sy]
  const frame = Math.floor(now / 300)
  const age = AGES[Math.max(0, Math.min(3, town.age))] ?? AGES[0]

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < width; x++) {
      const isDither = (x * 7 + y * 13) % 11 === 0 || (x + y * 3) % 17 === 0
      c.set(x, y, isDither ? 0x48742a : 0x58883a)
    }
  }

  type Item = { y: number; draw: () => void }
  const items: Item[] = []
  for (const t of TREES) {
    const [x, y] = map(t.at)
    items.push({ y, draw: () => c.sprite(x, y, t.kind === 'pine' ? PINE : TREE, TREE_COLORS) })
  }
  {
    const [x, y] = map(GOLD_MINE)
    items.push({ y, draw: () => c.sprite(x, y, ['.Y.', 'yYo'], { y: 0xb08820, Y: GOLD, o: 0xfff080 }) })
  }

  const progress = tcProgress(town, now)
  if (progress > 0) {
    const [x, y] = map(TC)
    items.push({
      y,
      draw: () => {
        const full = 4
        drawBlock(c, { x, y, w: 6, wall: 2, roof: 0, wallL: age.base, wallR: age.baseDark, roofL: age.baseDark, roofR: age.baseDark })
        const hallY = y - 3 - 2 + 2
        const hallWall = Math.max(1, Math.round(2 * Math.min(1, progress * 2)))
        const roof = progress < 0.5 ? 0 : Math.round(full * (progress - 0.5) * 2)
        drawBlock(c, { x, y: hallY, w: 4, wall: hallWall, roof, wallL: age.wallL, wallR: age.wallR, roofL: age.roofL, roofR: age.roofR })
        c.column(DOOR[0] * sx, y - 2, y - 1, 0x2a1a10)
        if (progress < 1) {
          c.column(x - 6, y - 8, y - 3, 0xe0c080)
          c.column(x + 6, y - 8, y - 3, 0xe0c080)
          return
        }
        const top = Math.round(hallY - 2 - hallWall - full)
        c.column(x, top - 3, top, 0x4a3a2a)
        c.set(x + 1, top - 3, PLAYER)
        c.set(x + 2, top - 3 + (town.mood !== 'idle' && frame % 2 ? 1 : 0), PLAYER)
        if (town.mood === 'working') {
          for (let i = 0; i < 3; i++) {
            const rise = (frame + i * 2) % 6
            c.set(x + 3 + Math.floor(rise / 2), top - rise, rise < 3 ? 0xc8c8c8 : 0x8a8a8a)
          }
        }
        if (town.mood === 'permission' && frame % 2 === 0) c.sprite(x + 6, top + 1, ['y', 'Y'], { y: 0xc89820, Y: 0xfff080 })
        if (town.burningUntil > now) {
          const tongues = [0xffe060, 0xff9020, 0xe84010] as const
          ;[-4, 0, 4].forEach((dx, i) => {
            const h = 1 + ((frame + i) % 2)
            for (let k = 0; k < h; k++) c.set(x + dx, y - 4 - (i === 1 ? 3 : 0) - k, tongues[(k + frame + i) % 3] ?? tongues[0])
          })
        }
      },
    })
  }

  visibleTasks(town.tasks).forEach((task, i) => {
    const slot = SLOTS[i]
    if (slot === undefined) return
    const [x, y] = map(slot)
    items.push({ y, draw: () => house(c, task, x, y, age, frame) })
  })

  const people: Array<{ at: Point; kind: UnitKind; isLeft: boolean; load: number | null }> = []
  const home = walkAt(homeVillagerWalk(town), now)
  people.push({ at: home.at, kind: 'villager', isLeft: home.isFacingLeft, load: home.isCarrying ? 0x8a5a30 : null })
  for (const unit of town.units) people.push(unitAt(unit, now))
  if (town.mood === 'permission') people.push({ at: [TC[0] + 92, TC[1] + 4], kind: 'monk', isLeft: frame % 2 === 0, load: null })
  for (const person of people) {
    const [x, y] = map(person.at)
    const sprite = UNIT_SPRITES[person.kind]
    items.push({
      y: y + 0.01,
      draw: () => {
        c.sprite(x, y, sprite.rows[frame % 2] ?? [], sprite.palette, person.isLeft)
        if (person.load !== null) c.set(x + (person.isLeft ? 1 : -1), y - 3, person.load)
      },
    })
  }

  items.sort((a, b) => a.y - b.y).forEach(item => item.draw())
  return c.px
}

function unitAt(unit: TownUnit, now: number) {
  if (unit.doneAt !== null) {
    const at = homewardAt(unit, now)
    return { at, kind: unit.kind, isLeft: DOOR[0] < at[0], load: null }
  }
  const walk = unitWalk(unit)
  const step = walkAt(walk, now, unit.slot * 1.7)
  const load = step.isCarrying ? (walk.carries === 'gold' ? GOLD : 0x8a5a30) : null
  return { at: step.at, kind: unit.kind, isLeft: step.isFacingLeft, load }
}

function house(c: Canvas, task: TownTask, x: number, y: number, age: Age, frame: number) {
  if (task.status === 'pending') {
    for (let dx = -2; dx <= 2; dx += 2) {
      c.set(x + dx, y - Math.floor(Math.abs(dx) / 2), 0xd8c088)
      c.set(x + dx, y - 2 + Math.floor(Math.abs(dx) / 2), 0xd8c088)
    }
    return
  }
  if (task.status === 'in_progress') {
    drawBlock(c, { x, y, w: 2, wall: 1 + (Math.floor(frame / 3) % 2), roof: 0, wallL: 0xb88a50, wallR: 0x946a3a, roofL: 0xc89a60, roofR: 0xa87a48 })
    c.column(x - 2, y - 4, y - 1, 0xe0c080)
    c.column(x + 2, y - 4, y - 1, 0xe0c080)
    c.sprite(x - 4, y + 1, frame % 2 ? ['.sh', 'TT.', 'l.l'] : ['.s.', 'TTh', 'l.l'], { s: SKIN, T: PLAYER, l: LEGS, h: 0x9a9a9a })
    return
  }
  drawBlock(c, { x, y, w: 2, wall: 2, roof: 2, wallL: age.wallL, wallR: age.wallR, roofL: age.roofL, roofR: age.roofR })
}

// ── Raster cells ─────────────────────────────────────────────────────────────

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

/** The pixels as Raster cells: base64 of `[codePoint, fg, bg]` u32 triplets. */
export function toRasterCells(px: Uint32Array, width: number): string {
  const words = new Uint32Array(width * STRIP_ROWS * 3)
  for (let row = 0; row < STRIP_ROWS; row++) {
    for (let x = 0; x < width; x++) {
      const top = px[row * 2 * width + x] ?? VOID
      const bottom = px[(row * 2 + 1) * width + x] ?? VOID
      const i = (row * width + x) * 3
      if (top === bottom) words.set([SPACE, VOID, top], i)
      else if (top === VOID) words.set([LOWER_HALF, bottom, VOID], i)
      else words.set([UPPER_HALF, top, bottom], i)
    }
  }
  return toBase64(new Uint8Array(words.buffer))
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
