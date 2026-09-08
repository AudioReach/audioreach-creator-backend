/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import type {VcpmParameterDefinitionBase} from '../../../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {VcpmModuleParameterDefinitionRow} from '../../../entity-schema/definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';

export class VcpmModuleParameterDefinitionFetcher {
  constructor(private readonly manager: EntityManager) {}

  async fetchMany(
    paramSystemIds: number[],
    fileSystemId: number,
  ): Promise<VcpmParameterDefinitionBase[]> {
    if (paramSystemIds.length === 0) return [];
    const rows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmModuleParameterDefinition)
      .createQueryBuilder('parameter')
      .innerJoin(
        'parameter.vcpmModuleDefinition',
        'definition',
        'definition.fileSystemId = :fileSystemId',
        {fileSystemId},
      )
      .where('parameter.systemId IN (:...paramSystemIds)', {paramSystemIds})
      .getMany()) as unknown as VcpmModuleParameterDefinitionRow[];

    return rows.map(
      (row): VcpmParameterDefinitionBase => ({
        systemId: row.systemId,
        paramId: row.naturalId,
        name: row.name ?? '',
        isReadOnly: row.isReadOnly,
        elementsStructure: row.elementsStructure ?? '',
      }),
    );
  }
}
