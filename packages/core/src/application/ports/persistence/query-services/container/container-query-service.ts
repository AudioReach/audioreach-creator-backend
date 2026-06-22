/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ContainerReadModel} from '../usecase/query-models/container-read-model.js';

export interface ContainerQueryService {
  findMany(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<ContainerReadModel[]>;

  findOne(
    systemId: number,
    fileSystemId: number,
  ): Promise<ContainerReadModel | null>;
}
