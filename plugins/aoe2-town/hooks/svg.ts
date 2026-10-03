// The town as one SVG document for the desktop: vector art with
// gradients, and SMIL doing the motion (walks, smoke, flames, the flag,
// the bell), so it moves smoothly with no redraw. Every animation begins at
// a negative offset taken from the clock, so a redraw picks each one up
// where it was rather than starting it over.
import type { Town, TownTask, TownUnit, UnitKind } from '../types'
import type { AgePalette, Point, Walk } from './world'
import {
  BUILD_MS,
  DOOR,
  GOLD_MINE,
  HOMEWARD_MS,
  SLOTS,
  TC,
  TREES,
  WORLD_H,
  WORLD_W,
  agePalette,
  ageName,
  homeVillagerWalk,
  homewardAt,
  unitWalk,
  visibleTasks,
} from './world'

const PLAYER = '#2f62e6'
const PLAYER_DARK = '#1c3c9c'
const SKIN = '#e6b88e'

const n = (v: number) => (Math.round(v * 10) / 10).toString()
const pts = (list: readonly Point[]) => list.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** `begin` for a looping animation of `seconds`, in phase with the clock. */
function phase(now: number, seconds: number, offset = 0): string {
  const into = (((now / 1000 + offset) % seconds) + seconds) % seconds
  return `-${into.toFixed(2)}s`
}

// ── Ground and scenery ──────────────────────────────────────────────────────

function defs(): string {
  return `<defs>
<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e9e3c"/><stop offset="1" stop-color="#4a7a28"/></linearGradient>
<radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>
<radialGradient id="oak" cx="0.35" cy="0.3" r="0.7"><stop offset="0" stop-color="#6aa043"/><stop offset="0.6" stop-color="#3d7228"/><stop offset="1" stop-color="#25501a"/></radialGradient>
<linearGradient id="pine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3f7a34"/><stop offset="1" stop-color="#1e4a1e"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset="0.45" stop-color="#e8b830"/><stop offset="1" stop-color="#8a6414"/></linearGradient>
<linearGradient id="rock" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a49a8a"/><stop offset="1" stop-color="#5e564a"/></linearGradient>
<radialGradient id="flame" cx="0.5" cy="0.8" r="0.8"><stop offset="0" stop-color="#fff6a0"/><stop offset="0.45" stop-color="#ffa21e"/><stop offset="1" stop-color="#d23a0a"/></radialGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffd860" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd860" stop-opacity="0"/></radialGradient>
<pattern id="tiles" width="32" height="16" patternUnits="userSpaceOnUse"><path d="M0 8 L16 0 L32 8 L16 16 Z" fill="none" stroke="#000" stroke-opacity="0.06" stroke-width="0.8"/></pattern>
</defs>`
}

function ground(): string {
  // a few fixed tufts and flowers, scattered by a cheap hash so they never move
  let tufts = ''
  for (let i = 0; i < 70; i++) {
    const x = (i * 137.5) % WORLD_W
    const y = 30 + ((i * 59.3) % (WORLD_H - 34))
    if (i % 7 === 0) tufts += `<circle cx="${n(x)}" cy="${n(y)}" r="1.1" fill="${i % 2 ? '#f4e27a' : '#e8e8f0'}"/>`
    else tufts += `<path d="M${n(x)} ${n(y)} l-1.5 -3 M${n(x)} ${n(y)} l0 -3.6 M${n(x)} ${n(y)} l1.5 -3" stroke="#3c6a22" stroke-width="0.8"/>`
  }
  return `<rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#grass)"/>
<rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#tiles)"/>
<path d="M${GOLD_MINE[0] - 30} ${GOLD_MINE[1] + 20} Q ${TC[0] - 80} ${TC[1] + 6} ${DOOR[0]} ${DOOR[1]} M ${DOOR[0]} ${DOOR[1]} Q ${TC[0] - 120} ${TC[1] - 2} 120 ${DOOR[1] + 2}" fill="none" stroke="#a88c5a" stroke-opacity="0.35" stroke-width="5" stroke-linecap="round"/>
${tufts}`
}

