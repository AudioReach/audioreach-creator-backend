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
import type {Container} from '../entities/usecase-data/container/container.js';
import type {PropertyDefinition} from '../entities/definitions/common/entities/property-definition.js';

/**
 * Base context — always required by every validation rule.
 * All profile interfaces extend this.
 */
export interface BaseValidationContext {
  /** System ID of the file being validated. All entities in the context belong to this file. */
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
 * - usecasesByModuleSystemId — to report which usecases are impacted by a link issue
 *
 * Example rules using this profile:
 *   - DuplicateDataLinkRule (ARC-LINK-002)
 *   - OrphanedLinkRule (future) — checks if source/destination modules exist
 */
export interface LinkValidationContext extends BaseValidationContext {
  /**
   * All data links in the file. Iterate this when every data link is being checked.
   * Empty unless `DataLink` is in the rule's requiredEntityTypes.
   */
  dataLinks: ReadonlyArray<DataLink>;
  /**
   * All control links in the file. Iterate this when every control link is being checked.
   * Empty unless `ControlLink` is in the rule's requiredEntityTypes.
   */
  controlLinks: ReadonlyArray<ControlLink>;
  /**
   * Lookup: module systemId → SpfModule. Use when starting from a link and
   * checking that its endpoint module exists in the file.
   * Empty unless `SpfModule` is in the rule's requiredEntityTypes.
   */
  modulesBySystemId: ReadonlyMap<number, SpfModule>;
  /**
   * Lookup: module systemId → usecases that contain the module (through its subgraph).
   * Use to fill `impactedUsecases` on an issue.
   * Empty unless both `SpfModule` and `UseCase` are in the rule's requiredEntityTypes.
   */
  usecasesByModuleSystemId: ReadonlyMap<number, ReadonlyArray<UseCase>>;
}

/**
 * Context profile for module-related validation rules.
 *
 * Includes:
 * - modules / definitions — the modules and their definitions to validate
 * - modulesBySystemId — for O(1) module lookup
 * - usecasesByModuleSystemId — to report which usecases are impacted by a module issue
 *
 * Example rules using this profile:
 *   - MissingDefinitionRule (ARC-MOD-001)
 */
export interface ModuleValidationContext extends BaseValidationContext {
  /**
   * All SPF modules in the file, each with its CKV data. Iterate this when
   * every module is being checked.
   * Empty unless `SpfModule` is in the rule's requiredEntityTypes.
   */
  modules: ReadonlyArray<SpfModule>;
  /**
   * Lookup: module definition systemId → SpfModuleDefinition. Keys match
   * `module.definitionSystemId`, so a rule can get the definition for each module.
   * Empty unless `SpfModuleDefinition` is in the rule's requiredEntityTypes.
   */
  definitions: ReadonlyMap<number, SpfModuleDefinition>;
  /**
   * Lookup: module systemId → SpfModule. Same modules as `modules`; use when
   * starting from another entity that references a module.
   * Empty unless `SpfModule` is in the rule's requiredEntityTypes.
   */
  modulesBySystemId: ReadonlyMap<number, SpfModule>;
  /**
   * Lookup: module systemId → usecases that contain the module (through its subgraph).
   * Use to fill `impactedUsecases` on an issue.
   * Empty unless both `SpfModule` and `UseCase` are in the rule's requiredEntityTypes.
   */
  usecasesByModuleSystemId: ReadonlyMap<number, ReadonlyArray<UseCase>>;
}

/**
 * Context profile for container-related validation rules.
 *
 * Includes:
 * - containers — the containers to validate, each with its property payloads
 * - containersBySystemId — for O(1) container lookup from another entity
 * - propDefBySystemId — container property definitions, keyed by systemId
 *
 * Example rules using this profile:
 *   - ContainerPropertyParseRule (ARC-CON-002)
 */
export interface ContainerValidationContext extends BaseValidationContext {
  /**
   * All containers in the file, each with its `properties` map
   * (property definition systemId → payload). Iterate this when every
   * container is being checked.
   * Empty unless `Container` is in the rule's requiredEntityTypes.
   */
  containers: ReadonlyArray<Container>;
  /**
   * Lookup: container systemId → Container. Same containers as `containers`;
   * use when starting from another entity that references a container,
   * e.g. `module.containerSystemId`.
   * Empty unless `Container` is in the rule's requiredEntityTypes.
   */
  containersBySystemId: ReadonlyMap<number, Container>;
  /**
   * Lookup: container property definition systemId → PropertyDefinition.
   * Keys match the keys of `container.properties`, so a rule can get the
   * definition (e.g. `elementsStructure`) for each property payload.
   * Empty unless `ContainerPropertyDefinition` is in the rule's requiredEntityTypes.
   */
  propDefBySystemId: ReadonlyMap<number, PropertyDefinition>;
}

/**
 * Full validation context — contains all entity types.
 *
 * Extends all implemented profiles. New profiles are added here as their
 * rules are implemented (YAGNI).
 *
 * Full profile hierarchy (see design doc Section 3.6):
 *   BaseValidationContext
 *     ├── LinkValidationContext (dataLinks, controlLinks, modulesBySystemId, usecasesByModuleSystemId)
 *     ├── ModuleValidationContext (modules, definitions, modulesBySystemId, usecasesByModuleSystemId)
 *     ├── ContainerValidationContext (containers, containersBySystemId, propDefBySystemId)
 *     ├── SubgraphValidationContext (subgraphs, subgraphsBySystemId, modulesBySubgraphSystemId) — future
 *     └── UsecaseValidationContext (usecases) — future
 *   FileValidationContext extends all of the above
 */
export interface FileValidationContext
  extends
    LinkValidationContext,
    ModuleValidationContext,
    ContainerValidationContext {
  // ── Subgraph data ───────────────────────────────────────────────────────────
  /**
   * All subgraphs in the file. Iterate this when every subgraph is being checked.
   * Empty unless `Subgraph` is in the rule's requiredEntityTypes.
   */
  subgraphs: ReadonlyArray<Subgraph>;
  /**
   * Lookup: subgraph systemId → Subgraph. Same subgraphs as `subgraphs`; use when
   * starting from another entity that references a subgraph, e.g. `module.subgraphSystemId`.
   * Empty unless `Subgraph` is in the rule's requiredEntityTypes.
   */
  subgraphsBySystemId: ReadonlyMap<number, Subgraph>;
  /**
   * Lookup: subgraph systemId → modules in that subgraph. Use when starting from
   * a subgraph and checking its modules.
   * Empty unless `SpfModule` is in the rule's requiredEntityTypes.
   */
  modulesBySubgraphSystemId: ReadonlyMap<number, ReadonlyArray<SpfModule>>;

  // ── Usecase data ─────────────────────────────────────────────────────────────
  /**
   * All usecases in the file, each with its `subgraphSystemIds`. Iterate this
   * when every usecase is being checked.
   * Empty unless `UseCase` is in the rule's requiredEntityTypes.
   */
  usecases: ReadonlyArray<UseCase>;
}
