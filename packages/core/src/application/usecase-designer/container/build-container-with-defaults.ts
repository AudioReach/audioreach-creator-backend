/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Container} from '../../../domain/entities/usecase-data/container/container.js';
import {ContainerPropertyValue} from '../../../domain/entities/usecase-data/container/value-objects/container-property.js';
import {CONTAINER_PROP_ID_STACK_SIZE} from '../../file-operations/shared/constants/spf-ids.js';
import {encodeStackSize} from '../../../domain/services/container-property/container-stack-size-codec.js';

export interface ContainerInit {
  systemId: number;
  containerId: number;
  containerTypeSystemId: number;
  fileSystemId: number;
}

import type {ContainerPropertyDefinitionRecord} from '../../ports/persistence/repositories/property-definitions/property-definitions.repository.js';

/**
 * Builds a complete Container domain object with all property defaults seeded.
 *
 * Stack size is always initialised to 0 (required for the UPDATE-only
 * setPropertyData path on future PATCH calls).
 *
 * All other property definitions get their default blobs so that
 * createContainer stages the container row and all ContainerPropertyData rows
 * atomically as one complete aggregate.
 *
 * TODO(add-module-calibration-defaults): populate non-stack-size property blobs
 * using serializeDefaultParameterData(propDef.elementsStructure) once that
 * utility is implemented.
 * See: docs/edit-crud/design/add-module-calibration-defaults-design.md §8
 */
export function buildContainerWithDefaults(
  init: ContainerInit,
  propertyDefinitions: ContainerPropertyDefinitionRecord[],
): Container {
  const container = new Container(
    init.systemId,
    init.containerId,
    init.containerTypeSystemId,
    init.fileSystemId,
  );

  // Stack size is always 0 at creation time — recalculated on module placement.
  container.properties.set(
    CONTAINER_PROP_ID_STACK_SIZE,
    new ContainerPropertyValue(
      CONTAINER_PROP_ID_STACK_SIZE,
      encodeStackSize(0),
    ),
  );

  // Seed all other property definitions with their defaults.
  for (const propDef of propertyDefinitions) {
    if (propDef.propertyId === CONTAINER_PROP_ID_STACK_SIZE) continue;
    container.properties.set(
      propDef.systemId,
      new ContainerPropertyValue(
        propDef.systemId,
        null, // TODO: replace with serializeDefaultParameterData(propDef.elementsStructure)
      ),
    );
  }

  return container;
}
