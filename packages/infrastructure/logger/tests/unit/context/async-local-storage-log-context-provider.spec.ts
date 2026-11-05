/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {setTimeout as delay} from 'node:timers/promises';
import {AsyncLocalStorageLogContextProvider} from '../../../src/context/async-local-storage-log-context-provider.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('AsyncLocalStorageLogContextProvider', () => {
  let provider: AsyncLocalStorageLogContextProvider;

  beforeEach(() => {
    provider = new AsyncLocalStorageLogContextProvider();
  });

  it('returns an empty context outside run', () => {
    expect(provider.current()).toEqual({});
  });

  it('returns the value of fn', () => {
    expect(provider.run({clientInstanceId: A}, () => 42)).toBe(42);
  });

  it('keeps the context across awaits', async () => {
    await provider.run({clientInstanceId: A}, async () => {
      await delay(1);
      expect(provider.current().clientInstanceId).toBe(A);
    });
    expect(provider.current()).toEqual({});
  });

  it('restores the outer context after a nested run', () => {
    provider.run({clientInstanceId: A}, () => {
      provider.run({clientInstanceId: B}, () => {
        expect(provider.current().clientInstanceId).toBe(B);
      });
      expect(provider.current().clientInstanceId).toBe(A);
    });
  });

  it('isolates concurrent runs', async () => {
    const seen: Record<string, (string | undefined)[]> = {a: [], b: []};

    const work = (key: 'a' | 'b', id: string, waits: number[]) =>
      provider.run({clientInstanceId: id}, async () => {
        for (const ms of waits) {
          await delay(ms);
          seen[key].push(provider.current().clientInstanceId);
        }
      });

    await Promise.all([work('a', A, [5, 1, 5]), work('b', B, [1, 5, 1])]);

    expect(seen.a).toEqual([A, A, A]);
    expect(seen.b).toEqual([B, B, B]);
  });

  it('does not let a caller mutate the stored context', () => {
    const ctx = {clientInstanceId: A};
    provider.run(ctx, () => {
      ctx.clientInstanceId = B;
      expect(provider.current().clientInstanceId).toBe(A);
    });
  });

  it('leaves out keys whose value is undefined', () => {
    provider.run({clientInstanceId: undefined, projectId: '1'}, () => {
      expect(provider.current()).toEqual({projectId: '1'});
      expect('clientInstanceId' in provider.current()).toBe(false);
    });
  });

  describe('enrich', () => {
    it('adds values to the current run and keeps existing ones', () => {
      provider.run({clientInstanceId: A}, () => {
        provider.enrich({projectId: '7'});
        provider.enrich({clientName: 'ui'});
        expect(provider.current()).toEqual({
          clientInstanceId: A,
          projectId: '7',
          clientName: 'ui',
        });
      });
    });

    it('overwrites a value but ignores undefined', () => {
      provider.run({projectId: '1'}, () => {
        provider.enrich({projectId: '2'});
        provider.enrich({projectId: undefined, clientName: undefined});
        expect(provider.current()).toEqual({projectId: '2'});
      });
    });

    it('is seen by continuations scheduled before the call', async () => {
      await provider.run({clientInstanceId: A}, async () => {
        const later = delay(5).then(() => provider.current());
        provider.enrich({projectId: '7'});
        expect((await later).projectId).toBe('7');
      });
    });

    it('is seen by the caller of an awaited enriching function', async () => {
      await provider.run({}, async () => {
        await (async () => {
          await delay(1);
          provider.enrich({clientName: 'ui'});
        })();
        expect(provider.current().clientName).toBe('ui');
      });
    });

    it('does nothing outside run', () => {
      provider.enrich({projectId: '7'});
      expect(provider.current()).toEqual({});
    });

    it('does not reach the outer run from a nested run', () => {
      provider.run({clientInstanceId: A}, () => {
        provider.run({clientInstanceId: B}, () => {
          provider.enrich({projectId: '7'});
        });
        expect(provider.current()).toEqual({clientInstanceId: A});
      });
    });

    it('does not reach a concurrent run', async () => {
      const work = (id: string, projectId: string) =>
        provider.run({clientInstanceId: id}, async () => {
          await delay(1);
          provider.enrich({projectId});
          await delay(5);
          return provider.current();
        });

      const [a, b] = await Promise.all([work(A, '1'), work(B, '2')]);

      expect(a).toEqual({clientInstanceId: A, projectId: '1'});
      expect(b).toEqual({clientInstanceId: B, projectId: '2'});
    });

    it('does not change a context a reader already holds', () => {
      provider.run({clientInstanceId: A}, () => {
        const before = provider.current();
        provider.enrich({projectId: '7'});
        expect(before).toEqual({clientInstanceId: A});
        expect(Object.isFrozen(provider.current())).toBe(true);
      });
    });
  });
});
