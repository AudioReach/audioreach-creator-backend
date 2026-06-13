/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DefinitionIncludes} from './definition-attribute.js';
import type {SpfModuleDefinitionReadModel} from './spf-module-definition-read-model.js';

export interface SpfModuleDefinitionQueryService {
  /**
   * Returns definition data for the given definition system ID.
   *
   * Identity (name, moduleId) is always loaded.
   * Pass includes to load additional child tables — each applies the
   * three-tier edit session overlay independently.
   *
   * @param defSystemId    - spf_module_definitions.system_id
   * @param fileSystemId   - scope to the correct file
   * @param includes       - which chunks to load (summary / full details)
   * @param applyOverlay   - true = apply active session drafts (default)
   */
  getDefinition(
    defSystemId: number,
    fileSystemId: number,
    includes: DefinitionIncludes,
    applyOverlay?: boolean,
  ): Promise<SpfModuleDefinitionReadModel>;
}
