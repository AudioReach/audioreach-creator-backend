/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {Container} from '../../../../../domain/entities/usecase-data/container/container.js';

export interface ContainerRepository {
  containerExists(systemId: number, fileSystemId: number): Promise<boolean>;

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
}
