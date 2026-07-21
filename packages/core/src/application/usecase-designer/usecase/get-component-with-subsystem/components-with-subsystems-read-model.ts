/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ComponentsReadModel} from '../../../ports/persistence/query-services/usecase/query-models/components-read-model.js';
import type {KeyDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/key-value/key-value-definition-read-model.js';

/**
 * One node in the subsystem tree.
 * children carries the same shape as the root — modules, links, and
 * nested subsystems at every level to leaf depth.
 */
export interface SubsystemNodeReadModel {
  readonly systemId: number;
  readonly name: string;
  readonly filteredKeys: KeyDefinitionSummaryReadModel[];
  readonly children: ComponentsWithSubsystemsReadModel;
}

/**
 * Extends the flat ComponentsReadModel by adding a recursive subsystem tree.
 *
 * Top level:
 *   modules[]      — modules with no parentId (not inside any subsystem)
 *   dataLinks[]    — links where both endpoints are top-level modules
 *   controlLinks[] — same
 *   subsystems[]   — root subsystems (each has the same structure recursively)
 *
 * Each SubsystemNodeReadModel.children has the same shape — modules, links,
 * and child subsystems belonging to that subsystem level.
 */
export interface ComponentsWithSubsystemsReadModel extends ComponentsReadModel {
  readonly subsystems: SubsystemNodeReadModel[];
}
