/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyDefinitionReadModel,
  ValueDefinitionReadModel,
  KeyReadModel,
  ValueReadModel,
} from './key-value-definition-read-model.js';

/**
 * Named projections for KeyDefinitionReadModel.
 * Use with project() to transform to the required shape.
 */
export const KeyDefinitionProjections = {
  /**
   * Reduces to summary fields only — systemId, keyId, name, description.
   */
  toKeyReadModel: (k: KeyDefinitionReadModel): KeyReadModel => ({
    systemId: k.systemId,
    keyId: k.keyId,
    name: k.name,
    description: k.description,
  }),
};

/**
 * Named projections for ValueDefinitionReadModel.
 * Use with project() to transform to the required shape.
 */
export const ValueDefinitionProjections = {
  /**
   * Reduces to summary fields only — systemId, valueId, name, description.
   */
  toValueReadModel: (v: ValueDefinitionReadModel): ValueReadModel => ({
    systemId: v.systemId,
    valueId: v.valueId,
    name: v.name,
    description: v.description,
  }),
};
