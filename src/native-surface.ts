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
  /** The declaring class, so a report can say where a member came from. */
  owner: string;
}

export interface NativeClass {
  name: string;
  supertypes: string[];
  members: NativeMember[];
}

const CLASS_HEADER = /^public\s+(?:[a-z]+\s+)*(?:class|interface)\s+([\w/$]+)(?:\s*:\s*(.+?))?\s*\{$/;
const MEMBER = /^\tpublic\s+((?:[a-z]+\s+)*)fun\s+([\w$<>-]+)\s*\((.*)\)(.*)$/;

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
    if (modifiers.includes('synthetic') || name.endsWith('$default') || name === '<init>') continue;

    const params = member[3];
    const suspend = params.endsWith(CONTINUATION);

    current.members.push({
      name,
      params,
      returns: member[4].trim(),
      arity: countParams(suspend ? params.slice(0, -CONTINUATION.length) : params),
      suspend,
      owner: current.name,
    });
  }

  return classes;
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
