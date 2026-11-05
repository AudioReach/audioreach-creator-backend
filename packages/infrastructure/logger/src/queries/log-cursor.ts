/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createHash} from 'node:crypto';
import {InvalidLogCursorError} from './log-query-service.js';
import {compareCodeUnits} from './compare-code-units.js';

/**
 * What a cursor was issued for: the listing and every filter and sort option
 * that shapes it. A cursor is valid only with the same scope, so a client
 * that changes a filter between pages gets a 400 instead of a wrong page.
 * The page size is not part of the scope.
 */
export interface LogCursorScope {
  readonly listing: string;
  readonly options: Readonly<Record<string, string | undefined>>;
}

/** Tie-breaker of a keyset: one column, or several compared in order. */
export type LogCursorKey = string | number | readonly string[];

/** Last row of a page in a `(timestamp, key)` keyset. */
export interface LogCursorPosition<K extends LogCursorKey> {
  /** Timestamp of the last row, ISO-8601 */
  readonly timestamp: string;
  /** Tie-breaker of the last row */
  readonly key: K;
}

interface EncodedLogCursor {
  /** Scope fingerprint */
  s: string;
  /** Timestamp */
  t: string;
  /** Key */
  k: unknown;
}

/** Encodes a cursor as base64url JSON. Callers treat the string as opaque. */
export function encodeLogCursor<K extends LogCursorKey>(
  scope: LogCursorScope,
  position: LogCursorPosition<K>,
): string {
  const body: EncodedLogCursor = {
    s: fingerprint(scope),
    t: position.timestamp,
    k: position.key,
  };
  return Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
}

/**
 * Decodes a cursor and checks it was issued for `scope` and has a key that
 * `isKey` accepts. Throws `InvalidLogCursorError` otherwise.
 */
export function decodeLogCursor<K extends LogCursorKey>(
  value: string,
  scope: LogCursorScope,
  isKey: (key: unknown) => key is K,
): LogCursorPosition<K> {
  let body: unknown;
  try {
    body = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidLogCursorError('not a cursor returned by this API');
  }
  if (!isEncodedLogCursor(body) || !isKey(body.k)) {
    throw new InvalidLogCursorError('not a cursor returned by this API');
  }
  if (body.s !== fingerprint(scope)) {
    throw new InvalidLogCursorError(
      'issued for different filters or order; repeat the first request without a cursor',
    );
  }
  return {timestamp: body.t, key: body.k};
}

export function isSystemId(key: unknown): key is number {
  return typeof key === 'number' && Number.isSafeInteger(key) && key > 0;
}

export function isNonEmptyString(key: unknown): key is string {
  return typeof key === 'string' && key !== '';
}

/**
 * A launch key: `[clientName, clientInstanceId]`. The name is `''` for
 * records without one; the launch ID is never empty.
 */
export function isClientInstanceKey(
  key: unknown,
): key is readonly [string, string] {
  return (
    Array.isArray(key) &&
    key.length === 2 &&
    typeof key[0] === 'string' &&
    isNonEmptyString(key[1])
  );
}

function fingerprint(scope: LogCursorScope): string {
  const options = Object.entries(scope.options)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => compareCodeUnits(a, b));
  return createHash('sha256')
    .update(JSON.stringify([scope.listing, options]))
    .digest('base64url')
    .slice(0, 22);
}

function isEncodedLogCursor(value: unknown): value is EncodedLogCursor {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const {s, t} = value as Record<string, unknown>;
  return (
    typeof s === 'string' &&
    typeof t === 'string' &&
    !Number.isNaN(Date.parse(t))
  );
}
