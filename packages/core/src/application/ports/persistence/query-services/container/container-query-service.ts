/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ContainerReadModel} from './container-read-model.js';
import type {Result} from '../../../../shared/result/result.js';

export interface ContainerQueryService {
  /**
   * Returns every ContainerReadModel for the given fileSystemId.
   * Overlay is always applied internally — no applyOverlay flag.
   */
  findAll(fileSystemId: number): Promise<Result<ContainerReadModel[]>>;
}
