/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '@arc/core';
import type {ChangeOperation} from '@arc/core';
import type {EntityName} from '../../entity-schema/entity-table-names.js';

export type ApplyChangeOperation = Exclude<
  ChangeOperation,
  typeof CHANGE_OPERATION.None
>;

/**
 * One executable permanent-table mutation produced from one or more staged
 * edit-action rows. `targetSystemId` identifies the table row, `values`
 * carries CREATE or UPDATE columns, and `sourceEditActionIds` identifies the
 * staged rows represented by the mutation.
 */
export interface ReducedEditAction {
  tableName: EntityName;
  operation: ApplyChangeOperation;
  targetSystemId: number;
  values?: Readonly<Record<string, unknown>>;
  sourceEditActionIds: readonly number[];
}
