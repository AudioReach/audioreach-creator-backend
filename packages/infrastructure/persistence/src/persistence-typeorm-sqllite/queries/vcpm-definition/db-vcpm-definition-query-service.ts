/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  VcpmDefinitionQueryService,
  VcpmModuleDefinitionWithParamsReadModel,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

export class DbVcpmDefinitionQueryService implements VcpmDefinitionQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getVcpmModuleDefinitionsWithParams(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]> {
    const rows = await this.dataSource.manager
      .createQueryBuilder()
      .select('vmd.systemId', 'moduleSystemId')
      .addSelect('vmd.moduleDefinitionId', 'moduleDefinitionId')
      .addSelect('vmpd.systemId', 'paramSystemId')
      .addSelect('vmpd.paramId', 'paramId')
      .addSelect('vmpd.elementsStructure', 'elementsStructure')
      .addSelect('vmpd.isReadOnly', 'isReadOnly')
      .from(ENTITY_NAMES.VcpmModuleDefinition, 'vmd')
      .leftJoin(
        ENTITY_NAMES.VcpmModuleParameterDefinition,
        'vmpd',
        'vmpd.vcpmModuleDefinitionSystemId = vmd.systemId',
      )
      .where('vmd.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawMany<{
        moduleSystemId: number;
        moduleDefinitionId: number;
        paramSystemId: number | null;
        paramId: number | null;
        elementsStructure: string | null;
        isReadOnly: number | null;
      }>();

    const map = new Map<number, VcpmModuleDefinitionWithParamsReadModel>();
    for (const row of rows) {
      if (!map.has(row.moduleSystemId)) {
        map.set(row.moduleSystemId, {
          systemId: row.moduleSystemId,
          moduleDefinitionId: row.moduleDefinitionId,
          parameters: [],
        });
      }
      if (row.paramSystemId !== null) {
        map.get(row.moduleSystemId)!.parameters.push({
          systemId: row.paramSystemId,
          paramId: row.paramId ?? 0,
          elementsStructure: row.elementsStructure ?? '',
          isReadOnly: Boolean(row.isReadOnly),
        });
      }
    }
    return [...map.values()];
  }
}
