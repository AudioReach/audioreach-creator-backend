/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ContainerReadModel} from './container-read-model.js';
import type {PropertyPayloadReadModel} from '../shared/property-payload-read-model.js';
import type {Result} from '../../../../shared/result/result.js';

export interface ContainerQueryService {
  /**
   * Returns every ContainerReadModel for the given fileSystemId.
   * Overlay is always applied internally — no applyOverlay flag.
   */
  getAllContainers(fileSystemId: number): Promise<Result<ContainerReadModel[]>>;

  /**
   * Returns property payloads for the specified container, with session overlay applied.
   *
   * - `Result.fail` — DB error.
   * - `Result.ok(null)` — container does not exist (caller should throw 404).
   * - `Result.ok(PropertyPayloadReadModel[])` — container exists; list may be empty.
   */
  findPropertyPayloads(
    containerSystemId: number,
    fileSystemId: number,
  ): Promise<Result<PropertyPayloadReadModel[] | null>>;
}
