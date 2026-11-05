/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {InvalidLogCursorError} from '../../../src/queries/log-query-service.js';
import {
  decodeLogCursor,
  encodeLogCursor,
  isClientInstanceKey,
  isNonEmptyString,
  isSystemId,
} from '../../../src/queries/log-cursor.js';
import type {LogCursorScope} from '../../../src/queries/log-cursor.js';

const encodeRaw = (body: unknown): string =>
  Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');

describe('log cursor', () => {
  const scope: LogCursorScope = {
    listing: 'project-logs',
    options: {projectId: 'p1', order: 'desc', clientName: undefined},
  };
  const position = {timestamp: '2026-01-01T00:00:00.000Z', key: 42};

  it('round-trips', () => {
    expect(
      decodeLogCursor(encodeLogCursor(scope, position), scope, isSystemId),
    ).toEqual(position);
  });

  it('is URL-safe', () => {
    expect(encodeLogCursor(scope, position)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('ignores option order and undefined options', () => {
    const same: LogCursorScope = {
      listing: 'project-logs',
      options: {order: 'desc', projectId: 'p1'},
    };

    expect(
      decodeLogCursor(encodeLogCursor(scope, position), same, isSystemId),
    ).toEqual(position);
  });

  it.each<[string, LogCursorScope]>([
    ['another listing', {...scope, listing: 'client-instances'}],
    [
      'another option value',
      {...scope, options: {...scope.options, order: 'asc'}},
    ],
    [
      'an added option',
      {...scope, options: {...scope.options, clientName: 'x'}},
    ],
  ])('rejects a cursor used with %s', (_label, other) => {
    expect(() =>
      decodeLogCursor(encodeLogCursor(scope, position), other, isSystemId),
    ).toThrow(InvalidLogCursorError);
  });

  it('rejects a key of the wrong kind', () => {
    const cursor = encodeLogCursor(scope, {...position, key: 'abc'});

    expect(() => decodeLogCursor(cursor, scope, isSystemId)).toThrow(
      InvalidLogCursorError,
    );
    expect(decodeLogCursor(cursor, scope, isNonEmptyString).key).toBe('abc');
  });

  it('round-trips a launch key and rejects malformed ones', () => {
    const key = ['audioreach-creator-ui', 'launch-1'] as const;
    const cursor = encodeLogCursor(scope, {...position, key});

    expect(decodeLogCursor(cursor, scope, isClientInstanceKey).key).toEqual(
      key,
    );
    expect(isClientInstanceKey(['', 'launch-1'])).toBe(true);
    for (const bad of [
      'launch-1',
      ['ui', ''],
      ['ui'],
      ['ui', 'l', 'x'],
      [1, 'l'],
    ]) {
      expect(isClientInstanceKey(bad)).toBe(false);
    }
  });

  it.each([
    ['not base64 JSON', 'not-a-cursor'],
    ['a bad timestamp', encodeRaw({s: 'x', t: 'yesterday', k: 1})],
    ['a missing scope', encodeRaw({t: position.timestamp, k: 1})],
    ['a non-integer id', encodeRaw({s: 'x', t: position.timestamp, k: 1.5})],
    ['a zero id', encodeRaw({s: 'x', t: position.timestamp, k: 0})],
    ['a JSON array', encodeRaw([1, 2])],
  ])('rejects %s', (_label, value) => {
    expect(() => decodeLogCursor(value, scope, isSystemId)).toThrow(
      InvalidLogCursorError,
    );
  });
});
