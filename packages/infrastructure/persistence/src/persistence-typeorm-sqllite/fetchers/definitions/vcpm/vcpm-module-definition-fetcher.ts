/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {
  ParamDefinition,
  VcpmModuleDefinition,
  type ParamType,
  type ToolPolicy,
} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import type {VcpmModuleDefinitionRow} from '../../../entity-schema/definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import type {VcpmModuleParameterDefinitionRow} from '../../../entity-schema/definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';
import type {VcpmModuleAttributeRow} from '../../../entity-schema/definitions/subgraph/vcpm/vcpm-module-attribute.schema.js';

export class VcpmModuleDefinitionFetcher {
  constructor(private readonly manager: EntityManager) {}

  async fetchMany(fileSystemId: number): Promise<VcpmModuleDefinition[]> {
    const [definitionRows, parameterRows, attributeRows] = await Promise.all([
      this.manager
        .getRepository(ENTITY_NAMES.VcpmModuleDefinition)
        .createQueryBuilder('definition')
        .where('definition.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany() as Promise<VcpmModuleDefinitionRow[]>,
      this.manager
        .getRepository(ENTITY_NAMES.VcpmModuleParameterDefinition)
        .createQueryBuilder('parameter')
        .innerJoin(
          'parameter.vcpmModuleDefinition',
          'definition',
          'definition.fileSystemId = :fileSystemId',
          {fileSystemId},
        )
        .getMany() as Promise<VcpmModuleParameterDefinitionRow[]>,
      this.manager
        .getRepository(ENTITY_NAMES.VcpmModuleAttribute)
        .createQueryBuilder('attribute')
        .innerJoin(
          'attribute.vcpmModuleDefinition',
          'definition',
          'definition.fileSystemId = :fileSystemId',
          {fileSystemId},
        )
        .getMany() as Promise<VcpmModuleAttributeRow[]>,
    ]);

    const parametersByDefinition = new Map<number, ParamDefinition[]>();
    for (const row of parameterRows) {
      const parsedToolPolicies: unknown = row.toolPolicies
        ? JSON.parse(row.toolPolicies)
        : [];
      const parameters = parametersByDefinition.get(
        row.vcpmModuleDefinitionSystemId,
      );
      const parameter = new ParamDefinition({
        systemId: row.systemId,
        naturalId: row.naturalId,
        name: row.name ?? '',
        description: row.description ?? undefined,
        maxSize: row.maxSize ?? 0,
        toolPolicies: Array.isArray(parsedToolPolicies)
          ? (parsedToolPolicies.filter(
              p => typeof p === 'string',
            ) as ToolPolicy[])
          : [],
        type: row.pidType as ParamType,
        elementsStructure: row.elementsStructure ?? '',
        isPersistent: row.isPersistent,
        isReadOnly: row.isReadOnly,
        copySrcParamNaturalId: row.copySrcParamNaturalId ?? undefined,
      });
      if (parameters) {
        parameters.push(parameter);
      } else {
        parametersByDefinition.set(row.vcpmModuleDefinitionSystemId, [
          parameter,
        ]);
      }
    }

    const attributesByDefinition = new Map<
      number,
      Array<{name: string; value: string}>
    >();
    for (const row of attributeRows) {
      const attributes = attributesByDefinition.get(
        row.vcpmModuleDefinitionSystemId,
      );
      const attribute = {name: row.name, value: row.value};
      if (attributes) {
        attributes.push(attribute);
      } else {
        attributesByDefinition.set(row.vcpmModuleDefinitionSystemId, [
          attribute,
        ]);
      }
    }

    return definitionRows.map(
      row =>
        new VcpmModuleDefinition({
          systemId: row.systemId,
          naturalId: row.naturalId,
          fileSystemId: row.fileSystemId,
          name: row.name,
          displayName: row.displayName ?? row.name,
          description: row.description ?? undefined,
          groupName: row.groupName ?? undefined,
          parameters: parametersByDefinition.get(row.systemId) ?? [],
          attributes: attributesByDefinition.get(row.systemId) ?? [],
        }),
    );
  }
}
