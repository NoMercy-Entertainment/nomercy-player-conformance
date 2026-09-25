import { readFileSync } from 'node:fs';

// The native side of the ruler.
//
// The oracle is the web contract; the thing graded against it has to be the
// PUBLISHED surface, not what a source read suggests is there. The binary
// compatibility dump is that surface — it is generated from the compiled
// artifact, it is what a consumer can actually call, and it is already checked
// in and gated, so this reads it rather than re-deriving it from Kotlin source
// and disagreeing with the gate.

export interface NativeMember {
  /** As rendered: `aspectRatio`, `getVideoBridge`, `play$default`. */
  name: string;
  /** JVM parameter descriptors, verbatim. */
  params: string;
  /** JVM return descriptor. */
  returns: string;
  /** Parameter count, with a suspend function's trailing Continuation dropped. */
  arity: number;
  suspend: boolean;
  /** True when some parameter has a default, so shorter call sites are legal. */
  hasDefaults: boolean;
  /** The declaring class, so a report can say where a member came from. */
  owner: string;
}

export interface NativeClass {
  name: string;
  supertypes: string[];
  members: NativeMember[];
}

const CLASS_HEADER = /^public\s+(?:[a-z]+\s+)*(?:class|interface)\s+([\w/$]+)(?:\s*:\s*(.+?))?\s*\{$/;
// `protected` as well as `public`.
//
// The dump carries both and this matched only the first, so every member a
// plugin exposes to its own subclasses was invisible. VideoKeyHandlerPlugin
// declares eleven `protected fun addXKeys()` — the exact names the web plugin
// declares — and the report read 0 of 20 for a class that had them all. A
// ruler that cannot see half the members manufactures the gap it then measures.
const MEMBER = /^\t(?:public|protected)\s+((?:[a-z]+\s+)*)fun\s+([\w$<>-]+)\s*\((.*)\)(.*)$/;

const CONTINUATION = 'Lkotlin/coroutines/Continuation;';

/**
 * Count JVM descriptors in a parameter string. `Ljava/lang/String;D[I` is three:
 * a reference, a double, and an int array. Splitting on `;` would miss every
 * primitive, and every accessor pair is told apart by arity alone.
 */
export function countParams(params: string): number {
  let count = 0;

  for (let index = 0; index < params.length; index += 1) {
    const char = params[index];
    if (char === '[') continue; // array prefix — belongs to the element that follows

    count += 1;
    if (char === 'L') index = params.indexOf(';', index);
    if (index === -1) break; // malformed descriptor: stop rather than loop forever
  }

  return count;
}

export function parseAbiDump(path: string): Map<string, NativeClass> {
  const classes = new Map<string, NativeClass>();
  const defaulted = new Set<string>();
  let current: NativeClass | undefined;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const header = CLASS_HEADER.exec(line);
    if (header) {
      current = {
        name: header[1],
        supertypes: (header[2] ?? '').split(',').map(part => part.trim()).filter(Boolean),
        members: [],
      };
      classes.set(current.name, current);
      continue;
    }

    if (line === '}') {
      current = undefined;
      continue;
    }

    const member = MEMBER.exec(line);
    if (!member || !current) continue;

    const modifiers = member[1];
    const name = member[2];

    // `synthetic` members are compiler artifacts: the `$default` bridges for
    // default arguments and the boxed constructor overloads. A port that
    // exposed only those would read as complete while calling one from Kotlin
    // is not how anybody writes it.
    if (name === '<init>') continue;

    // The `$default` bridge is a compiler artifact nobody calls, but its
    // existence is the only evidence in the dump that a parameter has a default
    // — which is what makes the shorter call site legal. It is recorded as a
    // marker and never as a member.
    if (name.endsWith('$default')) {
      defaulted.add(name.slice(0, -'$default'.length));
      continue;
    }

    if (modifiers.includes('synthetic')) continue;

    const params = member[3];
    const suspend = params.endsWith(CONTINUATION);

    current.members.push({
      name,
      params,
      returns: member[4].trim(),
      arity: countParams(suspend ? params.slice(0, -CONTINUATION.length) : params),
      suspend,
      hasDefaults: false,
      owner: current.name,
    });
  }

  // Second pass: the bridge can be rendered after the member it belongs to.
  for (const declared of classes.values()) {
    for (const member of declared.members) {
      member.hasDefaults = defaulted.has(member.name);
    }
  }

  return classes;
}

/** Every parameter count a member can legally be called with. */
export function callableArities(member: NativeMember): number[] {
  if (!member.hasDefaults) return [member.arity];

  const counts: number[] = [];
  for (let count = 0; count <= member.arity; count += 1) counts.push(count);
  return counts;
}

/**
 * Every member callable on a class, its supertypes included. A player inherits
 * most of its surface from the composed base in core, so grading only the
 * class's own block would report the whole kit as missing.
 */
export function resolveMembers(className: string, dumps: Map<string, NativeClass>[]): NativeMember[] {
  const seen = new Set<string>();
  const members: NativeMember[] = [];
  const pending = [className];

  while (pending.length > 0) {
    const name = pending.shift();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    for (const dump of dumps) {
      const found = dump.get(name);
      if (!found) continue;

      members.push(...found.members);
      pending.push(...found.supertypes);
    }
  }

  return members;
}
