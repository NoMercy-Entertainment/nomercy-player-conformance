// A frame-buffer comparison of the two transport bars.
//
// Geometry says the boxes are in the same places; this says what is DRAWN in
// them. It is the last question the overlay report cannot answer, and the one
// that needs two real screenshots rather than two measurements.
//
// Compared as INK, not as colour-per-pixel. Two different text rasterisers
// drawing the same glyph disagree on every antialiased edge, so a raw diff of
// Skia against a browser reports a hundred percent difference on a bar that
// looks identical. What survives that and still means something is how much of
// each row is covered — where the controls are, how wide their marks are, and
// whether the gaps between them line up.
//
//   node bar-pixels.mjs <web.png> <web-overlays.json> <native.png> <native-overlays.json>
//
// Both sides take a frame and the geometry OF THAT FRAME. The native box used
// to be typed in by hand as `l,t,w,h`, which is how a density factor gets in
// unseen: the dump reports 1280x720 in dp and Skia writes the PNG at 1024x711,
// so a hand-typed box crops the wrong eighty percent of the bar and the
// difference it reports is the crop. Every box here is resolved against the
// dimensions of the image it is read from.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [webShot, webGeom, natShot, natGeom] = process.argv.slice(2);
if (!webShot || !webGeom || !natShot || !natGeom) {
	console.error('usage: bar-pixels.mjs <web.png> <web-overlays.json> <native.png> <native-overlays.json>');
	process.exit(2);
}

// The bar, from either producer's shape.
//
// Two scripts write these files: web-overlay-geometry.mjs normalises every box
// to the container and web-overlay-shot.mjs writes viewport pixels, because it
// exists to pair a measurement with the frame it describes. Reading only one
// shape meant the pairing script's output silently multiplied a pixel by a
// container width and cropped off the image entirely.
const barOf = (path, name) => {
	const doc = JSON.parse(readFileSync(path, 'utf8'));
	const el = doc.elements.find(e => e.name === 'bottom-row' || e.name === 'nm-transport-bar');
	if (!el) throw new Error(`no transport bar in the ${name} measurement (${path})`);

	const normalised = el.width !== undefined && el.width <= 1;
	if (normalised) return { left: el.left, top: el.top, width: el.width, height: el.height };

	// Pixels are normalised against the rectangle the FRAME is of, which is the
	// viewport — not the container. Those are the same only when the player
	// fills the page, and when they were not, this cropped a strip of empty
	// page and compared it against a full native bar. Nothing inked, so
	// nothing differed, and it printed that the two bars matched.
	const basis = doc.viewport ?? doc.container;
	return {
		left: el.left / basis.width,
		top: el.top / basis.height,
		width: el.widthPx / basis.width,
		height: el.heightPx / basis.height,
	};
};

const web = barOf(webGeom, 'web');
const native = barOf(natGeom, 'native');

// Python does the pixels: Pillow is already the image tool in this repo and a
// pure-JS decoder would be a dependency for one histogram.
const script = `
from PIL import Image
import sys, json

def crop(path, box):
    im = Image.open(path).convert('L')
    w, h = im.size
    l, t, bw, bh = box
    return im.crop((int(l * w), int(t * h), int((l + bw) * w), int((t + bh) * h)))

def ink(im, cols=64):
    # Threshold FIRST, then aggregate.
    #
    # Resizing to 64x16 and thresholding the result averages a one-pixel white
    # stroke against the black around it, and the average lands far below any
    # threshold that means "ink" — so a bar of twenty crisp white glyphs came
    # back with three inked columns out of sixty-four. The marks on a transport
    # bar are thin by nature; a comparison that cannot see thin marks is not
    # comparing the bar.
    w, h = im.size
    px = im.point(lambda v: 255 if v > 110 else 0).load()
    out = []
    for c in range(cols):
        x0, x1 = c * w // cols, max(c * w // cols + 1, (c + 1) * w // cols)
        hits = sum(1 for x in range(x0, x1) for y in range(h) if px[x, y])
        out.append(hits / ((x1 - x0) * h))
    return out

a = ink(crop(sys.argv[1], json.loads(sys.argv[2])))
b = ink(crop(sys.argv[3], json.loads(sys.argv[4])))
diff = sum(abs(x - y) for x, y in zip(a, b)) / len(a)

# Where they disagree, not just how much. A single mean cannot tell a bar whose
# controls are all slightly fatter from one missing a control at the right end,
# and those two want opposite fixes.
worst = sorted(range(len(a)), key=lambda i: -abs(a[i] - b[i]))[:6]
print(json.dumps({
    'columns': len(a),
    'meanInkDifference': round(diff, 4),
    'inkedWeb': sum(1 for v in a if v > 0),
    'inkedNative': sum(1 for v in b if v > 0),
    'worstColumns': [{'column': i, 'web': round(a[i], 2), 'native': round(b[i], 2)} for i in worst],
}))
`;

