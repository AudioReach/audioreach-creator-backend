/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UseCase} from '../entities/usecase-data/usecase/usecase.js';
import type {Subgraph} from '../entities/usecase-data/subgraph/subgraph.js';
import type {SpfModule} from '../entities/usecase-data/module/spf-module.js';
import type {DataLink} from '../entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../entities/usecase-data/links/control-link.js';
import type {ValidationPreferences} from './validation-preferences.js';
import {SpfModuleDefinition} from '../entities/definitions/spf-module/spf-module-definition.js';

/**
 * Base context — always required by every validation rule.
 * All profile interfaces extend this.
 */
export interface BaseValidationContext {
  fileSystemId: number;
  /** User preferences (severity overrides, suppressions). Applied after rules run. */
  preferences: ValidationPreferences;
}

/**
 * Context profile for link-related validation rules.
 *
 * Includes:
 * - dataLinks / controlLinks — the links to validate
 * - modulesBySystemId — to check if endpoint modules exist in the file
 * - usecasesByModuleId — to report which usecases are impacted by a link issue
 *
 * Example rules using this profile:
 *   - DuplicateDataLinkRule (ARC-LINK-002)
 *   - OrphanedLinkRule (future) — checks if source/destination modules exist
 */
export interface LinkValidationContext extends BaseValidationContext {
  dataLinks: ReadonlyArray<DataLink>;
  controlLinks: ReadonlyArray<ControlLink>;
  /** Lookup: module systemId → SpfModule. Used to check if endpoint modules exist. */
  modulesBySystemId: ReadonlyMap<number, SpfModule>;
  /** Lookup: module systemId → usecases that contain it. Used to report impacted usecases. */
  usecasesByModuleId: ReadonlyMap<number, ReadonlyArray<UseCase>>;
}

/**
 * Context profile for module-related validation rules.
 *
 * Includes:
 * - modules / definitions — the modules and their definitions to validate
 * - modulesBySystemId — for O(1) module lookup
 * - usecasesByModuleId — to report which usecases are impacted by a module issue
 *
 * Example rules using this profile:
 *   - MissingDefinitionRule (ARC-MOD-001)
 */
export interface ModuleValidationContext extends BaseValidationContext {
  modules: ReadonlyArray<SpfModule>;
  definitions: ReadonlyMap<number, SpfModuleDefinition>;
  /** Lookup: module systemId → SpfModule. */
  modulesBySystemId: ReadonlyMap<number, SpfModule>;
  /** Lookup: module systemId → usecases that contain it. Used to report impacted usecases. */
  usecasesByModuleId: ReadonlyMap<number, ReadonlyArray<UseCase>>;
}

/**
 * Full validation context — contains all entity types.
 *
 * Extends all implemented profiles. New profiles are added here as their
 * rules are implemented (YAGNI).
 *
 * Full profile hierarchy (see design doc Section 3.6):
 *   BaseValidationContext
 *     ├── LinkValidationContext (dataLinks, controlLinks, modulesBySystemId, usecasesByModuleId)
 *     ├── ModuleValidationContext (modules, definitions, modulesBySystemId, usecasesByModuleId)
 *     ├── SubgraphValidationContext (subgraphs, subgraphsBySystemId, modulesBySubgraphId) — future
 *     └── UsecaseValidationContext (usecases) — future
 *   FileValidationContext extends all of the above
 */
export interface FileValidationContext
  extends LinkValidationContext, ModuleValidationContext {
  // ── Subgraph data ─────────────────────────────────────────────────────────
  subgraphs: ReadonlyArray<Subgraph>;
  subgraphsBySystemId: ReadonlyMap<number, Subgraph>;
  modulesBySubgraphId: ReadonlyMap<number, ReadonlyArray<SpfModule>>;

  // ── Usecase data ──────────────────────────────────────────────────────────
  usecases: ReadonlyArray<UseCase>;
}
