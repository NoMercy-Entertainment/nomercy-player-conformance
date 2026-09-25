import { readContract } from './compare';
import { nativeEmissions } from './emission';
import { DYNAMIC_EMITS, EMISSION_WAIVERS } from './emission-waivers';

// `npx tsx src/emission-report.ts` — which contract events cannot reach anyone.
//
// Two ledgers sit between the scan and the number. DYNAMIC_EMITS names events
// this scan cannot see because the emit builds its key from a runtime string,
// and they are counted as reachable because they are. EMISSION_WAIVERS names
// events the port deliberately never emits, with the reason, and they leave the
// denominator because they are not something a port owes.
//
// Without both, this reported three events that had been firing all along and
// six whose absence the code already explains at the site — and the reasoning
// was re-derived by hand each time the number was questioned.
const contract = readContract();
const { reachable, dead } = nativeEmissions();

const wanted: string[] = [...new Set(contract.events.map(event => event.name))].sort();
const live = new Set([...reachable, ...Object.keys(DYNAMIC_EMITS)]);
const buried = new Set(dead);

const owed: string[] = wanted.filter(name => !(name in EMISSION_WAIVERS));
const unreachable: string[] = owed.filter(name => !live.has(name) && buried.has(name));
const absent: string[] = owed.filter(name => !live.has(name) && !buried.has(name));
const waived: string[] = wanted.filter(name => name in EMISSION_WAIVERS);

process.stdout.write(`${owed.length} contract events a port owes (${wanted.length} declared, ${waived.length} waived)\n`);
process.stdout.write(`  ${owed.filter(name => live.has(name)).length} reachable\n`);
process.stdout.write(`  ${unreachable.length} declared and unreachable — nothing can emit these\n`);
process.stdout.write(`  ${absent.length} no native key at all\n\n`);

process.stdout.write(`unreachable (${unreachable.length}):\n`);
for (const name of unreachable) process.stdout.write(`  ${name}\n`);

process.stdout.write(`\nno native key (${absent.length}):\n`);
for (const name of absent) process.stdout.write(`  ${name}\n`);

process.stdout.write(`\nwaived (${waived.length}):\n`);
for (const name of waived) process.stdout.write(`  ${name} — ${EMISSION_WAIVERS[name]}\n`);

process.stdout.write(`\nemitted by a runtime-built key, invisible to the scan (${Object.keys(DYNAMIC_EMITS).length}):\n`);
for (const [name, where] of Object.entries(DYNAMIC_EMITS)) process.stdout.write(`  ${name} — ${where}\n`);
