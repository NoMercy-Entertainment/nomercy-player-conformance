import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { checkDrift, comparableContract } from '../check-drift';
import { buildContract } from '../generate';

describe('checkDrift', () => {
  it('passes when the committed contract matches a fresh build', () => {
    expect(checkDrift().ok).toBe(true);
  });

  it('the committed file equals a fresh build (no manual edits)', () => {
    const onDisk = readFileSync(new URL('../../contract/contract.json', import.meta.url), 'utf8');
    expect(comparableContract(onDisk)).toBe(comparableContract(JSON.stringify(buildContract())));
  });

  it('ignores where the sibling HEAD sits, but not the version or the surface', () => {
    const base = JSON.parse(JSON.stringify(buildContract()));
    const moved = { ...base, provenance: { ...base.provenance, commit: 'abc1234', commitsAheadOfTag: base.provenance.commitsAheadOfTag + 7, dirty: !base.provenance.dirty } };
    expect(comparableContract(JSON.stringify(moved))).toBe(comparableContract(JSON.stringify(base)));

    const newVersion = { ...base, provenance: { ...base.provenance, version: '9.9.9' } };
    expect(comparableContract(JSON.stringify(newVersion))).not.toBe(comparableContract(JSON.stringify(base)));

    const planted = { ...base, errors: [...base.errors, 'PLANTED_ERROR'] };
    expect(comparableContract(JSON.stringify(planted))).not.toBe(comparableContract(JSON.stringify(base)));
  });
});
