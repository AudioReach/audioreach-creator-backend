/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseEntityBuilder} from '../services/entity-builders/base-entity-builder.js';

/**
 * Type-safe entity builder that can build any entity type.
 * Uses contravariance to allow any builder to be stored in the registry.
 */
export type AnyEntityBuilder = BaseEntityBuilder<unknown, unknown>;

/**
 * Result of entity assembly operation
 */
export interface EntityAssemblyResult {
  /** Type of entity that was assembled */
  entityType: string;
  /** Serialized entity data */
  entityData: Record<string, unknown>;
}
