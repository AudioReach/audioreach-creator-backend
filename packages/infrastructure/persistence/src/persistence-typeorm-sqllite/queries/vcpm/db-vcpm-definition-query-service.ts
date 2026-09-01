/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  VcpmDefinitionQueryService,
  VcpmModuleDefinitionWithParams,
} from '@arc/core';
import type {VcpmModuleDefinitionRow} from '../../entity-schema/definitions/subgraph/vcpm/vcpm-module-definition.schema.js';

export class DbVcpmDefinitionQueryService implements VcpmDefinitionQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getVcpmModuleDefinitionsWithParams(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParams[]> {
    const rows = (await this.dataSource.manager
      .getRepository('VcpmModuleDefinition')
      .createQueryBuilder('def')
      .leftJoinAndSelect('def.parameters', 'params')
      .where('def.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as VcpmModuleDefinitionRow[];

    return rows.map(def => ({
      systemId: def.systemId,
      parameters: (def.parameters ?? []).map(parameter => ({
        systemId: parameter.systemId,
        isReadOnly: parameter.isReadOnly,
        elementsStructure: parameter.elementsStructure,
      })),
    }));
  }
}
