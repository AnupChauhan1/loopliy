/**
 * Minimal typed builder for Bodymovin/Lottie JSON (schema 5.x, shape layers only).
 * Lets us author small, brand-coloured vector animations in code without shipping
 * external assets.
 */

type Vec = number[];
type Ease = [number, number, number, number];
export type Prop = { a: 0 | 1; k: any };

export const EASE_INOUT: Ease = [0.45, 0, 0.25, 1];
export const EASE_OUT: Ease = [0.16, 1, 0.3, 1];
export const EASE_BACK: Ease = [0.34, 1.56, 0.64, 1];
export const LINEAR: Ease = [0, 0, 1, 1];

const isProp = (v: any): v is Prop => v && typeof v === 'object' && !Array.isArray(v) && 'a' in v && 'k' in v;
const arr = (v: number | Vec) => (Array.isArray(v) ? v : [v]);

export const st = (k: any): Prop => ({ a: 0, k });
export const wrap = (v: any): Prop => (isProp(v) ? v : st(v));

/** Animated property from [frame, value] pairs. `ease` applies between each pair. */
export function kf(frames: [number, number | Vec][], ease: Ease = EASE_INOUT): Prop {
  return {
    a: 1,
    k: frames.map(([t, v], idx) =>
      idx < frames.length - 1
        ? { t, s: arr(v), o: { x: [ease[0]], y: [ease[1]] }, i: { x: [ease[2]], y: [ease[3]] } }
        : { t, s: arr(v) },
    ),
  };
}

export function hex(h: string, alpha = 1): Vec {
  const n = h.replace('#', '');
  return [parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255, alpha];
}

/* ---------- shapes ---------- */
export const ellipse = (size: any, p: any = [0, 0]) => ({ ty: 'el', d: 1, p: wrap(p), s: wrap(size) });
export const rect = (size: any, r: any = 0, p: any = [0, 0]) => ({ ty: 'rc', d: 1, p: wrap(p), s: wrap(size), r: wrap(r) });
export const path = (v: Vec[], closed = false, i?: Vec[], o?: Vec[]) => ({
  ty: 'sh',
  d: 1,
  ks: st({ v, i: i ?? v.map(() => [0, 0]), o: o ?? v.map(() => [0, 0]), c: closed }),
});

export const fill = (color: string, opacity: any = 100) => ({ ty: 'fl', c: st(hex(color)), o: wrap(opacity), r: 1 });
export const stroke = (color: string, width: any, opacity: any = 100, dash?: { dash: number; gap: number; offset?: any }) => ({
  ty: 'st',
  c: st(hex(color)),
  o: wrap(opacity),
  w: wrap(width),
  lc: 2,
  lj: 2,
  ml: 4,
  ...(dash
    ? {
        d: [
          { n: 'd', nm: 'dash', v: st(dash.dash) },
          { n: 'g', nm: 'gap', v: st(dash.gap) },
          { n: 'o', nm: 'offset', v: wrap(dash.offset ?? 0) },
        ],
      }
    : {}),
});

const gradStops = (colors: string[]) => {
  const k: number[] = [];
  colors.forEach((c, i) => {
    const [r, g, b] = hex(c);
    k.push(colors.length === 1 ? 0 : i / (colors.length - 1), r, g, b);
  });
  return { p: colors.length, k: st(k) };
};

export const gfill = (colors: string[], start: Vec, end: Vec, opacity: any = 100) => ({
  ty: 'gf',
  o: wrap(opacity),
  r: 1,
  g: gradStops(colors),
  s: st(start),
  e: st(end),
  t: 1,
});

export const gstroke = (colors: string[], start: Vec, end: Vec, width: any, opacity: any = 100) => ({
  ty: 'gs',
  o: wrap(opacity),
  w: wrap(width),
  g: gradStops(colors),
  s: st(start),
  e: st(end),
  t: 1,
  lc: 2,
  lj: 2,
  ml: 4,
});

export const trim = (s: any, e: any, o: any = 0) => ({ ty: 'tm', s: wrap(s), e: wrap(e), o: wrap(o), m: 1 });

interface Tr { p?: any; a?: any; s?: any; r?: any; o?: any }
export const group = (items: any[], tr: Tr = {}) => ({
  ty: 'gr',
  nm: 'g',
  it: [
    ...items,
    {
      ty: 'tr',
      p: wrap(tr.p ?? [0, 0]),
      a: wrap(tr.a ?? [0, 0]),
      s: wrap(tr.s ?? [100, 100]),
      r: wrap(tr.r ?? 0),
      o: wrap(tr.o ?? 100),
      sk: st(0),
      sa: st(0),
    },
  ],
});

/* ---------- layers & document ---------- */
interface LayerOpts { p?: any; a?: any; s?: any; r?: any; o?: any; ip?: number; op?: number }
export const layer = (nm: string, shapes: any[], o: LayerOpts = {}) => ({
  ddd: 0,
  ty: 4,
  nm,
  sr: 1,
  ks: {
    o: wrap(o.o ?? 100),
    r: wrap(o.r ?? 0),
    p: wrap(o.p ?? [100, 100, 0]),
    a: wrap(o.a ?? [0, 0, 0]),
    s: wrap(o.s ?? [100, 100, 100]),
  },
  ao: 0,
  shapes,
  ip: o.ip,
  op: o.op,
  st: 0,
  bm: 0,
});

/** Layers are listed top-most first. */
export function doc(name: string, op: number, layers: ReturnType<typeof layer>[], size = 200, fr = 60) {
  return {
    v: '5.7.4',
    fr,
    ip: 0,
    op,
    w: size,
    h: size,
    nm: name,
    ddd: 0,
    assets: [],
    layers: layers.map((l, i) => ({ ...l, ind: i + 1, ip: l.ip ?? 0, op: l.op ?? op })),
  };
}
