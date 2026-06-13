/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyValuePairReadModel} from './key-vector-read-model.js';

/**
 * Use case read model for query responses
 */
export class UseCaseReadModel {
  constructor(
    public readonly systemId: number,
    public readonly gkv: KeyValuePairReadModel[],
    public readonly alias?: string,
    public readonly aliasId?: number,
    public readonly categories?: string[],
  ) {}
}
