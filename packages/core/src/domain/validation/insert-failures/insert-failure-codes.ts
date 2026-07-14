/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ISSUE_ENTITY_TYPE,
  type IssueEntityType,
} from '../../../shared/issues/index.js';

/**
 * Catalog of named insert-failure templates.
 *
 * Every entry maps a symbolic type to a stable `code` (grep-able as `ARC-INSERT-*`),
 * a human-readable rule `name` (surfaced in DATA_LOSS acknowledgment UI), and the
 * `entityType` the failure impacts. All entries produce WARNING-severity DATA_LOSS
 * ValidationIssues via `newInsertFailureIssue()`.
 *
 * Extend this catalog rather than fabricating one-off issue literals in bulk-inserters.
 */
export const INSERT_FAILURE = {
  // Definition-layer entities (AWSP)
  KeyDefinitionInsertFailed: {
    code: 'ARC-INSERT-KEYDEF-001',
    name: 'Key Definition Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.KeyDefinition,
  },
  TagDefinitionInsertFailed: {
    code: 'ARC-INSERT-TAGDEF-001',
    name: 'Tag Definition Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.TagDefinition,
  },
  ProcessorDefinitionInsertFailed: {
    code: 'ARC-INSERT-PROCDEF-001',
    name: 'Processor Definition Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.ProcessorDefinition,
  },
  ContainerTypeInsertFailed: {
    code: 'ARC-INSERT-CTYPE-001',
    name: 'Container Type Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.ContainerType,
  },
  SpfModuleDefinitionInsertFailed: {
    code: 'ARC-INSERT-MODDEF-001',
    name: 'SPF Module Definition Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.SpfModuleDefinition,
  },
  DriverModuleDefinitionInsertFailed: {
    code: 'ARC-INSERT-DRVDEF-001',
    name: 'Driver Module Definition Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.DriverModuleDefinition,
  },
  VcpmModuleDefinitionInsertFailed: {
    code: 'ARC-INSERT-VCPMDEF-001',
    name: 'VCPM Module Definition Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.VcpmModuleDefinition,
  },
  SubgraphPropertyDefinitionInsertFailed: {
    code: 'ARC-INSERT-SGPROP-001',
    name: 'Subgraph Property Definition Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.SubgraphPropertyDefinition,
  },
  ContainerPropertyDefinitionInsertFailed: {
    code: 'ARC-INSERT-CPROP-001',
    name: 'Container Property Definition Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.ContainerPropertyDefinition,
  },
  ModuleManagerDataInsertFailed: {
    code: 'ARC-INSERT-MMGR-001',
    name: 'Module Manager Data Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.ModuleManagerData,
  },
  // Graph entities (ACDB)
  SubgraphInsertFailed: {
    code: 'ARC-INSERT-SG-001',
    name: 'Subgraph Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.Subgraph,
  },
  ContainerInsertFailed: {
    code: 'ARC-INSERT-CTR-001',
    name: 'Container Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.Container,
  },
  SpfModuleInsertFailed: {
    code: 'ARC-INSERT-MOD-001',
    name: 'SPF Module Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.SpfModule,
  },
  DriverModuleInsertFailed: {
    code: 'ARC-INSERT-DRVMOD-001',
    name: 'Driver Module Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.DriverModule,
  },
  DataLinkInsertFailed: {
    code: 'ARC-INSERT-LINK-001',
    name: 'Data Link Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.DataLink,
  },
  ControlLinkInsertFailed: {
    code: 'ARC-INSERT-CTLLINK-001',
    name: 'Control Link Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.ControlLink,
  },
  UseCaseInsertFailed: {
    code: 'ARC-INSERT-UC-001',
    name: 'Use Case Insert Failed',
    entityType: ISSUE_ENTITY_TYPE.UseCase,
  },
  // Fallback — used when an entity type has no dedicated catalog entry
  UnknownEntityInsertFailed: {
    code: 'ARC-INSERT-UNK-001',
    name: 'Entity Insert Failed — Unrecognized Type',
    entityType: ISSUE_ENTITY_TYPE.Unknown,
  },
} as const satisfies Record<
  string,
  {code: string; name: string; entityType: IssueEntityType}
>;

export type InsertFailureType = keyof typeof INSERT_FAILURE;
