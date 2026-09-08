/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyDefinitionReadModel,
  ValueDefinitionReadModel,
  KeyDefinitionSummaryReadModel,
  ValueDefinitionSummaryReadModel,
} from './key-value-definition-read-model.js';

/**
 * Named projections for KeyDefinitionReadModel.
 * Use with project() to transform to the required shape.
 */
export const KeyDefinitionProjections = {
  /**
   * Reduces to summary fields only — systemId, keyId, name, description.
   */
  toKeyDefinitionSummaryReadModel: (
    k: KeyDefinitionReadModel,
  ): KeyDefinitionSummaryReadModel => ({
    systemId: k.systemId,
    naturalId: k.naturalId,
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
  toValueDefinitionSummaryReadModel: (
    v: ValueDefinitionReadModel,
  ): ValueDefinitionSummaryReadModel => ({
    systemId: v.systemId,
    naturalId: v.naturalId,
    name: v.name,
    description: v.description,
  }),
};