function shadow(x: number, y: number, rx: number, ry: number): string {
  return `<ellipse cx="${n(x + rx * 0.25)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="#000" opacity="0.22"/>`
}

function tree(x: number, y: number, size: number, kind: 'oak' | 'pine'): string {
  const s = size
  if (kind === 'pine') {
    return `<g>${shadow(x, y, 9 * s, 3 * s)}<rect x="${n(x - 1.4 * s)}" y="${n(y - 8 * s)}" width="${n(2.8 * s)}" height="${n(8 * s)}" fill="#5a3a1e"/>
<path d="M${n(x)} ${n(y - 40 * s)} L${n(x + 7 * s)} ${n(y - 26 * s)} L${n(x + 4 * s)} ${n(y - 26 * s)} L${n(x + 10 * s)} ${n(y - 14 * s)} L${n(x + 6 * s)} ${n(y - 14 * s)} L${n(x + 12 * s)} ${n(y - 6 * s)} L${n(x - 12 * s)} ${n(y - 6 * s)} L${n(x - 6 * s)} ${n(y - 14 * s)} L${n(x - 10 * s)} ${n(y - 14 * s)} L${n(x - 4 * s)} ${n(y - 26 * s)} L${n(x - 7 * s)} ${n(y - 26 * s)} Z" fill="url(#pine)" stroke="#173a16" stroke-width="0.6"/></g>`
  }
  return `<g>${shadow(x, y, 11 * s, 3.5 * s)}<path d="M${n(x - 1.8 * s)} ${n(y)} L${n(x - 1.2 * s)} ${n(y - 14 * s)} L${n(x + 1.2 * s)} ${n(y - 14 * s)} L${n(x + 1.8 * s)} ${n(y)} Z" fill="#5e3c1e"/>
<circle cx="${n(x - 6 * s)}" cy="${n(y - 18 * s)}" r="${n(7.5 * s)}" fill="url(#oak)"/>
<circle cx="${n(x + 6 * s)}" cy="${n(y - 19 * s)}" r="${n(7.5 * s)}" fill="url(#oak)"/>
<circle cx="${n(x)}" cy="${n(y - 26 * s)}" r="${n(8.5 * s)}" fill="url(#oak)"/>
<circle cx="${n(x - 2 * s)}" cy="${n(y - 29 * s)}" r="${n(2.6 * s)}" fill="#8cc060" opacity="0.5"/></g>`
}

function goldMine(): string {
  const [x, y] = GOLD_MINE
  const nugget = (dx: number, dy: number, r: number) =>
    `<path d="M${n(x + dx - r)} ${n(y + dy)} L${n(x + dx - r * 0.5)} ${n(y + dy - r * 0.9)} L${n(x + dx + r * 0.6)} ${n(y + dy - r)} L${n(x + dx + r)} ${n(y + dy - r * 0.2)} L${n(x + dx + r * 0.5)} ${n(y + dy + r * 0.4)} L${n(x + dx - r * 0.6)} ${n(y + dy + r * 0.4)} Z" fill="url(#gold)" stroke="#6a4a10" stroke-width="0.5"/>`
  return `<g>${shadow(x, y + 4, 22, 5)}
<path d="M${x - 20} ${y + 4} L${x - 14} ${y - 8} L${x - 2} ${y - 12} L${x + 12} ${y - 9} L${x + 20} ${y + 4} Z" fill="url(#rock)"/>
${nugget(-10, 0, 6)}${nugget(4, -4, 7)}${nugget(12, 3, 5)}${nugget(-2, 5, 4.5)}
<circle cx="${x + 5}" cy="${y - 8}" r="1.2" fill="#fff"><animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></circle>
<circle cx="${x - 9}" cy="${y - 3}" r="1" fill="#fff"><animate attributeName="opacity" values="0;1;0" dur="3.1s" begin="-1.2s" repeatCount="indefinite"/></circle></g>`
}

// ── Iso buildings ───────────────────────────────────────────────────────────

type Box = { x: number; y: number; w: number; h: number }

