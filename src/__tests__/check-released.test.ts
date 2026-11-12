import { describe, expect, it } from 'vitest';

import { checkReleased } from '../check-drift';
import { Contract, Provenance } from '../generate';

function contractWith(provenance: Partial<Provenance>): Contract {
  return {
    version: '2.0.1',
    provenance: {
      version: '2.0.1',
      commit: 'abc1234',
      commitsAheadOfTag: 0,
      dirty: false,
      ...provenance,
    },
    events: [],
    methods: [],
    errors: [],
    types: [],
  };
}

describe('checkReleased', () => {
  it('accepts a contract generated exactly at its tag', () => {
    expect(checkReleased(contractWith({})).ok).toBe(true);
  });

  it('rejects source ahead of its tag, because that is unpublished API', () => {
    const result = checkReleased(contractWith({ commitsAheadOfTag: 1 }));

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('1 commit');
    expect(result.reason).toContain('core-v2.0.1');
  });

  it('names the tag the way nomercy-player-web tags core', async () => {
    const { coreTag } = await import('../generate');

    expect(coreTag('2.6.1')).toBe('core-v2.6.1');
  });

  it('rejects a dirty tree, which describes nothing reproducible', () => {
    const result = checkReleased(contractWith({ dirty: true }));

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('uncommitted');
  });

  it('rejects a version with no tag at all', () => {
    const result = checkReleased(contractWith({ commitsAheadOfTag: -1 }));

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('no core-v2.0.1 tag');
  });

  it('reports the real repository state, whatever it currently is', async () => {
    const { buildContract } = await import('../generate');
    const live = checkReleased(buildContract());

    // Not asserting ok either way: this test exists so the reason is never a
    // silent empty string when the check fails.
    expect(live.ok ? live.reason : live.reason.length).toBeTruthy();
  });
});
