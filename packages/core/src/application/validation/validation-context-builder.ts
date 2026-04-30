/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UseCase} from '../../domain/entities/usecase-data/usecase/usecase.js';
import type {SpfModule} from '../../domain/entities/usecase-data/module/spf-module.js';
import type {Subgraph} from '../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {DataLink} from '../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../domain/entities/usecase-data/links/control-link.js';
import type {SpfModuleDefinition} from '../../domain/entities/definitions/spf-module/spf-module-definition.js';
import type {FileValidationContext} from '../../domain/validation/validation-context.js';
import type {ValidationPreferences} from '../../domain/validation/validation-preferences.js';
import {EMPTY_PREFERENCES} from '../../domain/validation/validation-preferences.js';
import {VALIDATION_ENTITY_TYPE} from '../../domain/validation/issue.js';
import type {ValidationEntityType} from '../../domain/validation/issue.js';
import type {ValidationQueryRepository} from '../ports/persistence/repositories/validation/validation-query.repository.js';

/**
 * Flat entity bag passed to `fromEntities()` — used during file upload
 * when entities are already parsed in memory before DB insert.
 */
export interface FileEntities {
  fileSystemId: number;
  modules: SpfModule[];
  usecases: UseCase[];
  subgraphs: Subgraph[];
  dataLinks: DataLink[];
  controlLinks: ControlLink[];
  definitions: SpfModuleDefinition[];
}

/**
 * Builds a FileValidationContext from either in-memory entities (upload path)
 * or from the database (on-demand validate / save path).
 *
 * Both paths produce an identical FileValidationContext with pre-built
 * reverse-index maps for O(1) access inside rules.
 */
export class ValidationContextBuilder {
  constructor(readonly queryRepo: ValidationQueryRepository) {}

  /**
   * Build context from already-parsed in-memory entities (upload path).
   * Preferences are loaded from DB if not provided; falls back to EMPTY_PREFERENCES.
   * Always builds the full context — all entities are already in memory.
   */
  async fromEntities(
    entities: FileEntities,
    preferences?: ValidationPreferences,
  ): Promise<FileValidationContext> {
    const resolvedPrefs =
      preferences ??
      (await this.queryRepo
        .getPreferences(entities.fileSystemId)
        .catch(() => EMPTY_PREFERENCES));
    return buildContext(entities, resolvedPrefs);
  }

  /**
   * Build context by loading entities from DB (on-demand validate / save path).
   *
   * @param fileSystemId - The file to load entities for.
   * @param requiredEntityTypes - The set of entity types to load. Only the
   *   corresponding DB tables are queried. Derived index maps are built only
   *   for loaded entity types. Use `ValidationEngine.getRequiredEntityTypes(group)`
   *   to compute this from the active rule set.
   *
   * Entity type → DB query + derived maps:
   *   SpfModule           → modules + modulesBySystemId + modulesBySubgraphId
   *   DataLink            → dataLinks
   *   ControlLink         → controlLinks
   *   UseCase             → usecases + usecasesByModuleId
   *   Subgraph            → subgraphs + subgraphsBySystemId
   *   SpfModuleDefinition → definitions
   */
  async fromDb(
    fileSystemId: number,
    requiredEntityTypes: ReadonlySet<ValidationEntityType>,
  ): Promise<FileValidationContext> {
    const [
      modules,
      usecases,
      subgraphs,
      dataLinks,
      controlLinks,
      definitions,
      preferences,
    ] = await Promise.all([
      requiredEntityTypes.has(VALIDATION_ENTITY_TYPE.SpfModule)
        ? this.queryRepo.findModulesByFile(fileSystemId)
        : Promise.resolve([] as SpfModule[]),
      requiredEntityTypes.has(VALIDATION_ENTITY_TYPE.UseCase)
        ? this.queryRepo.findUsecasesByFile(fileSystemId)
        : Promise.resolve([] as UseCase[]),
      requiredEntityTypes.has(VALIDATION_ENTITY_TYPE.Subgraph)
        ? this.queryRepo.findSubgraphsByFile(fileSystemId)
        : Promise.resolve([] as Subgraph[]),
      requiredEntityTypes.has(VALIDATION_ENTITY_TYPE.DataLink)
        ? this.queryRepo.findDataLinksByFile(fileSystemId)
        : Promise.resolve([] as DataLink[]),
      requiredEntityTypes.has(VALIDATION_ENTITY_TYPE.ControlLink)
        ? this.queryRepo.findControlLinksByFile(fileSystemId)
        : Promise.resolve([] as ControlLink[]),
      requiredEntityTypes.has(VALIDATION_ENTITY_TYPE.SpfModuleDefinition)
        ? this.queryRepo.findDefinitionsByFile(fileSystemId)
        : Promise.resolve([] as SpfModuleDefinition[]),
      this.queryRepo
        .getPreferences(fileSystemId)
        .catch(() => EMPTY_PREFERENCES),
    ]);

    return buildContext(
      {
        fileSystemId,
        modules,
        usecases,
        subgraphs,
        dataLinks,
        controlLinks,
        definitions,
      },
      preferences,
    );
  }
}

/**
 * Pure helper — builds the context and its reverse-index maps from flat entity arrays.
 * Called by both construction paths.
 */
function buildContext(
  entities: FileEntities,
  preferences: ValidationPreferences,
): FileValidationContext {
  const {
    fileSystemId,
    modules,
    usecases,
    subgraphs,
    dataLinks,
    controlLinks,
    definitions,
  } = entities;

  const modulesBySystemId = new Map(modules.map(m => [m.systemId, m]));
  const subgraphsBySystemId = new Map(subgraphs.map(s => [s.systemId, s]));
  const definitionsMap = new Map(definitions.map(d => [d.systemId, d]));

  const usecasesByModuleId = new Map<number, UseCase[]>();
  for (const uc of usecases) {
    for (const moduleId of uc.moduleSystemIds) {
      const list = usecasesByModuleId.get(moduleId) ?? [];
      list.push(uc);
      usecasesByModuleId.set(moduleId, list);
    }
  }

  const modulesBySubgraphId = new Map<number, SpfModule[]>();
  for (const mod of modules) {
    const list = modulesBySubgraphId.get(mod.subgraphSystemId) ?? [];
    list.push(mod);
    modulesBySubgraphId.set(mod.subgraphSystemId, list);
  }

  return {
    fileSystemId,
    preferences,
    dataLinks,
    controlLinks,
    modulesBySystemId,
    usecasesByModuleId,
    modules,
    definitions: definitionsMap,
    subgraphs,
    subgraphsBySystemId,
    modulesBySubgraphId,
    usecases,
  };
}