const box = b => JSON.stringify([b.left, b.top, b.width, b.height]);
const out = execFileSync(
	'python',
	['-c', script, webShot, box(web), natShot, box(native)],
	{ encoding: 'utf8' },
);
const result = JSON.parse(out.trim().split('\n').pop());

console.log(`transport bar ink profile over ${result.columns} columns`);
console.log(`inked columns: web ${result.inkedWeb}, native ${result.inkedNative}`);
refuseIfDifferentControls(result.inkedWeb, result.inkedNative, 'web', 'native');
console.log(`mean difference ${result.meanInkDifference}`);
for (const c of result.worstColumns) {
	console.log(`  column ${c.column}: web ${c.web} native ${c.native}`);
}

// An empty crop agrees with everything.
//
// The first run of this printed "the two bars distribute their marks the same
// way" over a web crop with nothing in it at all. A comparison whose inputs are
// blank has not found a match, it has found no data, and the two must never
// report the same thing.
if (result.inkedWeb === 0 || result.inkedNative === 0) {
	console.error(
		`nothing inked on the ${result.inkedWeb === 0 ? 'web' : 'native'} side — `
		+ 'the crop is empty, so this comparison means nothing. Check the box against the frame.',
	);
	process.exit(2);
}

const passed = result.meanInkDifference <= 0.25;
console.log(passed
	? 'the two bars distribute their marks the same way'
	: 'the two bars do not distribute their marks the same way');

// A gate, not a printout. This ran as a report for its whole life and nothing
// consumed the number, which is the same shape as the geometry export that had
// no reader.
process.exit(passed ? 0 : 1);

// The two bars have to be drawing the SAME CONTROLS before their ink means
// anything.
//
// This tool sums ink across the bar, so a bar with two extra glyphs has more
// inked columns however correctly each one is placed. Rail Wars reported
// `web 36, app 63` and a 0.48 difference twice - once with the web player
// stopped and once with it confirmed playing at 5.90s, readyState 4, which is
// what proved the playback state was never the cause. The app drew seek-back
// and seek-forward that the web page did not, and the web drew a quality button
// the app did not.
//
// The geometry report already carries this guard and states the reason beside
// it: one absent control shifts every control after it, and that is a
// difference between fixtures rather than between layouts. This sibling summed
// pixels for months without it.
function refuseIfDifferentControls(a, b, labelA, labelB) {
	// Inside the function, not beside it: the call site runs before a top-level
	// const at the bottom of the file is initialised, so the guard threw a
	// temporal-dead-zone error instead of guarding anything.
	const COMPARABLE_INK_RATIO = 0.15;

	const larger = Math.max(a, b);
	const smaller = Math.min(a, b);
	if (larger === 0) return;
	if ((larger - smaller) / larger <= COMPARABLE_INK_RATIO) return;

	console.log(`NOT COMPARABLE: ${labelA} ${a} vs ${labelB} ${b} inked columns`);
	console.log('  The two bars are not drawing the same controls, so their ink cannot be compared.');
	console.log('  Match the control sets - or the fixtures - and run it again.');
	process.exit(3);
}
