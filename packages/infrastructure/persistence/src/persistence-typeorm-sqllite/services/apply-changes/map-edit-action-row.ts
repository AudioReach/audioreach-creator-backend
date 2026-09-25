/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PendingApplyAction} from '@arc/core';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Maps storage history rows to the apply contract without leaking changeId. */
export function mapEditActionRow(row: EditActionRow): PendingApplyAction {
  return {
    aggregateId: row.aggregateId,
    targetType: row.targetTable,
    targetSystemId: row.targetSystemId,
    operation: row.operation,
    fieldPath: row.fieldPath,
    newValue: isRecord(row.newValue) ? row.newValue : {},
  };
}
