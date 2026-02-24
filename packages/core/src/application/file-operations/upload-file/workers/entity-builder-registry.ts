/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {HeaderEntityBuilder} from '../services/entity-builders/header-entity.builder.js';
import type {EntityBuilderInput} from '../types/entity-builder.types.js';
import type {Handler} from '../../../ports/worker/handler-registry.port.js';
import {
  ENTITY_BUILDER_KEYS,
  ENTITY_HANDLER_KEYS,
} from '../../shared/constants/registry-keys.js';
import type {
  AnyEntityBuilder,
  EntityAssemblyResult,
} from '../types/entity-builder-registry.types.js';

/**
 * Creates default entity builder factories.
 * These are the standard builders used across the application.
 */
function createDefaultEntityBuilders(): Map<string, AnyEntityBuilder> {
  return new Map<string, AnyEntityBuilder>([
    [ENTITY_BUILDER_KEYS.HEADER_ENTITY, new HeaderEntityBuilder()],
    // Add more default entity builders here as they are created
  ]);
}

/**
 * Creates a registry of entity building handlers using factory pattern.
 * This is platform-agnostic and can be used in any worker implementation (Node.js, React Native, etc.).
 *
 * The registry maps handler keys to their corresponding functions, allowing workers
 * to execute entity building logic without knowing the implementation details.
 *
 * Uses built-in default builders. No configuration needed.
 *
 * @returns Map of handler keys to handler functions
 */
export function createEntityBuilderRegistry(): Map<string, Handler> {
  const registry = new Map<string, Handler>();

  // Always use default builders
  const builders = createDefaultEntityBuilders();

  /**
   * Handler for building domain entities.
   * Uses registered builder factories to create entities from extracted data.
   */
  registry.set(ENTITY_HANDLER_KEYS.BUILD_ENTITY, ((
    input: EntityBuilderInput,
  ): EntityAssemblyResult => {
    // Get builder factory for this entity type
    const builder = builders.get(input.entityType);

    if (!builder) {
      throw new Error(`Unknown entity type: ${input.entityType}`);
    }

    // Create entity from extracted data
    const entity = builder.createFromData(input.requiredData);

    // Serialize entity for transfer back (all entities extend BaseEntity with toJSON())
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
