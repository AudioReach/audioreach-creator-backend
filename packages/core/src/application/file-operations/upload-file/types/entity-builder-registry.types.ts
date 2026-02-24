/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {JsonObject} from '../../../../shared/types/json-types.js';
import type {BaseEntity} from '../../../../domain/entities/common/base-entity.js';
import type {HeaderEntity} from '../../../../domain/entities/common/entities/header.entity.js';
import type {BaseEntityBuilder} from '../services/entity-builders/base-entity-builder.js';
import type {EntityBuilderKey} from 'application/file-operations/shared/constants/registry-keys.js';

/**
 * Maps entity type keys to their entity classes for type-safe operations.
 * To add new types: update ENTITY_BUILDER_KEYS, create entity class, add mapping here.
 */
export interface EntityTypeMap {
  HEADER_ENTITY: HeaderEntity;
}

/** Extracts the JSON type from an entity's generic parameter. */
export type EntityToJSON<T extends BaseEntity<JsonObject>> =
  T extends BaseEntity<infer TJson> ? TJson : never;

/** Maps entity keys to their JSON types (auto-derived from EntityTypeMap). */
export type EntityDataTypeMap = {
  [K in EntityBuilderKey]: EntityToJSON<EntityTypeMap[K]>;
};

/**
 * Type-safe builder linking an entity class to its JSON type.
 * @template K - Entity type key from EntityTypeMap
 */
export type TypedEntityBuilder<K extends EntityBuilderKey> = BaseEntityBuilder<
  EntityTypeMap[K], // The actual entity class
  EntityDataTypeMap[K] // The JSON data type
>;

/**
 * Generic builder for registry storage where specific type is unknown at compile time.
 * Constrained to BaseEntity and JsonObject for serializability.
 */
export type AnyEntityBuilder = BaseEntityBuilder<BaseEntity, JsonObject>;

/**
 * Entity assembly result with auto-inferred entityData type based on entityType.
 * @template K - Entity type key (defaults to any ValidEntityBuilderKey)
 */
export interface EntityAssemblyResult<
  K extends EntityBuilderKey = EntityBuilderKey,
> {
  /** Type of entity that was assembled */
  entityType: K;
  /** Serialized entity data - type is automatically inferred from entityType */
  entityData: EntityDataTypeMap[K];
}
