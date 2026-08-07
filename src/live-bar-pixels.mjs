// The transport bar as it appears ON SCREEN, against the browser's.
//
// Its sibling, bar-pixels.mjs, compares the browser against a frame rendered by
// a Compose unit test. That proves the layout composes and it cannot prove the
// player draws it — the chrome's second title line was correct in the composed
// frame and unreachable in the running app for want of three fields on the
// testbed's items, which is exactly the gap a unit-test-altitude check cannot
// see.
//
// So this one takes a photograph of the RUNNING desktop player, the same
// capture a person looking at their screen would take, and finds the bar in it
// rather than being told where it is. Nothing here is derived from a source
// file: if the player draws the bar somewhere else, this finds it somewhere
// else and says so.
//
//   node live-bar-pixels.mjs <web.png> <web-overlays.json> <app-window.png>

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [webShot, webGeom, appShot] = process.argv.slice(2);
if (!webShot || !webGeom || !appShot) {
	console.error('usage: live-bar-pixels.mjs <web.png> <web-overlays.json> <app-window.png>');
	process.exit(2);
}

const doc = JSON.parse(readFileSync(webGeom, 'utf8'));
const bar = doc.elements.find(e => e.name === 'bottom-row');
if (!bar) {
	console.error(`no #bottom-row in ${webGeom}`);
	process.exit(2);
}
const basis = doc.viewport ?? doc.container;
const webBox = [
	bar.left / basis.width,
	bar.top / basis.height,
	bar.widthPx / basis.width,
	bar.heightPx / basis.height,
];

const script = `
from PIL import Image
import sys, json

web = Image.open(sys.argv[1]).convert('L')
app = Image.open(sys.argv[3]).convert('L')
wl, wt, ww, wh = json.loads(sys.argv[2])

def inked(im, cols=64):
    w, h = im.size
    px = im.point(lambda v: 255 if v > 110 else 0).load()
    out = []
    for c in range(cols):
        x0, x1 = c * w // cols, max(c * w // cols + 1, (c + 1) * w // cols)
        hits = sum(1 for x in range(x0, x1) for y in range(h) if px[x, y])
        out.append(hits / ((x1 - x0) * h))
    return out

# Find the bar in the photograph, by looking for it.
#
# The controls are small bright marks on a dark scrim, spread right across the
# frame. A row through them has ink in many separate places; a row through the
# picture above has either almost none or a solid run. So the bar is the lowest
# band of rows whose ink is spread over enough of the width, searched from the
# bottom up because that is where the chrome lives and a busy frame can look
# similar higher up.
w, h = app.size
px = app.point(lambda v: 255 if v > 110 else 0).load()

def spread(y, buckets=32):
    hit = [0] * buckets
    for x in range(w):
        if px[x, y]:
            hit[x * buckets // w] = 1
    return sum(hit)

# Only where the chrome lives. Searching the bottom third let a subtitle line
# sitting directly above the bar join the same cluster and returned a band of
# 203 rows — the bar plus the cue plus the gap between them.
rows = [y for y in range(int(h * 0.86), h) if spread(y) >= 20]
if not rows:
    sys.exit('no control row found in the app capture — is the chrome awake?')

# The lowest CLUSTER, allowing gaps.
#
# A strictly contiguous run stops at the first row that happens to fall between
# the strokes of every glyph at once — it returned an eight-pixel sliver of a
# forty-pixel row, and comparing a sliver against the whole web bar reported a
# difference five times the real one. Icons are not solid; a few blank rows
# inside a row of them are still that row.
GAP = 6
seen = sorted(rows)
end = seen[-1]
start = end
for y in reversed(seen):
    if start - y <= GAP:
        start = y
    else:
        break

# Left and right edges of that band, so a window with letterboxing either side
# does not stretch the profile across dead pixels.
xs = [x for x in range(w) for y in range(start, end + 1) if px[x, y]]
left, right = min(xs), max(xs)

a = inked(web.crop((int(wl * web.size[0]), int(wt * web.size[1]),
                    int((wl + ww) * web.size[0]), int((wt + wh) * web.size[1]))))
b = inked(app.crop((left, start, right + 1, end + 1)))
diff = sum(abs(x - y) for x, y in zip(a, b)) / len(a)

print(json.dumps({
    'foundBar': {'left': left, 'top': start, 'width': right - left + 1, 'height': end - start + 1},
    'columns': len(a),
    'inkedWeb': sum(1 for v in a if v > 0),
    'inkedApp': sum(1 for v in b if v > 0),
    'meanInkDifference': round(diff, 4),
}))
`;

const out = execFileSync('python', ['-c', script, webShot, JSON.stringify(webBox), appShot], { encoding: 'utf8' });
const result = JSON.parse(out.trim().split('\n').pop());

const box = result.foundBar;
console.log(`found the bar on screen at ${box.left},${box.top} ${box.width}x${box.height}`);
console.log(`inked columns: web ${result.inkedWeb}, app ${result.inkedApp}`);
console.log(`mean difference ${result.meanInkDifference}`);

// An empty crop agrees with everything, and a bar found in the wrong place is
// the same failure wearing a number.
if (result.inkedWeb === 0 || result.inkedApp === 0) {
	console.error('nothing inked on one side — the comparison means nothing');
	process.exit(2);
}

const passed = result.meanInkDifference <= 0.25;
console.log(passed
	? 'the player draws its bar the way the browser does'
	: 'the player does not draw its bar the way the browser does');
process.exit(passed ? 0 : 1);
