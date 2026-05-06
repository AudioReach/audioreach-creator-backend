/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Type guard to check if an object has a toJSON method
 */
interface Serializable {
  toJSON(): unknown;
}

/**
 * Type guard function to check if value is serializable
 */
function isSerializable(value: unknown): value is Serializable {
  return (
    value !== null &&
    typeof value === 'object' &&
    'toJSON' in value &&
    typeof value.toJSON === 'function'
  );
}

/**
 * Configuration for hydrating nested objects during deserialization
 */
interface HydrationConfig {
  /** Field name to hydrate */
  field: string;
  /** Class constructor to use for hydration */
  hydrator: {fromJSON: (data: unknown) => unknown};
  /** Whether the field is an array (default: false) */
  isArray?: boolean;
}

/**
 * Base class providing common serialization utilities for definition classes.
 * Provides helper methods for serializing nested objects and arrays.
 */
export abstract class BaseDefinition {
  /**
   * Helper to serialize nested objects and arrays.
   * Recursively calls toJSON() on objects that have the method.
   * @param value - The value to serialize
   * @returns Serialized value suitable for JSON
   */
  protected serializeField(value: unknown): unknown {
    if (value === undefined) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.map((item: unknown) => {
        if (isSerializable(item)) {
          return item.toJSON();
        }
        return item;
      });
    }

    if (isSerializable(value)) {
      return value.toJSON();
    }

    return value;
  }

  /**
   * Helper to assign validated data to instance with optional nested object hydration.
   * This method provides an optimized way to handle both simple field assignment and
   * nested object hydration in a single operation.
   *
   * @param instance - The instance to populate
   * @param validated - The validated data from schema parsing
   * @param hydrationConfigs - Optional array of configurations for nested object hydration
   * @returns The populated instance
   *
   * @example
   * // Simple usage without nested objects
   * static fromJSON(data: unknown): MyClass {
   *   const validated = MySchema.parse(data);
   *   return this.hydrateInstance(new MyClass(), validated);
   * }
   *
   * @example
   * // With nested object hydration
   * static fromJSON(data: unknown): MyClass {
   *   const validated = MySchema.parse(data);
   *   return this.hydrateInstance(new MyClass(), validated, [
   *     { field: 'nestedObject', hydrator: NestedClass },
   *     { field: 'nestedArray', hydrator: ArrayItemClass, isArray: true }
   *   ]);
   * }
   */
  protected static hydrateInstance<T extends BaseDefinition>(
    instance: T,
    validated: Record<string, unknown>,
    hydrationConfigs?: HydrationConfig[],
  ): T {
    // First, assign all fields using Object.assign
    Object.assign(instance, validated);

    // Then, hydrate nested objects if configurations are provided
    if (hydrationConfigs) {
      for (const config of hydrationConfigs) {
        const value = validated[config.field];

        if (value === undefined || value === null) {
          continue;
        }

        if (config.isArray && Array.isArray(value)) {
          // Hydrate array of nested objects
          (instance as Record<string, unknown>)[config.field] = value.map(
            (item: unknown) => config.hydrator.fromJSON(item),
          );
        } else if (!config.isArray) {
          // Hydrate single nested object
          (instance as Record<string, unknown>)[config.field] =
            config.hydrator.fromJSON(value);
        }
      }
    }

    return instance;
  }

  /**
   * Serialize this definition to a plain object suitable for JSON.
   * Must be implemented by subclasses.
   */
  abstract toJSON(): Record<string, unknown>;
}
