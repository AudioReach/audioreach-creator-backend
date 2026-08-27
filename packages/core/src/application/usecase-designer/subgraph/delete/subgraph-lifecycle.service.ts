/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';

export class SubgraphLifecycleService {
  constructor(private readonly uow: UnitOfWork) {}

  async apply(
    subgraphSystemId: number,
    deletedModuleSystemId: number,
    fileSystemId: number,
  ): Promise<{deleted: boolean; affectedUseCaseSystemIds: number[]}> {
    const modules = await this.uow
      .getModuleRepository()
      .findModulesBySubgraphId(subgraphSystemId, fileSystemId);
    const remaining = modules.filter(
      module => module.systemId !== deletedModuleSystemId,
    );
    if (remaining.length > 0) {
      return {deleted: false, affectedUseCaseSystemIds: []};
    }

    await this.uow
      .getSubgraphRepository()
      .deleteSubgraph(subgraphSystemId, fileSystemId);
    const result = await this.uow
      .getUsecaseRepository()
      .removeSubgraphReferences(subgraphSystemId, fileSystemId);
    return {
      deleted: true,
      affectedUseCaseSystemIds: result.affectedUseCaseSystemIds,
    };
  }
}