/** The two visible walls of an iso box whose front corner is (x, y). */
function walls(b: Box, left: string, right: string): string {
  const { x, y, w, h } = b
  return `<polygon points="${pts([[x - w, y - w / 2], [x, y], [x, y - h], [x - w, y - w / 2 - h]])}" fill="${left}"/>
<polygon points="${pts([[x, y], [x + w, y - w / 2], [x + w, y - w / 2 - h], [x, y - h]])}" fill="${right}"/>`
}

/** A matrix taking face space (u along, v up, both 0..1) onto a wall. */
function face(b: Box, side: 'left' | 'right'): string {
  const { x, y, w, h } = b
  return side === 'left' ? `matrix(${n(w)},${n(w / 2)},0,${n(-h)},${n(x - w)},${n(y - w / 2)})` : `matrix(${n(w)},${n(-w / 2)},0,${n(-h)},${n(x)},${n(y)})`
}

/** A hipped roof over a box, with tile rows and a little overhang. */
function hipRoof(b: Box, rise: number, left: string, right: string, tiles = true): string {
  const { x, y, w, h } = b
  const o = Math.max(2, w * 0.12)
  const apex: Point = [x, y - w / 2 - h - rise]
  const l: Point = [x - w - o, y - w / 2 - h + o / 4]
  const f: Point = [x, y - h + o / 2]
  const r: Point = [x + w + o, y - w / 2 - h + o / 4]
  let lines = ''
  if (tiles) {
    for (let i = 1; i < 5; i++) {
      const t = i / 5
      const lerp = (a: Point, c: Point): Point => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]
      lines += `<polyline points="${pts([lerp(l, apex), lerp(f, apex), lerp(r, apex)])}" fill="none" stroke="#000" stroke-opacity="0.18" stroke-width="0.7"/>`
    }
  }
  return `<polygon points="${pts([l, f, apex])}" fill="${left}"/><polygon points="${pts([f, r, apex])}" fill="${right}"/>${lines}
<polyline points="${pts([l, f, r])}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="0.8"/>
<line x1="${n(f[0])}" y1="${n(f[1])}" x2="${n(apex[0])}" y2="${n(apex[1])}" stroke="#fff" stroke-opacity="0.18" stroke-width="0.8"/>`
}

