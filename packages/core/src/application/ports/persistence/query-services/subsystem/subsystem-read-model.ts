/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinitionSummaryReadModel} from '../key-value/key-value-definition-read-model.js';

/**
 * Read model for a subsystem node.
 *
 * parentId — from nodes.parent_id — identifies the immediate parent subsystem.
 *   undefined means this is a root subsystem (no parent).
 *   Used by buildSubsystemTree() in @arc/core to construct the recursive hierarchy.
 *
 * filteredKeys — the key definitions this subsystem declares as its filter set,
 *   used by GET /usecases/filtered-by-subsystem.
 */
export interface SubsystemReadModel {
  readonly systemId: number;
  readonly name: string;
  readonly parentId?: number;
  readonly filteredKeys: KeyDefinitionSummaryReadModel[];
}
