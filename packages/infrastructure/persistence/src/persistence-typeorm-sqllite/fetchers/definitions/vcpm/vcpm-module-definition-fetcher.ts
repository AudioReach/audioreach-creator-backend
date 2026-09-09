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
  moduleSystemId: number;
  moduleDefinitionId: number;
  paramSystemId: number | null;
  paramId: number | null;
  elementsStructure: string | null;
  isReadOnly: number | null;
};

export class VcpmModuleDefinitionFetcher {
  constructor(private readonly manager: EntityManager) {}

  async fetchMany(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]> {
    const rows = await this.manager
      .createQueryBuilder()
      .select('vmd.systemId', 'moduleSystemId')
      .addSelect('vmd.naturalId', 'moduleDefinitionId')
      .addSelect('vmpd.systemId', 'paramSystemId')
      .addSelect('vmpd.naturalId', 'paramId')
      .addSelect('vmpd.elementsStructure', 'elementsStructure')
      .addSelect('vmpd.isReadOnly', 'isReadOnly')
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
      if (!definitions.has(row.moduleSystemId)) {
        definitions.set(row.moduleSystemId, {
          systemId: row.moduleSystemId,
          moduleDefinitionId: row.moduleDefinitionId,
          parameters: [],
        });
      }

      if (row.paramSystemId !== null) {
        definitions.get(row.moduleSystemId)!.parameters.push({
          systemId: row.paramSystemId,
          paramId: row.paramId ?? 0,
          elementsStructure: row.elementsStructure ?? '',
          isReadOnly: Boolean(row.isReadOnly),
        });
      }
    }

    return [...definitions.values()];
  }
}