function townCenter(town: Town, now: number): string {
  const p = agePalette(town.age)
  const [x, y] = TC
  const base: Box = { x, y, w: 58, h: 14 }
  const hallY = y - base.w / 2 - base.h + 34 / 2
  const hall: Box = { x, y: hallY, w: 34, h: 18 }
  const roofRise = 22
  const top = hallY - hall.w / 2 - hall.h - roofRise

  // arcades along the stone base
  const arches = (side: 'left' | 'right') =>
    `<g transform="${face(base, side)}">${[0.12, 0.32, 0.52, 0.72]
      .map(u => `<path d="M${u} 0 L${u} 0.55 Q${u + 0.07} 0.95 ${u + 0.14} 0.55 L${u + 0.14} 0 Z" fill="#2a1c10" opacity="0.85"/>`)
      .join('')}</g>`
  // timber framing on the hall
  const beams = (side: 'left' | 'right') =>
    `<g transform="${face(hall, side)}" stroke="${p.trim}" stroke-width="0.035" fill="none"><path d="M0 0.5 H1 M0.25 0 V1 M0.5 0 V1 M0.75 0 V1"/>${
      town.age >= 1 ? '<path d="M0.33 0.62 h0.12 v0.25 h-0.12 Z M0.6 0.62 h0.12 v0.25 h-0.12 Z" fill="#2a1c10" stroke="none"/>' : ''
    }</g>`
  const terrace = `<polygon points="${pts([[x - base.w, y - base.w / 2 - base.h], [x, y - base.h], [x + base.w, y - base.w / 2 - base.h], [x, y - base.w - base.h]])}" fill="${p.baseDark}"/>`
  const door = `<g transform="${face(base, 'left')}"><path d="M0.8 0 L0.8 0.7 Q0.86 1.05 0.92 0.7 L0.92 0 Z" fill="#1a0f08"/></g>`

  const flagWave = `<path fill="${PLAYER}" stroke="${PLAYER_DARK}" stroke-width="0.6"><animate attributeName="d" dur="1.2s" repeatCount="indefinite" begin="${phase(now, 1.2)}" values="M${x} ${top - 14} Q${x + 7} ${top - 17} ${x + 14} ${top - 14} L${x + 14} ${top - 6} Q${x + 7} ${top - 9} ${x} ${top - 6} Z;M${x} ${top - 14} Q${x + 7} ${top - 11} ${x + 14} ${top - 14} L${x + 14} ${top - 6} Q${x + 7} ${top - 3} ${x} ${top - 6} Z;M${x} ${top - 14} Q${x + 7} ${top - 17} ${x + 14} ${top - 14} L${x + 14} ${top - 6} Q${x + 7} ${top - 9} ${x} ${top - 6} Z"/></path>`
  const flag = `<line x1="${x}" y1="${top + 2}" x2="${x}" y2="${top - 16}" stroke="#4a3622" stroke-width="1.4"/>${
    town.mood === 'idle' ? `<path d="M${x} ${top - 14} L${x + 12} ${top - 12} L${x + 12} ${top - 5} L${x} ${top - 6} Z" fill="${PLAYER}"/>` : flagWave
  }${town.age >= 3 ? `<circle cx="${x}" cy="${top - 17}" r="1.8" fill="${p.trim}"/>` : ''}`

  const chimney: Point = [x + 16, hallY - hall.w / 2 - hall.h - 8]
  const chimneyShape = `<rect x="${chimney[0] - 2.5}" y="${chimney[1] - 7}" width="5" height="10" fill="${p.baseDark}" stroke="#000" stroke-opacity="0.25" stroke-width="0.5"/>`

  const building = `${shadow(x + 10, y - 16, 76, 22)}${walls(base, p.base, p.baseDark)}${arches('left')}${arches('right')}${door}${terrace}
${walls(hall, p.wallL, p.wallR)}${beams('left')}${beams('right')}${chimneyShape}${hipRoof(hall, roofRise, p.roofL, p.roofR)}${flag}`

  const progress = Math.min(1, Math.max(0, (now - (town.tcBuiltAt ?? now)) / BUILD_MS))
  let drawn = building
  if (progress < 1) {
    // rising out of its foundation, scaffolding falling away as it tops out
    const height = y + 4 - (top - 20)
    const left = ((1 - progress) * BUILD_MS) / 1000
    drawn = `<clipPath id="rise"><rect x="${x - 80}" y="${n(y + 4 - height * progress)}" width="160" height="${n(height)}"><animate attributeName="y" to="${n(top - 20)}" dur="${left.toFixed(2)}s" fill="freeze"/></rect></clipPath>
<polygon points="${pts([[x - base.w, y - base.w / 2], [x, y], [x + base.w, y - base.w / 2], [x, y - base.w]])}" fill="#b89a62" opacity="0.6"/>
<g clip-path="url(#rise)">${building}</g>
<g stroke="#d8b878" stroke-width="1.6" opacity="0.9"><animate attributeName="opacity" to="0" dur="${left.toFixed(2)}s" fill="freeze"/>
<path d="M${x - 58} ${y - 29} V${y - 80} M${x} ${y} V${y - 70} M${x + 58} ${y - 29} V${y - 80} M${x - 58} ${y - 50} L${x} ${y - 22} L${x + 58} ${y - 50} M${x - 58} ${y - 70} L${x} ${y - 44} L${x + 58} ${y - 70}"/></g>`
  }

  let effects = ''
  if (town.mood === 'working' && progress >= 1) effects += smoke(chimney[0], chimney[1] - 8, now, '#d8d8d8')
  if (town.burningUntil > now) effects += fire(town, now)
  if (town.mood === 'permission') effects += bell(x + 40, top + 6, now)
  return `<g>${drawn}${effects}</g>`
}

function smoke(x: number, y: number, now: number, color: string): string {
  return [0, 1, 2, 3]
    .map(i => {
      const begin = phase(now, 3, i * 0.75)
      return `<circle cx="${x}" cy="${y}" r="3" fill="${color}"><animate attributeName="cy" values="${y};${y - 34}" dur="3s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="cx" values="${x};${x + 4};${x + 12}" dur="3s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="r" values="2.5;8" dur="3s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="3s" begin="${begin}" repeatCount="indefinite"/></circle>`
    })
    .join('')
}

