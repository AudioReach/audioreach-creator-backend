/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Subgraph} from '../../../domain/entities/usecase-data/subgraph/subgraph.js';
import {SubgraphPropertyData} from '../../../domain/entities/usecase-data/subgraph/value-objects/subgraph-property.js';
import type {SubgraphPropertyDefinition} from '../../../domain/entities/definitions/subgraph/subgraph-property-definitions.js';
import {serializeDefaultParameterData} from '../shared/serialize-elements.js';
import type {Logger} from '../../../shared/types/logger.interface.js';

export interface SubgraphInit {
  systemId: number;
  subgraphNaturalId: number;
  name: string;
  fileSystemId: number;
}

export function buildSubgraphWithDefaults(
  init: SubgraphInit,
  propertyDefinitions: SubgraphPropertyDefinition[],
  logger?: Logger,
): Subgraph {
  const properties = propertyDefinitions.map(propDef => {
    const serialized = serializeDefaultParameterData(propDef);
    if (!serialized.ok) {
      throw new Error(
        `Failed to serialize default data for subgraph property ${propDef.systemId}: ${serialized.error}`,
      );
    }
    for (const w of serialized.warnings) {
      logger?.logWarn({
        eventName: 'subgraph.build.defaultClamped',
        description: `Subgraph property ${propDef.systemId}: ${w}`,
        component: 'buildSubgraphWithDefaults',
        tag: 'subgraph',
      });
    }
    return new SubgraphPropertyData(0, propDef.systemId, serialized.value);
  });

  return new Subgraph({
    systemId: init.systemId,
    naturalId: init.subgraphNaturalId,
    name: init.name,
    isImported: false,
    fileSystemId: init.fileSystemId,
    properties,
  });
}
