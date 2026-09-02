/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChangeOperation} from '../../../../../shared/change-vocabulary.js';
import type {UsecaseType} from '../../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {SubgraphPair} from '../../../repositories/shared/links-for-pair.js';
import type {KeyValuePairReadModel} from './key-vector-read-model.js';

export interface UsecaseChangeSnapshot {
  readonly systemId: number;
  readonly type: UsecaseType | null;
  readonly gkv: readonly KeyValuePairReadModel[];
  readonly alias: string | null;
  readonly aliasId: number | null;
  readonly categories: readonly string[];
  readonly subgraphSystemIds: readonly number[];
  readonly subgraphPairs: readonly SubgraphPair[];
}

export interface UsecaseChangeDetails {
  readonly systemId: number;
  readonly changeId: number;
  readonly operation: ChangeOperation;
  readonly before: UsecaseChangeSnapshot | null;
  readonly after: UsecaseChangeSnapshot | null;
}
