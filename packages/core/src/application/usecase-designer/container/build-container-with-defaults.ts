/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Container} from '../../../domain/entities/usecase-data/container/container.js';
import {ContainerPropertyValue} from '../../../domain/entities/usecase-data/container/value-objects/container-property.js';
import {
  CONTAINER_PROP_ID_CAPABILITY_LIST,
  CONTAINER_PROP_ID_PROC_DOMAIN,
  CONTAINER_PROP_ID_STACK_SIZE,
} from '../../../domain/entities/definitions/container/container-property-ids.js';
import {encodeStackSize} from '../shared/utils/container-stack-size-codec.js';
import type {PropertyDefinition} from '../../../domain/entities/definitions/common/entities/property-definition.js';
import {serializeDefaultParameterData} from '../shared/serialize-elements.js';
import type {Logger} from '../../../shared/types/logger.interface.js';

export interface ContainerInit {
  systemId: number;
  containerNaturalId: number;
  fileSystemId: number;
  procDomainNaturalId: number;
  capabilitySystemIds: number[];
  stackSize: number;
}

/**
 * Builds a complete Container domain object with all property defaults seeded.
 *
 * Stack size is seeded from init.stackSize so createContainer persists the
 * container row and all ContainerPropertyData rows atomically as one aggregate,
 * avoiding a second setPropertyData round-trip after creation.
 */
export function buildContainerWithDefaults(
  init: ContainerInit,
  propertyDefinitions: PropertyDefinition[],
  logger?: Logger,
): Container {
  const container = new Container(
    init.systemId,
    init.containerNaturalId,
    init.fileSystemId,
  );

  const stackSizeDefinition = propertyDefinitions.find(
    propDef => propDef.naturalId === CONTAINER_PROP_ID_STACK_SIZE,
  );
  if (!stackSizeDefinition) {
    throw new Error(
      `Container property ${CONTAINER_PROP_ID_STACK_SIZE} is not defined in file ${init.fileSystemId}.`,
    );
  }

  container.properties.set(
    stackSizeDefinition.systemId,
    new ContainerPropertyValue(
      stackSizeDefinition.systemId,
      encodeStackSize(init.stackSize),
    ),
  );

  // Seed all other property definitions with their serialized defaults.
  for (const propDef of propertyDefinitions) {
    if (propDef.naturalId === CONTAINER_PROP_ID_STACK_SIZE) continue;
    const serialized = serializeDefaultParameterData(propDef);
    if (!serialized.ok) {
      throw new Error(
        `Failed to serialize default data for container property ${propDef.systemId}: ${serialized.error}`,
      );
    }
    for (const w of serialized.warnings) {
      logger?.logWarn({
        eventName: 'container.build.default_clamped',
        description: `Container property ${propDef.systemId}: ${w}`,
        component: 'buildContainerWithDefaults',
        tag: 'container',
      });
    }
    container.properties.set(
      propDef.systemId,
      new ContainerPropertyValue(propDef.systemId, serialized.value),
    );
  }

  // Override PROC_DOMAIN with the actual processor natural ID
  const procDomainDef = propertyDefinitions.find(
    d => d.naturalId === CONTAINER_PROP_ID_PROC_DOMAIN,
  );
  if (procDomainDef) {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, init.procDomainNaturalId >>> 0, true);
    container.properties.set(
      procDomainDef.systemId,
      new ContainerPropertyValue(procDomainDef.systemId, buf),
    );
  }

  // Override CAPABILITY_LIST with the module's container-type domain values (natural IDs, not DB system IDs)
  const capDef = propertyDefinitions.find(
    d => d.naturalId === CONTAINER_PROP_ID_CAPABILITY_LIST,
  );
  if (capDef && init.capabilitySystemIds.length > 0) {
    const ids = init.capabilitySystemIds;
    const capBuf = new Uint8Array((1 + ids.length) * 4);
    const capView = new DataView(capBuf.buffer);
    capView.setUint32(0, ids.length, true);
    for (const [i, id] of ids.entries()) {
      capView.setUint32((i + 1) * 4, id >>> 0, true);
    }
    container.properties.set(
      capDef.systemId,
      new ContainerPropertyValue(capDef.systemId, capBuf),
    );
  }

  return container;
}
