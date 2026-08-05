import { readFileSync } from 'node:fs';

import { nativeErrors, nativeEvents } from './native-strings';
import { excusedErrors, excusedNatively } from './native-waivers';
import { callableArities, NativeMember, parseAbiDump, resolveMembers } from './native-surface';
import { CONTRACT, NATIVE, PLAYER_CLASS, WAIVERS } from './paths';

export type Player = 'video' | 'music';

export interface ContractMethod {
  name: string;
  signature: string;
  player: Player;
  group: string;
  kind: 'accessor' | 'method' | 'property';
  arities: number[];
}

export interface Contract {
  version: string;
  events: { name: string; payload: string; map: string }[];
  methods: ContractMethod[];
  errors: string[];
}

/**
 * `ok` — callable natively the way the web contract describes it.
 * `reader-only` / `writer-only` — a stateful noun ported as half a pair. The
 *   name is present, so a name-only check calls this done; it is not.
 * `renamed` — present, but as `getFoo`/`setFoo` where the contract names a
 *   callable pair. The no-aliases rule bans that spelling.
 * `arity` — the name is there but not callable the way the contract shows it.
 *   The web's `selectAudioOutput()` opens a picker; a native one taking a device
 *   id is a different action wearing the same name.
 * `waived` — the web declares it because it is the web. A waiver carries a
 *   reason and is listed, never silently folded into the total.
 * `missing` — no native declaration answers it.
 */
export type Verdict = 'ok' | 'reader-only' | 'writer-only' | 'arity' | 'renamed' | 'waived' | 'missing';

export interface MethodResult {
  name: string;
  player: Player;
  group: string;
  kind: ContractMethod['kind'];
  verdict: Verdict;
  /** How the native side spells it, when it does. */
  native: string;
}