function fire(town: Town, now: number): string {
  const [x, y] = TC
  const spots: Point[] = [
    [x - 34, y - 34],
    [x + 30, y - 36],
    [x - 8, y - 60],
    [x + 14, y - 66],
    [x - 50, y - 24],
  ]
  // fade the flames out over the last half second of the burn
  const left = Math.max(0, (town.burningUntil - now) / 1000)
  const flames = spots
    .map(([fx, fy], i) => {
      const s = 1 + (i % 3) * 0.25
      return `<g transform="translate(${fx} ${fy})"><ellipse cx="0" cy="-2" rx="${n(10 * s)}" ry="${n(8 * s)}" fill="url(#glow)" opacity="0.6"/><path d="M0 0 C${n(-5 * s)} -2 ${n(-4 * s)} ${n(-8 * s)} 0 ${n(-14 * s)} C${n(4 * s)} ${n(-8 * s)} ${n(5 * s)} -2 0 0 Z" fill="url(#flame)"><animateTransform attributeName="transform" type="scale" values="1 1;0.85 1.2;1.1 0.9;1 1" dur="${(0.5 + i * 0.07).toFixed(2)}s" repeatCount="indefinite"/></path></g>`
    })
    .join('')
  return `<g><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="${left.toFixed(2)}s" fill="freeze"/>${flames}${smoke(x + 4, y - 72, now, '#3a3a3a')}</g>`
}

function bell(x: number, y: number, now: number): string {
  return `<g transform="translate(${x} ${y})"><circle r="11" fill="url(#glow)"><animate attributeName="opacity" values="1;0.15;1" dur="0.8s" repeatCount="indefinite" begin="${phase(now, 0.8)}"/></circle>
<g><animateTransform attributeName="transform" type="rotate" values="-18;18;-18" dur="0.8s" repeatCount="indefinite" begin="${phase(now, 0.8)}"/>
<line x1="0" y1="-9" x2="0" y2="-6" stroke="#5a3c1a" stroke-width="1.2"/>
<path d="M-5 4 C-5 -2 -4 -6 0 -6 C4 -6 5 -2 5 4 L6.5 5.5 L-6.5 5.5 Z" fill="url(#gold)" stroke="#6a4a10" stroke-width="0.6"/>
<circle cy="6.8" r="1.4" fill="#6a4a10"/></g></g>`
}

// ── Houses: the tasks ──────────────────────────────────────────────────────

function house(task: TownTask, slot: Point, p: AgePalette, now: number): string {
  const [x, y] = slot
  const b: Box = { x, y, w: 20, h: 13 }
  const footprint = pts([[x - b.w, y - b.w / 2], [x, y], [x + b.w, y - b.w / 2], [x, y - b.w]])
  const title = `<title>${esc(task.subject)}</title>`
  if (task.status === 'pending') {
    return `<g>${title}<polygon points="${footprint}" fill="#c8a868" fill-opacity="0.25" stroke="#e8d098" stroke-width="1.1" stroke-dasharray="3 2"/>
<path d="M${x - 8} ${y - 6} l10 -5 M${x - 2} ${y - 3} l10 -5" stroke="#a07840" stroke-width="2"/></g>`
  }
  if (task.status === 'in_progress') {
    const half: Box = { ...b, h: 7 }
    const hammer = `<g transform="translate(${x - 26} ${y - 2}) scale(1.3)">${villagerFigure()}<g transform="translate(3 -9)"><animateTransform attributeName="transform" type="rotate" values="-40 3 -9;30 3 -9;-40 3 -9" dur="0.5s" repeatCount="indefinite" begin="${phase(now, 0.5)}" additive="sum"/><line x1="0" y1="0" x2="5" y2="-4" stroke="#6a4a2a" stroke-width="1.1"/><rect x="4" y="-6" width="3" height="3" fill="#888"/></g></g>`
    return `<g>${title}${shadow(x + 2, y - 8, 24, 8)}<polygon points="${footprint}" fill="#b89a62"/>${walls(half, '#c49a5c', '#9a7440')}
<g stroke="#e0c080" stroke-width="1.3"><path d="M${x - b.w} ${y - b.w / 2} v-24 M${x} ${y} v-26 M${x + b.w} ${y - b.w / 2} v-24 M${x - b.w} ${y - b.w / 2 - 14} L${x} ${y - 14} L${x + b.w} ${y - b.w / 2 - 14}"/></g>${hammer}</g>`
  }
  return `<g>${title}${shadow(x + 4, y - 8, 26, 9)}${walls(b, p.wallL, p.wallR)}
<g transform="${face(b, 'left')}"><path d="M0.55 0 V0.65 H0.75 V0 Z" fill="#3a2414"/><rect x="0.15" y="0.4" width="0.2" height="0.3" fill="#2a1c10"/></g>
<g transform="${face(b, 'right')}"><rect x="0.4" y="0.4" width="0.22" height="0.3" fill="#2a1c10"/></g>
${hipRoof(b, 16, p.roofL, p.roofR)}<rect x="${x + 8}" y="${y - b.w / 2 - b.h - 16}" width="4" height="8" fill="${p.baseDark}"/></g>`
}

