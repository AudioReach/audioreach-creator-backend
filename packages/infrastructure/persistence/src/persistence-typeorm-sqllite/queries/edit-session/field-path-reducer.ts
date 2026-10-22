/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChangeStatus, Source} from '@arc/core';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';

/**
 * A per-field diff record produced by FieldPathReducer and consumed by
 * OverlayMerge (Chapter D2) to populate DiffEntry arrays on overlay results.
 */
export type DiffEntry = {
  /** Touched field name. For element paths: full tree path (LLD6c). */
  fieldName: string;
  /** Value before the pending change; null for CREATE or absent fields. */
  oldValue: unknown;
  /** Value after the pending change; null for DELETE. */
  newValue: unknown;
  changeId: number;
  linkedEntityGroupId: string | null;
  changeStatus: ChangeStatus;
  source: Source;
};

/**
 * Describes which logical fields a pending row stores.
 *
 * A null accumulator and a whole-row replacement expose the keys in their
 * payload. A scalar path normally stores that one path, while a named group
 * exposes the fixed keys in its object payload.
 */
export type FieldCoverage = {
  wholeRow: boolean;
  fields: ReadonlySet<string>;
};

/**
 * Converts a pending field path and payload into logical field coverage.
 *
 * Element paths are intentionally rejected here so every current-state
 * consumer applies the same unsupported-operation boundary. The reducer will
 * translate this error into its typed reducer error.
 */
export function getFieldCoverage(
  fieldPath: string | null,
  newValue: unknown,
): FieldCoverage {
  if (fieldPath?.startsWith('elements[') === true) {
    throw new Error(
      `Element-path mutation is not implemented: '${fieldPath}'.`,
    );
  }

  // Writer mutations use object payloads for every field path. Keeping the
  // scalar fallback makes this helper safe for older rows read by the overlay.
  const fields =
    fieldPath !== null && fieldPath !== '$' && !isObjectPayload(newValue)
      ? new Set([fieldPath])
      : new Set(Object.keys(newValue as object));

  return {
    wholeRow: fieldPath === '$',
    fields,
  };
}

function isObjectPayload(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Applies a single EditActionRow to an effective-state accumulator object,
 * dispatching on the shape of `row.fieldPath`.
 *
 * Dispatch table (§12.3 of foundation.md):
 *
 *   scalar column name (e.g. "alias")
 *     → effective[fieldPath] = row.newValue
 *
 *   "$" (whole-row replacement) or null (accumulator) or custom named group
 *     → for each key k in row.newValue: effective[k] = row.newValue[k]
 *
 *   element path (starts with "elements[")
 *     → throw — deferred to LLD6c
 *
 * The scalar vs. named-group distinction: a fieldPath is a named group when
 * it is non-null, non-"$", not an element path, AND its newValue is an object.
 * Scalar column paths carry a primitive newValue.
 */
export class FieldPathReducer {
  applyRow(effective: Record<string, unknown>, row: EditActionRow): void {
    const path = row.fieldPath;

    if (path !== null && path.startsWith('elements[')) {
      throw new Error(
        `Element-path fieldPath support is deferred to LLD6c: "${path}"`,
      );
    }

    if (
      path === null ||
      path === '$' ||
      this.isNamedGroup(path, row.newValue)
    ) {
      const payload = row.newValue as Record<string, unknown>;
      for (const key of Object.keys(payload)) {
        effective[key] = payload[key];
      }
      return;
    }

    // Scalar column name — direct assignment
    effective[path] = row.newValue;
  }

  deriveDiffEntries(
    row: EditActionRow,
    baseRow: Record<string, unknown> | null,
  ): DiffEntry[] {
    const path = row.fieldPath;

    if (path !== null && path.startsWith('elements[')) {
      throw new Error(
        `Element-path fieldPath support is deferred to LLD6c: "${path}"`,
      );
    }

    const meta = {
      changeId: row.changeId,
      linkedEntityGroupId: row.linkedEntityGroupId,
      changeStatus: row.changeStatus,
      source: row.source,
    };

    if (
      path === null ||
      path === '$' ||
      this.isNamedGroup(path, row.newValue)
    ) {
      const payload = row.newValue as Record<string, unknown>;
      return Object.keys(payload).map(key => ({
        fieldName: key,
        oldValue: baseRow?.[key] ?? null,
        newValue: payload[key],
        ...meta,
      }));
    }

    return [
      {
        fieldName: path,
        oldValue: baseRow?.[path] ?? null,
        newValue: row.newValue,
        ...meta,
      },
    ];
  }

  private isNamedGroup(path: string, newValue: unknown): boolean {
    return (
      path !== '$' &&
      !path.startsWith('elements[') &&
      typeof newValue === 'object' &&
      newValue !== null &&
      !Array.isArray(newValue)
    );
  }
}
