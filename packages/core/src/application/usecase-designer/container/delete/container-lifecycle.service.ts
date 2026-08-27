/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ContainerStackSizeService} from '../services/container-stack-size.service.js';

export type ContainerLifecycleResult =
  | {deleted: true}
  | {deleted: false; stackSize: number};

export class ContainerLifecycleService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly stackSizeService: ContainerStackSizeService,
  ) {}

  async apply(
    containerSystemId: number,
    deletedModuleSystemId: number,
    fileSystemId: number,
  ): Promise<ContainerLifecycleResult> {
    const modules = await this.uow
      .getModuleRepository()
      .findModulesByContainerId(containerSystemId, fileSystemId);
    const remaining = modules.filter(
      module => module.systemId !== deletedModuleSystemId,
    );
    if (remaining.length === 0) {
      await this.uow
        .getContainerRepository()
        .deleteContainer(containerSystemId, fileSystemId);
      return {deleted: true};
    }
    const stackSize = await this.stackSizeService.recalculateForContainer(
      containerSystemId,
      fileSystemId,
      deletedModuleSystemId,
    );
    return {deleted: false, stackSize};
  }
}
