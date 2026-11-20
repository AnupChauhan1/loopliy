import {
  doc, layer, group, ellipse, rect, path, fill, stroke, gfill, gstroke, trim, kf,
  EASE_BACK, EASE_OUT, EASE_INOUT, LINEAR,
} from './builder';

const EMERALD = '#00A878';
const TEAL = '#00936A';
const CYAN = '#007F5F';
const VIOLET = '#111827'; // near-black accent
const FUCHSIA = '#374151';
const AMBER = '#22BA8C';
const ROSE = '#00A878';
const SLATE = '#6B7280';
const WHITE = '#ffffff';

/* ------------------------------------------------------------------ */
/* Loader — three counter-rotating gradient arcs + pulsing core        */
/* ------------------------------------------------------------------ */
function buildLoader() {
  const OP = 120;
  const arc = (size: number, colors: string[], width: number, eFrames: [number, number][]) =>
    group([ellipse([size, size]), trim(0, kf(eFrames)), gstroke(colors, [-size / 2, 0], [size / 2, 0], width)]);
  return doc('loader', OP, [
    layer('orbit-dot', [
      group([ellipse([22, 22], [76, 0]), fill(EMERALD, 22)]),
      group([ellipse([10, 10], [76, 0]), fill(WHITE)]),
      group([ellipse([10, 10], [76, 0]), stroke(EMERALD, 3)]),
    ], { r: kf([[0, 0], [OP, 360]], LINEAR) }),
    layer('core', [
      group([ellipse([30, 30]), gfill([EMERALD, CYAN, VIOLET], [-15, -15], [15, 15])]),
      group([ellipse([52, 52]), fill(CYAN, 14)]),
    ], { s: kf([[0, [100, 100, 100]], [60, [128, 128, 100]], [OP, [100, 100, 100]]]) }),
    layer('arc-inner', [arc(72, [CYAN, EMERALD], 6, [[0, 25], [60, 70], [OP, 25]])], { r: kf([[0, 0], [OP, 720]], LINEAR) }),
    layer('arc-mid', [arc(110, [VIOLET, FUCHSIA], 6, [[0, 55], [60, 20], [OP, 55]])], { r: kf([[0, 360], [OP, 0]], LINEAR) }),
    layer('arc-outer', [arc(152, [EMERALD, TEAL, CYAN], 8, [[0, 20], [60, 62], [OP, 20]])], { r: kf([[0, 0], [OP, 360]], LINEAR) }),
    layer('tracks', [
      group([ellipse([152, 152]), stroke('#9CA3AF', 2, 18)]),
      group([ellipse([110, 110]), stroke('#9CA3AF', 2, 14)]),
      group([ellipse([72, 72]), stroke('#9CA3AF', 2, 12)]),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Success — pop circle, ring burst, drawn check, confetti particles   */
/* ------------------------------------------------------------------ */
function buildSuccess() {
  const OP = 96;
  const particleColors = [EMERALD, CYAN, VIOLET, AMBER, FUCHSIA, TEAL, EMERALD, CYAN];
  const particles = particleColors.map((c, i) => {
    const a = (i / particleColors.length) * Math.PI * 2 - Math.PI / 2;
    const d = 88;
    const size = i % 2 ? 9 : 12;
    return group([ellipse(kf([[22, [size, size]], [58, [3, 3]]], EASE_OUT)), fill(c)], {
      p: kf([[22, [Math.cos(a) * 40, Math.sin(a) * 40]], [58, [Math.cos(a) * d, Math.sin(a) * d]]], EASE_OUT),
      o: kf([[20, 0], [24, 100], [50, 100], [60, 0]], LINEAR),
    });
  });
  return doc('success', OP, [
    layer('check', [
      group([path([[-27, 2], [-8, 21], [29, -19]]), trim(0, kf([[24, 0], [46, 100]], EASE_OUT)), stroke(WHITE, 11)]),
    ]),
    layer('circle', [
      group([ellipse([128, 128]), gfill(['#22BA8C', EMERALD, TEAL, CYAN], [-64, -64], [64, 64])]),
      group([ellipse([128, 128]), stroke(WHITE, 3, 30)]),
    ], { s: kf([[0, [0, 0, 100]], [18, [112, 112, 100]], [28, [96, 96, 100]], [36, [100, 100, 100]]], EASE_OUT) }),
    layer('particles', particles),
    layer('burst', [
      group([ellipse(kf([[10, [70, 70]], [44, [196, 196]]], EASE_OUT)), stroke(EMERALD, kf([[10, 10], [44, 1]], EASE_OUT), kf([[10, 80], [44, 0]], LINEAR))]),
    ]),
    layer('halo', [group([ellipse([160, 160]), fill(EMERALD, 16)])], {
      s: kf([[4, [0, 0, 100]], [30, [100, 100, 100]], [62, [92, 92, 100]], [OP, [100, 100, 100]]], EASE_OUT),
    }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Empty — floating clipboard with shimmering lines & sparkles         */
/* ------------------------------------------------------------------ */
function buildEmpty() {
  const OP = 180;
  const sparkle = (p: number[], color: string, delay: number, size = 12) =>
    layer('sparkle', [group([rect([size, size], 2), fill(color)], { r: 45 })], {
      p: [100 + p[0], 100 + p[1], 0],
      s: kf(
        [
          [delay, [0, 0, 100]],
          [delay + 25, [100, 100, 100]],
          [delay + 50, [0, 0, 100]],
          ...(delay + 50 < OP ? ([[OP, [0, 0, 100]]] as [number, number[]][]) : []),
        ],
        EASE_INOUT,
      ),
      r: kf([[0, 0], [OP, 180]], LINEAR),
    });
  return doc('empty', OP, [
    sparkle([-66, -46], VIOLET, 0),
    sparkle([66, -24], EMERALD, 50, 10),
    sparkle([58, 52], CYAN, 100, 9),
    sparkle([-58, 40], AMBER, 130, 8),
    layer('card', [
      group([rect([40, 14], 7, [0, -60]), gfill([EMERALD, CYAN], [-20, 0], [20, 0])]),
      group([ellipse([12, 12], [-26, 38]), fill(EMERALD, 70)]),
      group([rect(kf([[0, [18, 7]], [70, [44, 7]], [110, [44, 7]], [OP, [18, 7]]]), 3.5, [8, 38]), fill('#93E0C6')]),
      group([rect([60, 7], 3.5, [0, 16]), fill('#C6EFE0')]),
      group([rect([60, 7], 3.5, [0, -4]), fill('#93E0C6')]),
      group([rect([40, 7], 3.5, [-10, -24]), fill('#D1D5DB')]),
      group([rect([100, 122], 18), stroke(EMERALD, 3, 55)]),
      group([rect([100, 122], 18), gfill([WHITE, '#F3FBF8', '#E8F8F2'], [0, -61], [0, 61])]),
    ], {
      p: kf([[0, [100, 94, 0]], [90, [100, 80, 0]], [OP, [100, 94, 0]]], EASE_INOUT),
      r: kf([[0, -3], [90, 3], [OP, -3]], EASE_INOUT),
    }),
    layer('shadow', [group([ellipse([92, 14]), fill(SLATE, 16)])], {
      p: [100, 176, 0],
      s: kf([[0, [100, 100, 100]], [90, [76, 76, 100]], [OP, [100, 100, 100]]], EASE_INOUT),
    }),
    layer('ring', [group([ellipse([178, 178]), stroke(EMERALD, 2, 22, { dash: 6, gap: 10 })])], { r: kf([[0, 0], [OP, 90]], LINEAR) }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Search — magnifier sweeping over a soft grid of “result” dots       */
/* ------------------------------------------------------------------ */
function buildSearch() {
  const OP = 150;
  const dots = [
    [-50, -40], [0, -40], [50, -40],
    [-50, 0], [0, 0], [50, 0],
    [-50, 40], [0, 40], [50, 40],
  ].map(([x, y], i) =>
    group([ellipse([14, 14]), fill(i % 3 === 0 ? VIOLET : i % 3 === 1 ? CYAN : EMERALD)], {
      p: [x, y],
      o: kf([[0, 18], [8 + i * 12, 55], [38 + i * 12, 18], [OP, 18]], EASE_INOUT),
    }),
  );
  return doc('search', OP, [
    layer('magnifier', [
      group([path([[22, 22], [46, 46]]), gstroke([VIOLET, FUCHSIA], [22, 22], [46, 46], 14)]),
      group([path([[-18, -10], [-8, -20]], false, [[0, 0], [-8, 0]], [[0, -8], [0, 0]]), stroke(WHITE, 5, 85)]),
      group([ellipse([64, 64]), gstroke([EMERALD, CYAN], [-32, -32], [32, 32], 9)]),
      group([ellipse([64, 64]), fill(CYAN, 16)]),
    ], {
      p: kf([[0, [92, 96, 0]], [38, [116, 84, 0]], [75, [108, 112, 0]], [112, [84, 88, 0]], [OP, [92, 96, 0]]], EASE_INOUT),
      r: kf([[0, -6], [75, 8], [OP, -6]], EASE_INOUT),
    }),
    layer('dots', dots),
    layer('frame', [group([rect([170, 150], 26), stroke('#9CA3AF', 2, 22, { dash: 5, gap: 9 })])]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Bell — swinging bell, delayed clapper, radiating sound waves        */
/* ------------------------------------------------------------------ */
function buildBell() {
  const OP = 120;
  const swing = kf([[0, 0], [10, 16], [22, -13], [34, 9], [46, -5], [58, 0], [OP, 0]], EASE_INOUT);
  const bellShape = path(
    [[0, -40], [30, -8], [34, 24], [46, 32], [-46, 32], [-34, 24], [-30, -8]],
    true,
    [[-18, 0], [-2, -18], [-2, -8], [-6, -2], [0, 0], [-2, 4], [-2, 14]],
    [[18, 0], [2, 14], [2, 4], [0, 0], [6, -2], [2, -8], [2, -18]],
  );
  const wave = (side: 1 | -1, r: number, delay: number) =>
    group([
      path([[side * r * 0.8, -r * 0.55], [side * r, 0], [side * r * 0.8, r * 0.55]], false, [[0, 0], [0, -r * 0.3], [0, 0]], [[0, 0], [0, r * 0.3], [0, 0]]),
      stroke(side > 0 ? CYAN : EMERALD, 5, kf([[delay, 0], [delay + 10, 100], [delay + 34, 0], [OP, 0]], LINEAR)),
    ]);
  return doc('bell', OP, [
    layer('badge', [
      group([ellipse([22, 22]), fill(ROSE)]),
      group([ellipse([22, 22]), stroke(WHITE, 4)]),
    ], { p: [134, 62, 0], s: kf([[0, [100, 100, 100]], [8, [130, 130, 100]], [18, [100, 100, 100]], [OP, [100, 100, 100]]], EASE_BACK) }),
    layer('bell', [
      group([ellipse([18, 18], [0, 42]), gfill([TEAL, CYAN], [-9, 33], [9, 51])], {
        p: kf([[4, [0, 0]], [14, [-7, 0]], [26, [7, 0]], [38, [-4, 0]], [50, [2, 0]], [62, [0, 0]], [OP, [0, 0]]], EASE_INOUT),
      }),
      group([path([[-20, -22], [-26, 6]], false, [[0, 0], [2, -10]], [[-5, 6], [0, 0]]), stroke(WHITE, 5, 55)]),
      group([bellShape, gfill(['#22BA8C', EMERALD, TEAL, CYAN], [-40, -40], [40, 32])]),
      group([ellipse([14, 14], [0, -44]), fill(EMERALD)]),
    ], { a: [0, -48, 0], p: [100, 54, 0], r: swing }),
    layer('waves', [wave(-1, 58, 4), wave(1, 58, 4), wave(-1, 76, 14), wave(1, 76, 14)], { p: [100, 100, 0] }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Pending — clock face with sweeping hands and orbiting dashed ring   */
/* ------------------------------------------------------------------ */
function buildPending() {
  const OP = 240;
  const ticks = Array.from({ length: 12 }, (_, i) =>
    group([rect(i % 3 === 0 ? [5, 12] : [3, 7], 2, [0, -47]), fill(VIOLET, i % 3 === 0 ? 85 : 45)], { r: i * 30 }),
  );
  return doc('pending', OP, [
    layer('center', [group([ellipse([14, 14]), fill(WHITE)]), group([ellipse([14, 14]), stroke('#111827', 4)])]),
    layer('minute', [group([rect([7, 46], 3.5, [0, -18]), gfill([VIOLET, FUCHSIA], [0, 5], [0, -41])])], { r: kf([[0, 0], [OP, 720]], LINEAR) }),
    layer('hour', [group([rect([8, 32], 4, [0, -11]), fill('#111827')])], { r: kf([[0, 0], [OP, 360]], LINEAR) }),
    layer('ticks', ticks),
    layer('face', [
      group([ellipse([118, 118]), stroke(VIOLET, 6)]),
      group([ellipse([118, 118]), gfill([WHITE, '#F9FAFB', '#F3F4F6'], [0, -59], [0, 59])]),
    ]),
    layer('orbit-dot', [group([ellipse([12, 12], [80, 0]), fill(AMBER)]), group([ellipse([24, 24], [80, 0]), fill(AMBER, 22)])], {
      r: kf([[0, 0], [OP, -360]], LINEAR),
    }),
    layer('ring', [group([ellipse([160, 160]), gstroke([VIOLET, FUCHSIA, CYAN], [-80, 0], [80, 0], 3, 70)])], {
      s: kf([[0, [100, 100, 100]], [120, [106, 106, 100]], [OP, [100, 100, 100]]], EASE_INOUT),
    }),
    layer('glow', [group([ellipse([178, 178]), fill(VIOLET, 8)])]),
  ]);
}

export const LOTTIE = {
  loader: buildLoader(),
  success: buildSuccess(),
  empty: buildEmpty(),
  search: buildSearch(),
  bell: buildBell(),
  pending: buildPending(),
};

export type LottieName = keyof typeof LOTTIE;