export function readContract(path: string = CONTRACT): Contract {
  return JSON.parse(readFileSync(path, 'utf8')) as Contract;
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function describe(member: NativeMember): string {
  return `${member.name}(${member.arity})${member.suspend ? ' suspend' : ''} -> ${member.returns}`;
}

export function indexMembers(members: NativeMember[]): Map<string, NativeMember[]> {
  const byName = new Map<string, NativeMember[]>();
  for (const member of members) byName.set(member.name, [...(byName.get(member.name) ?? []), member]);
  return byName;
}

export function grade(method: ContractMethod, byName: Map<string, NativeMember[]>, waiver: string | undefined): MethodResult {
  const base = { name: method.name, player: method.player, group: method.group, kind: method.kind };

  const direct = byName.get(method.name) ?? [];
  // A Kotlin val renders as `getFoo()`. That IS the port of a data property,
  // and it is a rename of a callable pair.
  const accessors = [
    ...(byName.get(`get${capitalize(method.name)}`) ?? []),
    ...(byName.get(`set${capitalize(method.name)}`) ?? []),
  ];

  const found = [...direct, ...accessors];
  if (waiver && found.length === 0) return { ...base, verdict: 'waived', native: waiver };

  if (method.kind === 'property') {
    return found.length > 0
      ? { ...base, verdict: 'ok', native: found.map(describe).join(' | ') }
      : { ...base, verdict: 'missing', native: '' };
  }

  if (direct.length === 0) {
    return accessors.length > 0
      ? { ...base, verdict: 'renamed', native: accessors.map(describe).join(' | ') }
      : { ...base, verdict: 'missing', native: '' };
  }

  if (method.kind === 'method') {
    const native = direct.map(describe).join(' | ');
    const callable = new Set(direct.flatMap(callableArities));
    const reachable = method.arities.length === 0 || method.arities.some(arity => callable.has(arity));

    return { ...base, verdict: reachable ? 'ok' : 'arity', native };
  }

  // A stateful noun needs both halves: the no-argument reader and the writer.
  const reader = direct.some(member => member.arity === 0);
  const writer = direct.some(member => member.arity >= 1);
  const native = direct.map(describe).join(' | ');

  if (reader && writer) return { ...base, verdict: 'ok', native };
  return { ...base, verdict: reader ? 'reader-only' : 'writer-only', native };
}

export interface GroupResult {
  group: string;
  player: Player;
  total: number;
  ok: number;
  waived: number;
  methods: MethodResult[];
}

export interface StringSurface {
  total: number;
  present: number;
  waived: number;
  missing: string[];
  /** Native strings the web contract never names. */
  extra: string[];
}

export interface ParityResult {
  contractVersion: string;
  /** Waived without a written reason, and reasons excusing nothing. */
  ledgerDisagreements: string[];
  groups: GroupResult[];
  /** Public native members on the player that the contract never names. */
  extra: { player: Player; member: string }[];
  totals: { total: number; ok: number; waived: number; gaps: number };
  events: StringSurface;
  errors: StringSurface;
}

function gradeStrings(web: string[], native: Set<string>, excused: Set<string> = new Set()): StringSurface {
  const wanted = new Set(web);
  const gradeable = [...wanted].filter(name => !excused.has(name));

  return {
    total: gradeable.length,
    present: gradeable.filter(name => native.has(name)).length,
    waived: wanted.size - gradeable.length,
    missing: gradeable.filter(name => !native.has(name)).sort(),
    extra: [...native].filter(name => !wanted.has(name)).sort(),
  };
}

/**
 * A waiver says the web declares something because it is the web, and names the
 * reason. It is the only way a method leaves the gap list without a native
 * declaration, it never counts as parity, and the report prints every one — an
 * unexplained exemption is how a port grades itself.
 */
export type Waivers = Record<string, string>;

export function readWaivers(path: string = WAIVERS): Waivers {
  return JSON.parse(readFileSync(path, 'utf8')) as Waivers;
}

function surfaceOf(player: Player): Map<string, NativeMember[]> {
  const dumps = [parseAbiDump(NATIVE.core.jvmApi), parseAbiDump(NATIVE[player].jvmApi)];
  return indexMembers(resolveMembers(PLAYER_CLASS[player], dumps));
}

export function compare(contract: Contract = readContract(), waivers: Waivers = readWaivers()): ParityResult {
  const groups = new Map<string, GroupResult>();
  const extra: ParityResult['extra'] = [];
  const excused = excusedNatively();

  const ledgerDisagreements = [
    ...[...excused].filter(name => !waivers[name]).map(name => `${name}: excused by the libraries with no reason written here`),
    ...Object.keys(waivers).filter(name => !excused.has(name)).map(name => `${name}: a reason here that no library excuses`),
  ].sort();

  for (const player of ['video', 'music'] as const) {
    const byName = surfaceOf(player);
    const named = new Set<string>();

    for (const method of contract.methods.filter(entry => entry.player === player)) {
      const result = grade(method, byName, excused.has(method.name) ? (waivers[method.name] ?? 'excused by the library with no reason written') : undefined);
      named.add(method.name);
      named.add(`get${capitalize(method.name)}`);
      named.add(`set${capitalize(method.name)}`);

      const key = `${player}:${method.group}`;
      const group = groups.get(key) ?? { group: method.group, player, total: 0, ok: 0, waived: 0, methods: [] };
      group.total += 1;
      if (result.verdict === 'ok') group.ok += 1;
      if (result.verdict === 'waived') group.waived += 1;
      group.methods.push(result);
      groups.set(key, group);
    }

    for (const name of byName.keys()) {
      if (!named.has(name)) extra.push({ player, member: name });
    }
  }

  const ordered = [...groups.values()].sort((a, b) => `${a.player}:${a.group}`.localeCompare(`${b.player}:${b.group}`));

  return {
    contractVersion: contract.version,
    ledgerDisagreements,
    groups: ordered,
    extra: extra.sort((a, b) => `${a.player}:${a.member}`.localeCompare(`${b.player}:${b.member}`)),
    totals: {
      total: ordered.reduce((sum, group) => sum + group.total, 0),
      ok: ordered.reduce((sum, group) => sum + group.ok, 0),
      waived: ordered.reduce((sum, group) => sum + group.waived, 0),
      gaps: ordered.reduce((sum, group) => sum + group.total - group.ok - group.waived, 0),
    },
    events: gradeStrings(contract.events.map(event => event.name), nativeEvents()),
    errors: gradeStrings(contract.errors, nativeErrors(), excusedErrors()),
  };
}
