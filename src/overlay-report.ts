import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NATIVE } from './paths';
import { compareGeometry, compareOverlays, nativeTags, type OverlayMeasurement } from './overlays';

// `npx tsx src/overlay-report.ts <web-overlays.json> [native-geometry.json]` —
// every overlay element the web player draws on screen, whether the native
// chrome has one, and whether it lands in the same place.
//
// Both inputs are MEASURED. The web side comes from
// scripts/web-overlay-geometry.mjs against the running testbed; the native side
// from OverlayGeometryDumpTest, which composes the chrome and reads the bounds
// off the semantics tree. A report built from stylesheets and Kotlin constants
// would describe a layout nobody has seen, and two files can agree on a
// constant while both are laid out wrong.
const measurementPath = process.argv[2];
if (!measurementPath) {
	process.stderr.write('usage: overlay-report.ts <web-overlays.json> [native-geometry.json]\n');
	process.stderr.write('  NOMERCY_CDP_PORT=9333 node scripts/web-overlay-geometry.mjs > web-overlays.json\n');
	process.stderr.write('  ./gradlew :ui-compose:jvmTest --tests "*OverlayGeometryDumpTest*"\n');
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

const nativePath = process.argv[3];
if (nativePath) {
	const nativeMeasured: OverlayMeasurement = JSON.parse(readFileSync(nativePath, 'utf8'));
	const drift = compareGeometry(measured, nativeMeasured);

	process.stdout.write(
		`geometry: ${nativeMeasured.elements.length} native element(s) measured at `
		+ `${nativeMeasured.container.width}x${nativeMeasured.container.height}\n`,
	);

	if (!drift.length) {
		process.stdout.write('every measured counterpart lands where the reference lays it out\n');
	}
	else {
		process.stdout.write(`${drift.length} element(s) do not match:\n`);
		for (const row of drift) {
			process.stdout.write(`  ${row.id} -> ${row.nativeTag}  ${row.what}: web ${row.web}, native ${row.native}\n`);
		}
	}
}
