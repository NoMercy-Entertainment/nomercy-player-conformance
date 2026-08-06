import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NATIVE } from './paths';
import { compareOverlays, nativeTags, type OverlayMeasurement } from './overlays';

// `npx tsx src/overlay-report.ts <web-overlays.json>` — every overlay element
// the web player draws on screen, and whether the native chrome has one.
//
// The input is MEASURED, from scripts/web-overlay-geometry.mjs against the
// running testbed. A report built from the stylesheet instead would describe a
// layout nobody has seen.
const measurementPath = process.argv[2];
if (!measurementPath) {
	process.stderr.write('usage: overlay-report.ts <web-overlays.json>\n');
	process.stderr.write('  NOMERCY_CDP_PORT=9333 node scripts/web-overlay-geometry.mjs > web-overlays.json\n');
	process.exit(2);
}

const measured: OverlayMeasurement = JSON.parse(readFileSync(measurementPath, 'utf8'));

function kotlinSources(root: string, into: string[] = []): string[] {
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		if (statSync(path).isDirectory()) kotlinSources(path, into);
		else if (entry.endsWith('.kt')) into.push(readFileSync(path, 'utf8'));
	}
	return into;
}

const tags = nativeTags([
	...kotlinSources(join(NATIVE.video.root, 'src')),
	...kotlinSources(join(NATIVE.video.root, 'ui-compose', 'src')),
]);

const { findings, matched, total } = compareOverlays(measured, tags);

process.stdout.write(
	`${matched}/${total} overlay elements measured on the web player have a native counterpart\n`,
);
process.stdout.write(
	`measured at ${measured.container.width}x${measured.container.height}, ${measured.elements.length} identified element(s)\n\n`,
);

for (const verdict of ['missing', 'unmapped'] as const) {
	const rows = findings.filter(f => f.verdict === verdict);
	if (!rows.length) continue;
	process.stdout.write(`${verdict} (${rows.length}):\n`);
	for (const row of rows) {
		process.stdout.write(`  ${row.id}${row.nativeTag ? ` -> ${row.nativeTag}` : ''} — ${row.note ?? ''}\n`);
	}
	process.stdout.write('\n');
}
