/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {JsonObject} from '../../../shared/types/json-types.js';

/**
 * Abstract base class for all domain entities.
 * Provides default JSON serialization with option to override.
 *
 * @template TJson - The JSON representation type for this entity
 *
 * @example
 * ```typescript
 * // Simple entity - uses default toJSON()
 * export class SimpleEntity extends BaseEntity<SimpleEntityJSON> {
 *   constructor(public readonly id: string, public readonly name: string) {
 *     super();
 *   }
 * }
 *
 * // Complex entity - overrides toJSON() for custom serialization
 * export class ComplexEntity extends BaseEntity<ComplexEntityJSON> {
 *   constructor(public readonly createdAt: Date) {
 *     super();
 *   }
 *
 *   toJSON(): ComplexEntityJSON {
 *     return {
 *       createdAt: this.createdAt.toISOString(), // Transform Date → string
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseEntity<TJson extends JsonObject = JsonObject> {
  /**
   * Serialize entity to JSON-compatible object.
   *
   * Default implementation returns a shallow copy of all enumerable properties.
   * Override this method if you need custom serialization logic:
   * - Transform non-serializable types (Date, Map, Set, etc.)
   * - Exclude private/internal fields
   * - Compute derived values
   * - Rename properties
   *
   * @returns JSON-serializable representation of the entity
   */
  toJSON(): TJson {
    return {...this} as unknown as TJson;
  }
}
