/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Subgraph} from '../../../domain/entities/usecase-data/subgraph/subgraph.js';
import {SubgraphPropertyData} from '../../../domain/entities/usecase-data/subgraph/value-objects/subgraph-property.js';
import type {SubgraphPropertyDefinition} from '../../../domain/entities/definitions/subgraph/subgraph-property-definitions.js';

export interface SubgraphInit {
  systemId: number;
  subgraphNaturalId: number;
  name: string;
  fileSystemId: number;
}

/**
 * Builds a complete Subgraph domain object with all property defaults seeded.
 *
 * Each property definition gets a SubgraphPropertyData with its default blob
 * so that createSubgraph stages the subgraph row and all property data rows
 * atomically as one complete aggregate.
 *
 * TODO(add-module-calibration-defaults): populate property blobs using
 * serializeDefaultParameterData(propDef.elementsStructure) once that utility
 * is implemented. See: docs/edit-crud/design/add-module-calibration-defaults-design.md §7
 */
export function buildSubgraphWithDefaults(
  init: SubgraphInit,
  propertyDefinitions: SubgraphPropertyDefinition[],
): Subgraph {
  const properties = propertyDefinitions.map(
    propDef =>
      new SubgraphPropertyData(
        propDef.systemId,
        null, // TODO: replace with serializeDefaultParameterData(propDef.elementsStructure)
      ),
  );

  return new Subgraph({
    systemId: init.systemId,
    naturalId: init.subgraphNaturalId,
    name: init.name,
    isImported: false,
    fileSystemId: init.fileSystemId,
    properties,
  });
}
