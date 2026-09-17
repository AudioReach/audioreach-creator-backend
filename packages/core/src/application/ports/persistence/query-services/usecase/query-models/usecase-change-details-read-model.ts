/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  type ChangeOperation,
  type Source,
} from '../../../../../shared/change-vocabulary.js';
import type {KeyValuePairReadModel} from './key-vector-read-model.js';
import type {DataLinkReadModel} from '../../link/data-link-read-model.js';
import type {ControlLinkReadModel} from '../../link/control-link-read-model.js';

export interface UsecaseChangeSnapshot {
  readonly isEc: boolean;
  readonly gkv: readonly KeyValuePairReadModel[];
  readonly alias: string | null;
  readonly aliasId: number | null;
  readonly categories: readonly string[];
  readonly subgraphSystemIds: readonly number[];
  readonly dataLinks: readonly DataLinkReadModel[];
  readonly controlLinks: readonly ControlLinkReadModel[];
}

export interface UsecaseChangeDetails {
  readonly systemId: number;
  readonly changeId: number;
  readonly operation: Exclude<ChangeOperation, typeof CHANGE_OPERATION.None>;
  readonly source: Source;
  readonly before: UsecaseChangeSnapshot | null;
  readonly after: UsecaseChangeSnapshot | null;
}
