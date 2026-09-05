/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Subgraph} from '../../../domain/entities/usecase-data/subgraph/subgraph.js';
import {SubgraphPropertyData} from '../../../domain/entities/usecase-data/subgraph/value-objects/subgraph-property.js';
import {serializeDefaultParameterData} from '../shared/serialize-elements.js';
import type {SubgraphPropertyDefinitionRecord} from '../../ports/persistence/repositories/property-definitions/property-definitions.repository.js';

export interface SubgraphInit {
  systemId: number;
  subgraphId: number;
  name: string;
  fileSystemId: number;
}

export function buildSubgraphWithDefaults(
  init: SubgraphInit,
  propertyDefinitions: SubgraphPropertyDefinitionRecord[],
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
    subgraphId: init.subgraphId,
    name: init.name,
    isExported: false,
    fileSystemId: init.fileSystemId,
    properties,
  });
}
