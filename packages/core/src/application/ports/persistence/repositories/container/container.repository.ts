/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {Container} from '../../../../../domain/entities/usecase-data/container/container.js';
import type {PropertyDefinition} from '../../../../../domain/entities/definitions/common/entities/property-definition.js';

export interface ContainerRepository {
  containerExists(systemId: number, fileSystemId: number): Promise<boolean>;

  deleteContainer(
    containerSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Returns the full Container including properties Map.
   * Used by applyContainerChange for property-match check and as the source
   * for auto-create copying.
   */
  getContainerById(
    systemId: number,
    fileSystemId: number,
  ): Promise<Container | null>;

  /**
   * Stages a Container CREATE write.
   * Shared boundary — used by both PatchSpfModuleHandler (auto-create) and
   * AddModuleHandler (variants 1 & 2). Domain object construction differs per caller.
   */
  createContainer(container: Container, options?: EditOptions): Promise<void>;

  /** Returns effective container property definitions for the active session. */
  getPropertyDefinitions(fileSystemId: number): Promise<PropertyDefinition[]>;

  /** Returns one effective container property definition by its system ID. */
  getPropertyDefinitionBySystemId(
    fileSystemId: number,
    propertySystemId: number,
  ): Promise<PropertyDefinition | null>;

  /** Returns one effective container property definition by its natural ID. */
  getPropertyDefinitionByPropertyId(
    fileSystemId: number,
    propertyId: number,
  ): Promise<PropertyDefinition | null>;

  /**
   * Reads a single property blob from the effective container state
   * (committed rows + pending changes for the active session).
   * Returns null when no property row exists for this property system ID.
   */
  getPropertyData(
    containerSystemId: number,
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Uint8Array | null>;

  /**
   * Stages a delta write for a single property blob on an existing
   * container_property_data row.
   *
   * The row is expected to exist in the effective state — callers must ensure
   * the container was created with this property initialised (e.g. stack size
   * is always set to 0 at container creation time so this is always an update).
   * propertySystemId is the generated system_id of the property definition
   * row.
   */
  setPropertyData(
    containerSystemId: number,
    propertySystemId: number,
    data: Uint8Array,
    options?: EditOptions,
  ): Promise<void>;
}
