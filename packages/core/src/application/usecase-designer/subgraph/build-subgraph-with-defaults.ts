/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Subgraph} from '../../../domain/entities/usecase-data/subgraph/subgraph.js';
import {SubgraphPropertyData} from '../../../domain/entities/usecase-data/subgraph/value-objects/subgraph-property.js';
import type {SubgraphPropertyDefinition} from '../../../domain/entities/definitions/subgraph/subgraph-property-definitions.js';
import {serializeDefaultParameterData} from '../shared/serialize-elements.js';
export interface SubgraphInit {
  systemId: number;
  subgraphNaturalId: number;
  name: string;
  fileSystemId: number;
}

export function buildSubgraphWithDefaults(
  init: SubgraphInit,
  propertyDefinitions: SubgraphPropertyDefinition[],
): Subgraph {
  const properties = propertyDefinitions.map(propDef => {
    const serialized = serializeDefaultParameterData(propDef);
    return new SubgraphPropertyData(
      propDef.systemId,
      serialized.ok ? serialized.value : null,
    );
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
