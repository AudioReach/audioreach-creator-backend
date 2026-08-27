/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CONTAINER_PROP_ID_STACK_SIZE} from '../../../file-operations/shared/constants/spf-ids.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {
  decodeStackSize,
  encodeStackSize,
} from '../../../../domain/services/container-property/container-stack-size-codec.js';

export class ContainerStackSizeService {
  constructor(private readonly uow: UnitOfWork) {}

  async updateOnAdd(
    containerSystemId: number,
    moduleStackSize: number,
    fileSystemId: number,
  ): Promise<void> {
    const propertyDefinition = await this.uow
      .getContainerRepository()
      .getPropertyDefinitionByPropertyId(
        fileSystemId,
        CONTAINER_PROP_ID_STACK_SIZE,
      );
    if (!propertyDefinition) {
      throw new Error(
        `Container property ${CONTAINER_PROP_ID_STACK_SIZE} is not defined in file ${fileSystemId}.`,
      );
    }
    const currentData = await this.uow
      .getContainerRepository()
      .getPropertyData(
        containerSystemId,
        propertyDefinition.systemId,
        fileSystemId,
      );
    const currentStackSize = currentData ? decodeStackSize(currentData) : 0;
    if (moduleStackSize <= currentStackSize) return;

    await this.uow
      .getContainerRepository()
      .setPropertyData(
        containerSystemId,
        propertyDefinition.systemId,
        encodeStackSize(moduleStackSize),
      );
  }

  async recalculateForContainer(
    containerSystemId: number,
    fileSystemId: number,
    excludedModuleSystemId?: number,
  ): Promise<number> {
    const propertyDefinition = await this.uow
      .getContainerRepository()
      .getPropertyDefinitionByPropertyId(
        fileSystemId,
        CONTAINER_PROP_ID_STACK_SIZE,
      );
    if (!propertyDefinition) {
      throw new Error(
        `Container property ${CONTAINER_PROP_ID_STACK_SIZE} is not defined in file ${fileSystemId}.`,
      );
    }
    const modules = await this.uow
      .getModuleRepository()
      .getModulesWithStackSizeByContainer(containerSystemId, fileSystemId);
    const stackSize = Math.max(
      ...modules
        .filter(module => module.moduleSystemId !== excludedModuleSystemId)
        .map(module => module.stackSize),
      0,
    );
    await this.uow
      .getContainerRepository()
      .setPropertyData(
        containerSystemId,
        propertyDefinition.systemId,
        encodeStackSize(stackSize),
      );
    return stackSize;
  }
}