// ── People ──────────────────────────────────────────────────────────────────

/** Two legs that stride while their parent walks. */
function legs(color: string, stride: number): string {
  const leg = (dir: number) =>
    `<line x1="0" y1="-6" x2="0" y2="0" stroke="${color}" stroke-width="1.6" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="${-22 * dir} 0 -6;${22 * dir} 0 -6;${-22 * dir} 0 -6" dur="${stride}s" repeatCount="indefinite"/></line>`
  return `<g transform="translate(-1.2 0)">${leg(1)}</g><g transform="translate(1.2 0)">${leg(-1)}</g>`
}

function villagerFigure(stride = 0.5): string {
  return `${shadow(0, 0, 5, 1.6)}${legs('#4a3020', stride)}
<path d="M-3.6 -6 L-3 -13 Q0 -15 3 -13 L3.6 -6 Z" fill="${PLAYER}"/><rect x="-3.4" y="-7.2" width="6.8" height="1.2" fill="#5a3a1e"/>
<circle cx="0" cy="-16" r="2.6" fill="${SKIN}"/><path d="M-2.8 -16.6 Q0 -20.5 2.8 -16.6 Z" fill="#c8a258"/>`
}

function figure(kind: UnitKind): string {
  switch (kind) {
    case 'scout':
      return `${shadow(0, 0, 10, 2.4)}
<g stroke="#3a2210" stroke-width="1.5" stroke-linecap="round"><line x1="-6" y1="-7" x2="-7" y2="0"><animateTransform attributeName="transform" type="rotate" values="-20 -6 -7;20 -6 -7;-20 -6 -7" dur="0.4s" repeatCount="indefinite"/></line><line x1="5" y1="-7" x2="6" y2="0"><animateTransform attributeName="transform" type="rotate" values="20 5 -7;-20 5 -7;20 5 -7" dur="0.4s" repeatCount="indefinite"/></line></g>
<ellipse cx="0" cy="-9" rx="8.5" ry="4" fill="#8a5a30"/><path d="M6 -11 L11 -17 L13 -15 L9 -8 Z" fill="#7a4a24"/><path d="M-8 -10 Q-12 -8 -11 -3" stroke="#3a2210" stroke-width="1.4" fill="none"/>
<path d="M-2.5 -12 L-2 -20 Q0.5 -22 3 -20 L3 -12 Z" fill="${PLAYER}"/><circle cx="0.5" cy="-22.5" r="2.4" fill="${SKIN}"/><path d="M-2 -23 Q0.5 -27 3 -23 Z" fill="#9a9aa4"/>
<line x1="4" y1="-18" x2="10" y2="-26" stroke="#c8c8d0" stroke-width="1"/>`
    case 'monk':
      return `${shadow(0, 0, 5, 1.6)}<path d="M-4.5 0 L-3.4 -12 Q0 -15 3.4 -12 L4.5 0 Z" fill="#c8985a"/><path d="M-1 -11 L1 -11 L1.6 0 L-1.6 0 Z" fill="${PLAYER}" opacity="0.8"/>
<circle cx="0" cy="-15.5" r="2.6" fill="${SKIN}"/><path d="M-3.4 -14 Q-3.6 -20 0 -19.6 Q3.6 -20 3.4 -14 Q2 -17 0 -17 Q-2 -17 -3.4 -14 Z" fill="#a87a42"/>
<line x1="5" y1="1" x2="6" y2="-20" stroke="#6a4a2a" stroke-width="1.2"/><circle cx="6" cy="-21" r="1.6" fill="#e2b83c"/>`
    case 'militia':
      return `${shadow(0, 0, 5, 1.6)}${legs('#3a2a1e', 0.45)}<path d="M-3.6 -6 L-3 -13 Q0 -15 3 -13 L3.6 -6 Z" fill="${PLAYER_DARK}"/>
<circle cx="0" cy="-16" r="2.6" fill="${SKIN}"/><path d="M-3 -16 Q0 -21.5 3 -16 Z" fill="#a8a8b2"/>
<ellipse cx="-4.2" cy="-9.5" rx="2.4" ry="3.6" fill="#7a3a22" stroke="#d0c070" stroke-width="0.6"/><line x1="4" y1="-8" x2="7" y2="-19" stroke="#dcdce4" stroke-width="1.2"/>`
    default:
      return villagerFigure()
  }
}

