/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * The kinds of entity the application names: in issues (`impactedEntity`),
 * in batch reads (`BatchRead`, `FailedEntity`) and in entity identities
 * (`EntityRef`, `IdentityFor`).
 */
export const ENTITY_TYPE = {
  Project: 'Project',
  SpfModule: 'SpfModule',
  DataLink: 'DataLink',
  ControlLink: 'ControlLink',
  Subgraph: 'Subgraph',
  UseCase: 'UseCase',
  Container: 'Container',
  Subsystem: 'Subsystem',
  SpfModuleDefinition: 'SpfModuleDefinition',
  SpfModuleParameterDefinition: 'SpfModuleParameterDefinition',
  DriverModule: 'DriverModule',
  DriverModuleDefinition: 'DriverModuleDefinition',
  VcpmModuleDefinition: 'VcpmModuleDefinition',
  KeyDefinition: 'KeyDefinition',
  ValueDefinition: 'ValueDefinition',
  TagDefinition: 'TagDefinition',
  ProcessorDefinition: 'ProcessorDefinition',
  ContainerType: 'ContainerType',
  DataPort: 'DataPort',
  ControlPort: 'ControlPort',
  ModuleManagerData: 'ModuleManagerData',
  SubgraphPropertyDefinition: 'SubgraphPropertyDefinition',
  ContainerPropertyDefinition: 'ContainerPropertyDefinition',
  DriverPropertyDefinition: 'DriverPropertyDefinition',
  Ckv: 'Ckv',
  Tag: 'Tag',
  Tkv: 'Tkv',
} as const;
export type EntityType = (typeof ENTITY_TYPE)[keyof typeof ENTITY_TYPE];
