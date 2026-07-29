/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  PropertyDefinitionsRepository,
  SubgraphPropertyDefinitionRecord,
  ContainerPropertyDefinitionRecord,
} from '@arc/core';

export class TypeOrmPropertyDefinitionsRepository implements PropertyDefinitionsRepository {
  findSubgraphPropertyDefinitions(
    _fileSystemId: number,
  ): Promise<SubgraphPropertyDefinitionRecord[]> {
    // TODO(add-module-calibration-defaults): query subgraph_property_definitions
    // WHERE file_system_id = _fileSystemId and return {systemId, elementsStructure}.
    // See: docs/edit-crud/design/add-module-calibration-defaults-design.md §7
    return Promise.resolve([]);
  }

  findContainerPropertyDefinitions(
    _fileSystemId: number,
  ): Promise<ContainerPropertyDefinitionRecord[]> {
    // TODO(add-module-calibration-defaults): query container_property_definitions
    // WHERE file_system_id = _fileSystemId and return {systemId, propertyId, elementsStructure}.
    // See: docs/edit-crud/design/add-module-calibration-defaults-design.md §8
    return Promise.resolve([]);
  }
}
