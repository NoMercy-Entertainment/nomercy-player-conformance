import { readContract } from './compare';
import { nativeEmissions } from './emission';

// `npx tsx src/emission-report.ts` — which contract events cannot reach anyone.
const contract = readContract();
const { reachable, dead } = nativeEmissions();

const wanted: string[] = [...new Set(contract.events.map(event => event.name))].sort();
const live = new Set(reachable);
const buried = new Set(dead);

const unreachable: string[] = wanted.filter(name => buried.has(name));
const absent: string[] = wanted.filter(name => !live.has(name) && !buried.has(name));

process.stdout.write(`${wanted.length} contract events\n`);
process.stdout.write(`  ${wanted.filter(name => live.has(name)).length} referenced outside their declaration\n`);
process.stdout.write(`  ${unreachable.length} declared and unreachable — nothing can emit these\n`);
process.stdout.write(`  ${absent.length} no native key at all\n\n`);

process.stdout.write(`unreachable (${unreachable.length}):\n`);
for (const name of unreachable) process.stdout.write(`  ${name}\n`);

process.stdout.write(`\nno native key (${absent.length}):\n`);
for (const name of absent) process.stdout.write(`  ${name}\n`);
