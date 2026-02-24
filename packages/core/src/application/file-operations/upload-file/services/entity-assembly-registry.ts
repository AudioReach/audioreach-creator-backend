/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityBuilderInput} from '../types/entity-builder.types.js';
import type {Handler} from '../../../ports/worker/handler-registry.port.js';
import type {
  AnyEntityBuilder,
  EntityAssemblyResult,
} from '../types/entity-builder-registry.types.js';

/**
 * Creates a registry of entity assembly handlers using factory pattern.
 * This is platform-agnostic and can be used in any worker implementation (Node.js, React Native, etc.).
 *
 * The registry maps handler keys to their corresponding functions, allowing workers
 * to execute entity assembly logic without knowing the implementation details.
 *
 * @param entityBuilders - Map of entity builder factories (optional, returns empty registry if not provided)
 * @returns Map of handler keys to handler functions
 */
export function createEntityAssemblyRegistry(
  entityBuilders?: Map<string, AnyEntityBuilder>,
): Map<string, Handler> {
  const registry = new Map<string, Handler>();

  // Only register handler if builders are provided
  if (!entityBuilders || entityBuilders.size === 0) {
    return registry;
  }

  /**
   * Handler for assembling domain entities.
   * Uses registered builder factories to create entities from extracted data.
   */
  registry.set('assembleEntity', ((
    input: EntityBuilderInput,
  ): EntityAssemblyResult => {
    // Get builder factory for this entity type
    const builder = entityBuilders.get(input.entityType);

    if (!builder) {
      throw new Error(`Unknown entity type: ${input.entityType}`);
    }

    // Create entity from extracted data
    const entity = builder.createFromData(input.requiredData);

    // Serialize entity for transfer back
    const entityData = entity.toJSON();

    return {
      entityType: input.entityType,
      entityData,
    } as EntityAssemblyResult;
  }) as Handler);

  // Future handlers can be registered here
  // Example:
  // registry.set('validateEntity', (input) => { ... });
  // registry.set('transformEntity', (input) => { ... });

  return registry;
}
