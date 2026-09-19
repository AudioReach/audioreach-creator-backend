/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {RoutingContext} from '../contracts/routing-context.js';

export class OrphanValidationService {
  run(_context: RoutingContext): Promise<ReturnType<typeof Result.ok<void>>> {
    return Promise.resolve(Result.ok());
  }
}
