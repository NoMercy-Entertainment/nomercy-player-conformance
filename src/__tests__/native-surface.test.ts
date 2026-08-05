import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { countParams, parseAbiDump, resolveMembers } from '../native-surface';

const DUMP = `public class tv/nomercy/example/Base {
	public fun inherited ()V
}

public class tv/nomercy/example/Player : tv/nomercy/example/Base {
	public fun <init> ()V
	public fun volume ()D
	public fun volume (D)V
	public static synthetic fun volume$default (Ltv/nomercy/example/Player;DILjava/lang/Object;)V
	public fun load (Ljava/lang/String;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;
}
`;

function dumpFile(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'parity-')), 'sample.api');
  writeFileSync(path, DUMP);
  return path;
}

describe('countParams', () => {
  it('counts references, primitives and arrays as one each', () => {
    expect(countParams('Ljava/lang/String;D[I')).toBe(3);
  });

  it('counts nothing for an empty parameter list', () => {
    expect(countParams('')).toBe(0);
  });
});

describe('parseAbiDump', () => {
  const classes = parseAbiDump(dumpFile());

  it('reads the supertype so an inherited surface can be resolved', () => {
    expect(classes.get('tv/nomercy/example/Player')?.supertypes).toStrictEqual(['tv/nomercy/example/Base']);
  });

  it('drops constructors and compiler-synthesised bridges', () => {
    const names = classes.get('tv/nomercy/example/Player')?.members.map(member => member.name);
    expect(names).not.toContain('<init>');
    expect(names).not.toContain('volume$default');
  });

  it('reads both halves of an overload pair with their arities', () => {
    const volume = classes.get('tv/nomercy/example/Player')?.members.filter(member => member.name === 'volume');
    expect(volume?.map(member => member.arity).sort()).toStrictEqual([0, 1]);
  });

  it('does not count a suspend function\'s continuation as a parameter', () => {
    const load = classes.get('tv/nomercy/example/Player')?.members.find(member => member.name === 'load');
    expect(load?.suspend).toBe(true);
    expect(load?.arity).toBe(1);
  });
});

describe('resolveMembers', () => {
  it('includes what the class inherits', () => {
    const names = resolveMembers('tv/nomercy/example/Player', [parseAbiDump(dumpFile())]).map(member => member.name);
    expect(names).toContain('inherited');
  });
});
