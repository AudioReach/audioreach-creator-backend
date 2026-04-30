/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {SpfModule} from '../../../../../domain/entities/usecase-data/module/spf-module.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {SpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/spf-module-definition.js';
import type {ValidationPreferences} from '../../../../../domain/validation/validation-preferences.js';
import type {ValidationIssue} from '../../../../../domain/validation/issue.js';

/**
 * Read-only repository port for loading all entity types needed to build
 * a FileValidationContext from the database (on-demand validate / save path).
 *
 * Also provides preferences read — used by ValidationContextBuilder on the
 * query path (ValidateFileQuery). The write path (UpdateValidationPreferences)
 * uses ValidationPreferencesRepository via UnitOfWork.
 *
 * The upload path uses ValidationContextBuilder.fromEntities() which bypasses
 * this repository entirely — entities are already in memory after parsing.
 */
export interface ValidationQueryRepository {
  findModulesByFile(fileSystemId: number): Promise<SpfModule[]>;
  findUsecasesByFile(fileSystemId: number): Promise<UseCase[]>;
  findSubgraphsByFile(fileSystemId: number): Promise<Subgraph[]>;
  findDataLinksByFile(fileSystemId: number): Promise<DataLink[]>;
  findControlLinksByFile(fileSystemId: number): Promise<ControlLink[]>;
  findDefinitionsByFile(fileSystemId: number): Promise<SpfModuleDefinition[]>;
  /** Returns stored preferences for the file, or EMPTY_PREFERENCES if none exist. */
  getPreferences(fileSystemId: number): Promise<ValidationPreferences>;
  /**
   * Returns the DATA_LOSS issues stored in files.data_loss_issues.
   * Returns an empty array if the file has no stored DATA_LOSS issues
   * (i.e., open_status is READY or data_loss_issues is NULL).
   */
  findStoredDataLossIssues(fileSystemId: number): Promise<ValidationIssue[]>;
}
