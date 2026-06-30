/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Canonical entity names for all TypeORM-managed tables.
 *
 * Values match the `name` property in each EntitySchema definition.
 * TypeORM's EntityManager methods (insert / update / delete / createQueryBuilder)
 * accept entity names, so these values can be used directly wherever a
 * table/entity target is required — including the `tableName` column of
 * `edit_actions`.
 *
 * Organised by category to mirror the entity-schema folder structure.
 */
export const ENTITY_NAMES = {
  // ── Definitions ──────────────────────────────────────────────────────────
  ProcessorDefinition: 'ProcessorDefinition',
  ContainerType: 'ContainerType',
  ContainerProperty: 'ContainerProperty',
  KeyDefinition: 'KeyDefinition',
  ValueDefinition: 'ValueDefinition',
  TagDefinition: 'TagDefinition',
  TagKeyDefLink: 'TagKeyDefLink',
  DriverModuleDefinition: 'DriverModuleDefinition',
  DriverModuleParameterDefinition: 'DriverModuleParameterDefinition',
  DataPortGroup: 'DataPortGroup',
  DataPortDefinition: 'DataPortDefinition',
  DynamicIntentDefinition: 'DynamicIntentDefinition',
  ModuleAttribute: 'ModuleAttribute',
  ModuleDefinitionMetaData: 'ModuleDefinitionMetaData',
  ModuleParameterAttribute: 'ModuleParameterAttribute',
  ModulePropertyDefinition: 'ModulePropertyDefinition',
  SpfModuleDefinition: 'SpfModuleDefinition',
  SpfModuleParameterDefinition: 'SpfModuleParameterDefinition',
  StaticControlPortDefinition: 'StaticControlPortDefinition',
  StaticIntentDefinition: 'StaticIntentDefinition',
  SubgraphPropertyDefinition: 'SubgraphProperty',
  VcpmModuleDefinition: 'VcpmModuleDefinition',
  VcpmModuleParameterDefinition: 'VcpmModuleParameterDefinition',

  // ── Module data ───────────────────────────────────────────────────────────
  SpfModule: 'SpfModule',
  SpfModulePropertiesData: 'SpfModulePropertiesData',
  Ckv: 'Ckv',
  CkvParameterPayload: 'CkvParameterPayload',
  CkvValues: 'CkvValues',
  Tkv: 'Tkv',
  TkvParameterPayload: 'TkvParameterPayload',
  TkvValues: 'TkvValues',
  ModuleTagIdMap: 'ModuleTagIdMap',
  // ── Node / Port data ──────────────────────────────────────────────────────
  Node: 'Node',
  DataPort: 'DataPort',
  ControlPort: 'ControlPort',
  Intent: 'Intent',

  // ── Link data ─────────────────────────────────────────────────────────────
  DataLink: 'DataLink',
  ControlLink: 'ControlLink',
  SubsystemControlLink: 'SubsystemControlLink',
  SubsystemDataLink: 'SubsystemDataLink',

  // ── Subgraph data ─────────────────────────────────────────────────────────
  Subgraph: 'Subgraph',
  SubgraphPropertyData: 'SubgraphPropertyData',
  VcpmInstance: 'VcpmInstance',
  VcpmCkv: 'VcpmCkv',
  VcpmCkvValues: 'VcpmCkvValues',
  VcpmParameterPayload: 'VcpmParameterPayload',

  // ── Container data ────────────────────────────────────────────────────────
  Container: 'Container',
  ContainerPropertyData: 'ContainerPropertyData',

  // ── Subsystem / UseCase ───────────────────────────────────────────────────
  Subsystem: 'Subsystem',
  UseCase: 'UseCase',
  UseCaseCategory: 'UseCaseCategory',
  UsecaseGkvValues: 'UsecaseGkvValues',
  UseCaseSubgraph: 'UseCaseSubgraph',
  UseCaseSubgraphPair: 'UseCaseSubgraphPair',

  // ── Driver module data ────────────────────────────────────────────────────
  DriverModule: 'DriverModule',
  Dkv: 'Dkv',
  DkvParameterPayload: 'DkvParameterPayload',
  DkvValues: 'DkvValues',

  // ── Project / File ────────────────────────────────────────────────────────
  ArcDbFile: 'ArcDbFile',
  Project: 'Project',
  ModuleManagerData: 'ModuleManagerData',
  Configuration: 'Configuration',

  // ── Edit session ──────────────────────────────────────────────────────────
  EditAction: 'EditAction',
  ProjectSession: 'ProjectSession',
  SessionCommit: 'SessionCommit',
  RestorePoint: 'RestorePoint',
} as const;

/** Union of all valid entity name strings. */
export type EntityName = (typeof ENTITY_NAMES)[keyof typeof ENTITY_NAMES];
