/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  UnitOfWork,
  VcpmDefinitionRepository,
  VcpmDefinitionWithParameters,
} from '@arc/core';
import type {VcpmModuleDefinitionRow} from '../../entity-schema/definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

export class TypeOrmVcpmDefinitionRepository
  implements VcpmDefinitionRepository
{
  constructor(
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {}

  async getDefinitionWithParameters(
    fileSystemId: number,
  ): Promise<VcpmDefinitionWithParameters | null> {
    const row = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmModuleDefinition)
      .createQueryBuilder('definition')
      .leftJoinAndSelect('definition.parameters', 'parameters')
      .where('definition.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()) as VcpmModuleDefinitionRow | null;

    if (row === null) return null;

    // Keep the request-bound UoW in the adapter contract. Definitions are
    // currently immutable during an edit session, so no definition overlay is
    // required here.
    this.uow.getWriteContext();

    return {
      systemId: row.systemId,
      parameters: (row.parameters ?? []).map(parameter => ({
        systemId: parameter.systemId,
        isReadOnly: parameter.isReadOnly,
        elementsStructure: parameter.elementsStructure ?? '',
      })),
    };
  }
}