const LOAD = { wood: '<rect x="-6" y="-21" width="6" height="2.4" rx="1" fill="#8a5a30" stroke="#5a3a1e" stroke-width="0.5"/>', gold: '<circle cx="-4" cy="-20" r="2.2" fill="url(#gold)"/>' }

/** A unit walking its loop: SMIL moves it, flips it and swaps its load. */
function walker(walk: Walk, body: string, now: number, offset: number, title?: string): string {
  const path = `M${pts(walk.points).replace(/ /g, ' L')}`
  const begin = phase(now, walk.seconds, offset)
  // which way each leg of the loop heads, as a discrete scale animation
  let total = 0
  const lengths: number[] = []
  for (let i = 1; i < walk.points.length; i++) {
    const a = walk.points[i - 1] ?? [0, 0]
    const b = walk.points[i] ?? a
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    lengths.push(length)
    total += length
  }
  let walked = 0
  const times: string[] = []
  const flips: string[] = []
  lengths.forEach((length, i) => {
    const a = walk.points[i] ?? [0, 0]
    const b = walk.points[i + 1] ?? a
    times.push((walked / total).toFixed(4))
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
    const from = homewardAt(unit, unit.doneAt)
    const left = Math.max(0.05, (HOMEWARD_MS - (now - unit.doneAt)) / 1000)
    const here = homewardAt(unit, now)
    const isLeft = DOOR[0] < from[0]
    return `<g transform="translate(${n(here[0])} ${n(here[1])})"><animateTransform attributeName="transform" type="translate" to="${DOOR[0]} ${DOOR[1]}" dur="${left.toFixed(2)}s" fill="freeze"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.8;1" dur="${left.toFixed(2)}s" fill="freeze"/><g transform="scale(${isLeft ? -1.3 : 1.3} 1.3)">${figure(unit.kind)}</g></g>`
  }
  return walker(unitWalk(unit), `<g transform="scale(1.3)">${figure(unit.kind)}</g>`, now, unit.slot * 1.7, unit.label)
}

function wololo(now: number): string {
  const [x, y] = [TC[0] + 92, TC[1] + 4]
  const rings = [0, 1, 2]
    .map(i => {
      const begin = phase(now, 1.5, i * 0.5)
      return `<circle cx="0" cy="-12" r="4" fill="none" stroke-width="1.6"><animate attributeName="r" values="4;30" dur="1.5s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1.5s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="stroke" values="${PLAYER};#d8282a;#e8c040;${PLAYER}" dur="1.5s" begin="${begin}" repeatCount="indefinite"/></circle>`
    })
    .join('')
  return `<g transform="translate(${x} ${y}) scale(-1.5 1.5)">${rings}${shadow(0, 0, 5, 1.6)}
<path d="M-4.5 0 L-3.4 -12 Q0 -15 3.4 -12 L4.5 0 Z" fill="#c8985a"/><circle cx="0" cy="-15.5" r="2.6" fill="${SKIN}"/><path d="M-3.4 -14 Q-3.6 -20 0 -19.6 Q3.6 -20 3.4 -14 Q2 -17 0 -17 Q-2 -17 -3.4 -14 Z" fill="#a87a42"/>
<g><animateTransform attributeName="transform" type="rotate" values="-12 2 -10;14 2 -10;-12 2 -10" dur="0.6s" repeatCount="indefinite"/><line x1="2" y1="-10" x2="9" y2="-26" stroke="#6a4a2a" stroke-width="1.3"/><circle cx="9.4" cy="-27" r="2" fill="#e2b83c"/></g></g>
<text x="${x}" y="${y - 40}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="bold" font-size="11" fill="#ffe680" stroke="#3a2808" stroke-width="2.5" paint-order="stroke">Wololo!<animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite"/></text>`
}

// ── HUD: the resource bar ───────────────────────────────────────────────────

function hud(town: Town): string {
  const built = town.tasks.filter(task => task.status === 'completed').length
  const units = town.units.filter(unit => unit.doneAt === null).length
  const pop = town.contextPercent === null ? '—' : String(Math.round(town.contextPercent * 2))
  const isFull = (town.contextPercent ?? 0) >= 90
  const text = (x: number, value: string, color = '#f4e8c8') => `<text x="${x}" y="15.8" font-size="10.5" fill="${color}">${esc(value)}</text>`
  return `<g font-family="Georgia, 'Times New Roman', serif">
<rect x="6" y="4" width="250" height="17" rx="3" fill="#1c140a" fill-opacity="0.8" stroke="#c8a050" stroke-opacity="0.8" stroke-width="0.8"/>
<text x="13" y="15.8" font-size="11" font-weight="bold" fill="#e8c040">${ageName(town.age)}</text>
<circle cx="100" cy="10" r="2.6" fill="${SKIN}"/><path d="M96 17.5 Q100 10.5 104 17.5 Z" fill="${PLAYER}"/>
${text(108, `${pop}/200`, isFull ? '#ff6a50' : '#f4e8c8')}
<path d="M166 17.5 V12.5 L170.5 8.5 L175 12.5 V17.5 Z" fill="#c25a32"/>${text(179, `${built}/${town.tasks.length}`)}
<path d="M210 8.5 L218 16.5 M210 16.5 L218 8.5" stroke="#d8d8e0" stroke-width="1.5"/>${text(222, String(units))}
</g>${
    isFull
      ? `<text x="${WORLD_W / 2}" y="16" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#ff8a6a" stroke="#2a0a04" stroke-width="2.5" paint-order="stroke">You need to build more houses!</text>`
      : ''
  }`
}

// ── The whole document ──────────────────────────────────────────────────────

export function townSvg(town: Town, now: number): string {
  type Item = { y: number; svg: string }
  const p = agePalette(town.age)
  const items: Item[] = [
    ...TREES.map(t => ({ y: t.at[1], svg: tree(t.at[0], t.at[1], t.size, t.kind) })),
    { y: GOLD_MINE[1], svg: goldMine() },
    ...visibleTasks(town.tasks).map((task, i) => {
      const slot = SLOTS[i] ?? [0, 0]
      return { y: slot[1], svg: house(task, slot, p, now) }
    }),
    ...town.units.map(unit => ({ y: 200, svg: unitSvg(unit, now) })),
    { y: 199, svg: walker(homeVillagerWalk(town), `<g transform="scale(1.3)">${villagerFigure()}</g>`, now, 0, 'Your villager') },
  ]
  if (town.tcBuiltAt !== null) items.push({ y: TC[1], svg: townCenter(town, now) })
  if (town.mood === 'permission') items.push({ y: 201, svg: wololo(now) })
  items.sort((a, b) => a.y - b.y)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORLD_W} ${WORLD_H}" width="${WORLD_W}" height="${WORLD_H}" preserveAspectRatio="xMidYMid slice">${defs()}${ground()}${items
    .map(item => item.svg)
    .join('')}<rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#vignette)" pointer-events="none"/>${hud(town)}</svg>`
}
