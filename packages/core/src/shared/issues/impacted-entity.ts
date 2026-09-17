/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Entity types that can appear in an Issue's impactedEntity.
 * A curated subset of domain entities — only those that validation rules
 * and operational issues actually report against.
 *
 * Renamed from VALIDATION_ENTITY_TYPE because these values are now used by
 * both validation and operational issues (design §2.3, FR-4.5).
 *
 * Defined in core (not infrastructure) to keep the domain layer independent
 * of TypeORM entity names. Add new values here as callers require them.
 */
export const ISSUE_ENTITY_TYPE = {
  Project: 'Project',
  SpfModule: 'SpfModule',
  DataLink: 'DataLink',
  ControlLink: 'ControlLink',
  Subgraph: 'Subgraph',
  UseCase: 'UseCase',
  Container: 'Container',
  Subsystem: 'Subsystem',
  SpfModuleDefinition: 'SpfModuleDefinition',
  DriverModule: 'DriverModule',
  DriverModuleDefinition: 'DriverModuleDefinition',
  VcpmModuleDefinition: 'VcpmModuleDefinition',
  KeyDefinition: 'KeyDefinition',
  TagDefinition: 'TagDefinition',
  ProcessorDefinition: 'ProcessorDefinition',
  ContainerType: 'ContainerType',
  DataPort: 'DataPort',
  ControlPort: 'ControlPort',
  ModuleManagerData: 'ModuleManagerData',
  SubgraphPropertyDefinition: 'SubgraphPropertyDefinition',
  ContainerPropertyDefinition: 'ContainerPropertyDefinition',
  Ckv: 'Ckv',
  Tag: 'Tag',
  Tkv: 'Tkv',
  /** Sentinel used by the generic insert-failure fallback when an entity type has no catalog entry. */
  Unknown: 'Unknown',
} as const;
export type IssueEntityType =
  (typeof ISSUE_ENTITY_TYPE)[keyof typeof ISSUE_ENTITY_TYPE];

export interface ImpactedEntity {
  /** The type of entity that has the issue. */
  entityType: IssueEntityType;
  systemId: number;
  /** Human-readable name for display (e.g., module alias). */
  displayName?: string;
}
