/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface SubgraphPropertyDefinitionRecord {
  systemId: number;
  elementsStructure: string;
}

export interface ContainerPropertyDefinitionRecord {
  systemId: number;
  propertyId: number;
  elementsStructure: string;
}

/**
 * Read-only access to property definition tables for subgraph and container.
 * Definitions are reference data imported at upload time and never modified
 * in-session — no overlay or write path needed.
 *
 * Used during add-module auto-creation to seed default property blobs on
 * newly created subgraph and container instances.
 */
export interface PropertyDefinitionsRepository {
  /**
   * Returns all SubgraphPropertyDefinition rows for the file.
   *
   * TODO(add-module-calibration-defaults): implement adapter
   * See: docs/edit-crud/design/add-module-calibration-defaults-design.md §7
   */
  findSubgraphPropertyDefinitions(
    fileSystemId: number,
  ): Promise<SubgraphPropertyDefinitionRecord[]>;

  /**
   * Returns all ContainerPropertyDefinition rows for the file, including
   * the property's natural ID (`propertyId`) so callers can skip
   * CONTAINER_PROP_ID_STACK_SIZE (which is initialised separately).
   *
   * TODO(add-module-calibration-defaults): implement adapter
   * See: docs/edit-crud/design/add-module-calibration-defaults-design.md §8
   */
  findContainerPropertyDefinitions(
    fileSystemId: number,
  ): Promise<ContainerPropertyDefinitionRecord[]>;
}
