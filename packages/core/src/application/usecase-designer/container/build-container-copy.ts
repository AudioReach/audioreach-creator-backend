/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Container} from '../../../domain/entities/usecase-data/container/container.js';
import {Container as ContainerClass} from '../../../domain/entities/usecase-data/container/container.js';
import {ContainerPropertyValue} from '../../../domain/entities/usecase-data/container/value-objects/container-property.js';
import {CONTAINER_PROP_ID_STACK_SIZE} from '../../file-operations/shared/constants/spf-ids.js';

/**
 * Creates a new container by copying all properties from the source container,
 * excluding the stack-size property (which is structural and legitimately
 * differs between containers depending on which modules are in them).
 * The containerTypeSystemId is inherited from the source.
 *
 * Used by:
 *   - PatchSpfModuleHandler — PATCH auto-create case (containerId targeting a
 *     non-existent container copies the current module's container as a base).
 *   - Future clone-container handler — reuse this same logic.
 */
export function buildContainerCopy(
  source: Container,
  newSystemId: number,
  newContainerId: number,
  fileSystemId: number,
): ContainerClass {
  const copy = new ContainerClass(
    newSystemId,
    newContainerId,
    source.containerTypeSystemId,
    fileSystemId,
  );
  for (const [propId, propVal] of source.properties) {
    if (propId === CONTAINER_PROP_ID_STACK_SIZE) continue;
    copy.properties.set(
      propId,
      new ContainerPropertyValue(propId, propVal.getPayloadCopy()),
    );
  }
  return copy;
}
