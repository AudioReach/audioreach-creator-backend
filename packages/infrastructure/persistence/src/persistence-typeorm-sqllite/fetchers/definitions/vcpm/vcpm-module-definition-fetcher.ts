/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {VcpmModuleDefinitionWithParamsReadModel} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';

/**
 * Raw projection from a joined VcpmModuleDefinitionRow and
 * VcpmModuleParameterDefinitionRow query.
 *
 * The selected fields use query-specific aliases, and parameter fields are
 * nullable because the parameter definition is loaded with a LEFT JOIN.
 */
type VcpmDefinitionRawRow = {
  moduleDefinitionSystemId: number;
  paramSystemId: number | null;
  elementsStructure: string | null;
};

export class VcpmModuleDefinitionFetcher {
  constructor(private readonly manager: EntityManager) {}

  async fetchMany(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]> {
    const rows = await this.manager
      .createQueryBuilder()
      .select('vmd.systemId', 'moduleDefinitionSystemId')
      .addSelect('vmpd.systemId', 'paramSystemId')
      .addSelect('vmpd.elementsStructure', 'elementsStructure')
      .from(ENTITY_NAMES.VcpmModuleDefinition, 'vmd')
      .leftJoin(
        ENTITY_NAMES.VcpmModuleParameterDefinition,
        'vmpd',
        'vmpd.vcpmModuleDefinitionSystemId = vmd.systemId',
      )
      .where('vmd.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawMany<VcpmDefinitionRawRow>();

    const definitions = new Map<
      number,
      VcpmModuleDefinitionWithParamsReadModel
    >();

    for (const row of rows) {
      if (!definitions.has(row.moduleDefinitionSystemId)) {
        definitions.set(row.moduleDefinitionSystemId, {
          moduleDefinitionSystemId: row.moduleDefinitionSystemId,
          parameters: [],
        });
      }

      if (row.paramSystemId !== null) {
        definitions.get(row.moduleDefinitionSystemId)!.parameters.push({
          systemId: row.paramSystemId,
          elementsStructure: row.elementsStructure ?? '',
        });
      }
    }

    return [...definitions.values()];
  }
}
