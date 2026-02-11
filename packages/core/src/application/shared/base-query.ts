/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Query} from '../orchestration/cqrs/queries/query.js';
import {generateUuid} from '../../shared/utilities/uuid.js';

export abstract class BaseQuery implements Query {
  readonly id: string;
  readonly timeStamp: Date = new Date();

  constructor(public readonly clientId: string) {
    this.id = generateUuid();
  }
}
