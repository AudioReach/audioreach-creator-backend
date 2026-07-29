/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const BLOB_TAG = '__blob';

type BlobTagged = {__blob: string};

function isTaggedBlob(value: unknown): value is BlobTagged {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[BLOB_TAG] === 'string'
  );
}

/**
 * Recursively walks a value and replaces every Uint8Array with a tagged
 * base64 wrapper `{__blob: "<base64>"}` so the value round-trips through
 * JSON without data loss.
 *
 * Call this before JSON.stringify when writing to edit_actions.new_value.
 */
export function serializeBlobs(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return {[BLOB_TAG]: Buffer.from(value).toString('base64')} as BlobTagged;
  }
  if (Array.isArray(value)) {
    return value.map(v => serializeBlobs(v));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeBlobs(v);
    }
    return out;
  }
  return value;
}

/**
 * Recursively walks a JSON-parsed value and converts every tagged blob
 * `{__blob: "<base64>"}` back to a Uint8Array.
 *
 * Call this after JSON.parse when reading from edit_actions.new_value.
 */
export function deserializeBlobs(value: unknown): unknown {
  if (isTaggedBlob(value)) {
    return new Uint8Array(Buffer.from(value[BLOB_TAG], 'base64'));
  }
  if (Array.isArray(value)) {
    return value.map(v => deserializeBlobs(v));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deserializeBlobs(v);
    }
    return out;
  }
  return value;
}
