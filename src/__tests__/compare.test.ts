import { describe, expect, it } from 'vitest';

import { ContractMethod, grade, indexMembers } from '../compare';
import { NativeMember } from '../native-surface';

function member(name: string, arity: number): NativeMember {
  return { name, params: '', returns: 'V', arity, suspend: false, owner: 'Test' };
}

function method(name: string, kind: ContractMethod['kind']): ContractMethod {
  return { name, kind, signature: '', player: 'video', group: 'core/test' };
}

describe('grade', () => {
  it('passes a stateful noun only when both halves are callable', () => {
    const pair = indexMembers([member('volume', 0), member('volume', 1)]);
    expect(grade(method('volume', 'accessor'), pair, undefined).verdict).toBe('ok');
  });

  it('fails a stateful noun ported as a reader alone', () => {
    const readerOnly = indexMembers([member('quality', 0)]);
    expect(grade(method('quality', 'accessor'), readerOnly, undefined).verdict).toBe('reader-only');
  });

  it('accepts a data property answered by a val', () => {
    const asVal = indexMembers([member('getPlayerId', 0)]);
    expect(grade(method('playerId', 'property'), asVal, undefined).verdict).toBe('ok');
  });

  it('rejects a callable answered by a getter, because that is a rename', () => {
    const asVal = indexMembers([member('getPlugins', 0)]);
    expect(grade(method('plugins', 'method'), asVal, undefined).verdict).toBe('renamed');
  });

  it('waives only what is genuinely absent, never something already ported', () => {
    const present = indexMembers([member('container', 0)]);
    expect(grade(method('container', 'property'), present, 'web only').verdict).toBe('ok');
    expect(grade(method('container', 'property'), indexMembers([]), 'web only').verdict).toBe('waived');
  });

  it('reports an unported, unwaived method as missing', () => {
    expect(grade(method('audioContext', 'method'), indexMembers([]), undefined).verdict).toBe('missing');
  });
});
