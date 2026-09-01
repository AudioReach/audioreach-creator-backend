/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  SpfModuleDefinitionQueryService,
  SpfModuleDefinitionReadModel,
  SpfModuleDefinitionSummaryReadModel,
  ParameterDefinitionSummaryReadModel,
  ModuleInfoSummaryReadModel,
  ContainerTypeSummaryReadModel,
  ProcessorSummaryReadModel,
  DataPortGroupReadModel,
  DataPortDefinitionReadModel,
  ControlPortDefinitionReadModel,
  StaticIntentDefinitionReadModel,
  DynamicIntentDefinitionReadModel,
  ParameterDefinitionReadModel,
  CustomModuleMetadataReadModel,
  ConfigurationIncludes,
} from '@arc/core';
import {
  Result,
  ERROR_CODES,
  PORT_IO_TYPE,
  CONFIGURATION_INCLUDES,
  IssueSeverity,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {
  ModuleType,
  InterfaceType,
  InterfaceVersion,
} from '../../entity-schema/module-manager/types.js';
import {
  SpfModuleDefinitionFetcher,
  type OverlaidSpfModuleDefinition,
} from '../../fetchers/definitions/spf-module-definitions/spf-module-definition-fetcher.js';
import {
  DataPortGroupFetcher,
  type OverlaidDataPortGroup,
} from '../../fetchers/definitions/spf-module-definitions/data-port-group-fetcher.js';
import type {DataPortDefinitionBase} from '../../entity-schema/definitions/module/spf/data-port-definition.schema.js';
import {
  StaticControlPortDefFetcher,
  type OverlaidStaticControlPortDefinition,
} from '../../fetchers/definitions/spf-module-definitions/static-control-port-def-fetcher.js';
import type {StaticIntentDefinitionBase} from '../../entity-schema/definitions/module/spf/static-intent-definition.schema.js';
import {DynamicIntentDefFetcher} from '../../fetchers/definitions/spf-module-definitions/dynamic-intent-def-fetcher.js';
import type {DynamicIntentDefinitionBase} from '../../entity-schema/definitions/module/spf/dynamic-intent-definition.schema.js';
import {SpfModuleParameterDefinitionFetcher} from '../../fetchers/definitions/spf-module-definitions/spf-module-parameter-definition-fetcher.js';
import type {SpfModuleParameterDefinitionBase} from '../../entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.js';
import {SpfModuleOverlayFetcher} from '../../fetchers/spf-module-overlay-fetcher.js';
import {ProcessorDefinitionFetcher} from '../../fetchers/definitions/common/processor-definition-fetcher.js';
import {ContainerTypeFetcher} from '../../fetchers/definitions/container/container-type-fetcher.js';
import {ModuleManagerDataFetcher} from '../../fetchers/module-manager/module-manager-data-fetcher.js';
import type {ModuleManagerDataBase} from '../../entity-schema/module-manager/module-manager-data.js';

/** Combined output of all four definition child fetchers for one definition. */
interface DefinitionAggregate {
  root: OverlaidSpfModuleDefinition;
  portGroups: OverlaidDataPortGroup[];
  staticPorts: OverlaidStaticControlPortDefinition[];
  dynamicIntents: DynamicIntentDefinitionBase[];
  parameters: SpfModuleParameterDefinitionBase[];
}

/**
 * Database implementation of SpfModuleDefinitionQueryService.
 *
 * All overlay is delegated to the five definition fetchers (FR-3):
 *   SpfModuleDefinitionFetcher        — root scalars + containerTypeLinks
 *   DataPortGroupFetcher              — data port groups + port definitions
 *   StaticControlPortDefFetcher       — static control ports + static intents
 *   DynamicIntentDefFetcher           — dynamic intents
 *   SpfModuleParameterDefinitionFetcher — parameter definitions
 *
 * Processor names and container type names are loaded via direct batch queries
 * (FR-7 — session-immutable reference data, never staged in edit_actions).
 *
 * SpfModuleDefinitionFetcher.fetchOne returning null is treated as a fatal
 * failure for that definition — child fetchers are not called (FR-8 Rule 1).
 */
export class DbSpfModuleDefinitionQueryService implements SpfModuleDefinitionQueryService {
  private readonly defFetcher: SpfModuleDefinitionFetcher;
  private readonly portGroupFetcher: DataPortGroupFetcher;
  private readonly staticPortFetcher: StaticControlPortDefFetcher;
  private readonly dynamicIntentFetcher: DynamicIntentDefFetcher;
  private readonly paramFetcher: SpfModuleParameterDefinitionFetcher;
  private readonly spfModuleFetcher: SpfModuleOverlayFetcher;
  private readonly processorFetcher: ProcessorDefinitionFetcher;
  private readonly containerTypeFetcher: ContainerTypeFetcher;
  private readonly moduleManagerFetcher: ModuleManagerDataFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
  ) {
    this.defFetcher = new SpfModuleDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.portGroupFetcher = new DataPortGroupFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.staticPortFetcher = new StaticControlPortDefFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.dynamicIntentFetcher = new DynamicIntentDefFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.paramFetcher = new SpfModuleParameterDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.spfModuleFetcher = new SpfModuleOverlayFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.processorFetcher = new ProcessorDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.containerTypeFetcher = new ContainerTypeFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.moduleManagerFetcher = new ModuleManagerDataFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  // ── Public methods ───────────────────────────────────────────────────────

  async getModuleDefinitionSystemId(
    spfModuleSystemId: number,
  ): Promise<Result<number>> {
    try {
      // definitionSystemId can change in a session — must apply overlay (FR-3).
      const {fileSystemId, sessionId} =
        await this.resolveSessionContextByModuleSystemId(spfModuleSystemId);
      if (fileSystemId === null) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModule not found for systemId=${spfModuleSystemId} — cannot resolve definition system ID`,
          severity: IssueSeverity.Error,
        });
      }
      const spfRows = await this.spfModuleFetcher.fetchMany(
        fileSystemId,
        sessionId,
        {
          systemId: spfModuleSystemId,
        },
      );
      const definitionSystemId = spfRows.at(0)?.definitionSystemId ?? null;

      if (definitionSystemId === null) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModule not found for systemId=${spfModuleSystemId} — cannot resolve definition system ID`,
          severity: IssueSeverity.Error,
        });
      }
      return Result.ok(definitionSystemId);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to resolve definition system ID for module ${spfModuleSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Returns a single SpfModuleDefinition read model for the given system ID.
   * All overlay applied via fetchers (FR-3).
   *
   * Child fetchers are only called when the root definition is found —
   * a null root means the definition was deleted in session (FR-8 Rule 1).
   */
  async getDefinition(
    defSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<SpfModuleDefinitionReadModel>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Step 1 — root fetcher guards child fetchers (FR-8 Rule 1)
      const aggregate = await this.loadDefinitionAggregate(
        defSystemId,
        fileSystemId,
        sessionId,
      );
      if (aggregate === null) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModuleDefinition not found for systemId=${defSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      return Result.ok(this.buildDefinitionReadModel(aggregate, includes));
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error ? error.message : 'Failed to load definition',
        severity: IssueSeverity.Error,
      });
    }
  }

  async getParameterDefinition(
    parameterDefinitionSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<ParameterDefinitionReadModel>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Delegates overlay to paramFetcher.fetchOne — no direct table query (FR-3).
      const overlaid = await this.paramFetcher.fetchOne(
        parameterDefinitionSystemId,
        sessionId,
      );

      if (!overlaid) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `ParameterDefinition not found for systemId=${parameterDefinitionSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      const detail = this.toParameterDefinitionReadModel(overlaid);
      if (includes !== CONFIGURATION_INCLUDES.FullDetails) {
        return Result.ok({
          systemId: detail.systemId,
          paramId: detail.paramId,
          name: detail.name,
          isReadOnly: detail.isReadOnly,
          description: detail.description,
          pidType: detail.pidType,
        });
      }

      return Result.ok(detail);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load parameter definition ${parameterDefinitionSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Returns all SPF module definitions for the file, filtered by any
   * combination of processorNaturalId/moduleDefinitionNaturalId/parameterNaturalId.
   * Overlay applied via fetchers.
   */
  async getAllSpfModuleDefinitionSummaries(
    fileSystemId: number,
    filters: {
      processorNaturalId?: number;
      moduleDefinitionNaturalId?: number;
      parameterNaturalId?: number;
    },
  ): Promise<Result<SpfModuleDefinitionSummaryReadModel[]>> {
    try {
      // Step 1 — lean ID query with filter conditions.
      // JOINs here are for filtering only (no data loaded from joined tables).
      const defSystemIds = await this.resolveFilteredDefinitionIds(
        fileSystemId,
        filters,
      );
      if (defSystemIds.length === 0) return Result.ok([]);

      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Step 2 — load definition aggregates and parameters in batch
      const params = await this.paramFetcher.fetchMany(defSystemIds, sessionId);
      const paramsByDef = this.groupParametersByDefinition(params);

      // Step 3 — load processor names (FR-7: session-immutable, batch query)
      const aggregates = await this.loadDefinitionAggregates(
        defSystemIds,
        fileSystemId,
        sessionId,
        paramsByDef,
      );

      const processorSystemIds = [
        ...new Set(
          aggregates
            .filter((a): a is DefinitionAggregate => a !== null)
            .map(a => a.root.processorSystemId),
        ),
      ];
      const processorMap = await this.loadProcessorInfo(
        processorSystemIds,
        sessionId,
      );

      // Step 4 — load container type names via ContainerTypeFetcher (FR-3)
      const allContainerTypeIds = [
        ...new Set(
          aggregates
            .filter((a): a is DefinitionAggregate => a !== null)
            .flatMap(a => a.root.containerTypeSystemIds),
        ),
      ];
      const containerTypeNameMap = await this.loadContainerTypeNames(
        allContainerTypeIds,
        sessionId,
      );

      // Step 5 — load custom module metadata
      const customModuleSystemIds = await this.resolveCustomModuleSystemIds(
        defSystemIds,
        fileSystemId,
        sessionId,
      );

      // Step 6 — assemble summaries (FR-8 Rule 3: null aggregate = warning, continue)
      const data: SpfModuleDefinitionSummaryReadModel[] = [];
      const missingIds: number[] = [];

      for (const [i, defId] of defSystemIds.entries()) {
        const aggregate = aggregates[i];
        if (aggregate === null) {
          missingIds.push(defId);
          continue;
        }
        const processorInfo = processorMap.get(
          aggregate.root.processorSystemId,
        ) ?? {
          systemId: aggregate.root.processorSystemId,
          processorId: 0,
          name: '',
        };
        data.push(
          this.buildSummaryReadModel(
            aggregate,
            processorInfo,
            containerTypeNameMap,
            customModuleSystemIds.has(aggregate.root.systemId),
          ),
        );
      }

      if (missingIds.length > 0) {
        return Result.partial(
          data,
          missingIds.map(id => ({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `SpfModuleDefinition not found for systemId=${id}`,
            severity: IssueSeverity.Error,
          })),
        );
      }

      return Result.ok(data);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load SPF module definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  async getSpfModuleDefinitionSummary(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleDefinitionSummaryReadModel>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      const params = await this.paramFetcher.fetchMany(
        [moduleSystemId],
        sessionId,
      );
      const aggregate = await this.loadDefinitionAggregate(
        moduleSystemId,
        fileSystemId,
        sessionId,
        params,
      );

      if (aggregate === null) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModuleDefinition not found for systemId=${moduleSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      const processorMap = await this.loadProcessorInfo(
        [aggregate.root.processorSystemId],
        sessionId,
      );
      const containerTypeNameMap = await this.loadContainerTypeNames(
        aggregate.root.containerTypeSystemIds,
        sessionId,
      );
      const customModuleSystemIds = await this.resolveCustomModuleSystemIds(
        [moduleSystemId],
        fileSystemId,
        sessionId,
      );

      return Result.ok(
        this.buildSummaryReadModel(
          aggregate,
          processorMap.get(aggregate.root.processorSystemId) ?? {
            systemId: aggregate.root.processorSystemId,
            processorId: 0,
            name: '',
          },
          containerTypeNameMap,
          customModuleSystemIds.has(moduleSystemId),
        ),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load SPF module definition ${moduleSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  async getCustomModuleMetadata(
    moduleDefinitionSystemId: number,
    fileSystemId: number,
  ): Promise<Result<CustomModuleMetadataReadModel | null>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const row = await this.moduleManagerFetcher.fetchOne(
        moduleDefinitionSystemId,
        fileSystemId,
        sessionId,
      );
      return Result.ok(row ? this.toCustomModuleMetadataReadModel(row) : null);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load custom module metadata',
        severity: IssueSeverity.Error,
      });
    }
  }

  async getCustomModuleMetadataBySystemIds(
    moduleDefinitionSystemIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, CustomModuleMetadataReadModel>> {
    const map = new Map<number, CustomModuleMetadataReadModel>();
    if (moduleDefinitionSystemIds.length === 0) return map;

    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );
    const rows = await this.moduleManagerFetcher.fetchMany(
      moduleDefinitionSystemIds,
      fileSystemId,
      sessionId,
    );
    for (const row of rows) {
      map.set(
        row.moduleDefinitionSystemId,
        this.toCustomModuleMetadataReadModel(row),
      );
    }
    return map;
  }

  async queryParameterDefinitions(
    fileSystemId: number,
    moduleDefSystemId: number,
    paramSystemIds?: number[],
    sessionId?: number | null,
  ): Promise<ParameterDefinitionReadModel[]> {
    const resolvedSessionId =
      sessionId !== undefined
        ? sessionId
        : await resolveActiveSessionId(this.dataSource, fileSystemId);

    const params = await this.paramFetcher.fetchMany(
      [moduleDefSystemId],
      resolvedSessionId,
    );

    const all = params.map(p => this.toParameterDefinitionReadModel(p));

    return paramSystemIds && paramSystemIds.length > 0
      ? all.filter(p => paramSystemIds.includes(p.systemId))
      : all;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private groupParametersByDefinition(
    parameters: SpfModuleParameterDefinitionBase[],
  ): Map<number, SpfModuleParameterDefinitionBase[]> {
    const result = new Map<number, SpfModuleParameterDefinitionBase[]>();
    for (const parameter of parameters) {
      const bucket = result.get(parameter.spfModuleDefinitionSystemId) ?? [];
      bucket.push(parameter);
      result.set(parameter.spfModuleDefinitionSystemId, bucket);
    }
    return result;
  }

  /**
   * Resolves sessionId scoped to the file that owns the given module.
   * Used by getModuleDefinitionSystemId where fileSystemId is not available.
   */
  private async resolveSessionContextByModuleSystemId(
    moduleSystemId: number,
  ): Promise<{fileSystemId: number | null; sessionId: number | null}> {
    // Look up fileSystemId from the module baseline row, then resolve session.
    const row = (await this.dataSource
      .getRepository(ENTITY_NAMES.SpfModule)
      .createQueryBuilder('m')
      .select('m.fileSystemId')
      .where('m.systemId = :id', {id: moduleSystemId})
      .getOne()) as {fileSystemId: number} | null;
    if (!row) return {fileSystemId: null, sessionId: null};
    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      row.fileSystemId,
    );
    return {fileSystemId: row.fileSystemId, sessionId};
  }

  /**
   * Calls all five definition fetchers in sequence for a single definition.
   * Returns null if the root definition is not found or was deleted in session
   * (FR-8 Rule 1 — child fetchers are skipped).
   *
   * @param preloadedParams optional pre-loaded parameters (avoids a second fetch
   *   when the caller already has them, e.g. in getSpfModuleDefinitionSummary)
   */
  private async loadDefinitionAggregate(
    defSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
    preloadedParams?: SpfModuleParameterDefinitionBase[],
  ): Promise<DefinitionAggregate | null> {
    // Root first — if absent, do not call child fetchers (FR-8 Rule 1).
    const root = await this.defFetcher.fetchOne(
      defSystemId,
      fileSystemId,
      sessionId,
    );
    if (root === null) return null;

    // Child fetchers run only after root is confirmed present.
    const portGroups = await this.portGroupFetcher.fetchMany(
      defSystemId,
      sessionId,
    );
    const staticPorts = await this.staticPortFetcher.fetchMany(
      defSystemId,
      sessionId,
    );
    const dynamicIntents = await this.dynamicIntentFetcher.fetchMany(
      defSystemId,
      sessionId,
    );
    const parameters =
      preloadedParams ??
      (await this.paramFetcher.fetchMany([defSystemId], sessionId));

    return {root, portGroups, staticPorts, dynamicIntents, parameters};
  }

  /**
   * Loads definition aggregates for a set of definition IDs.
   * Per FR-8 Rule 3: a null result for one definition does not block others.
   * Result array indices correspond 1-to-1 with defSystemIds.
   */
  private async loadDefinitionAggregates(
    defSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
    paramsByDef: Map<number, SpfModuleParameterDefinitionBase[]>,
  ): Promise<(DefinitionAggregate | null)[]> {
    const results: (DefinitionAggregate | null)[] = [];
    for (const defId of defSystemIds) {
      const params = paramsByDef.get(defId) ?? [];
      results.push(
        await this.loadDefinitionAggregate(
          defId,
          fileSystemId,
          sessionId,
          params,
        ),
      );
    }
    return results;
  }

  /**
   * Delegates ID resolution to SpfModuleDefinitionFetcher.resolveBaseDefinitionIds
   * (FR-3 — the fetcher owns the baseline scan for this aggregate).
   */
  private async resolveFilteredDefinitionIds(
    fileSystemId: number,
    filters: {
      moduleDefinitionNaturalId?: number;
      processorNaturalId?: number;
      parameterNaturalId?: number;
    },
  ): Promise<number[]> {
    return this.defFetcher.getBaseDefinitionIds(fileSystemId, filters);
  }

  /**
   * Batch-loads processor info by system IDs via ProcessorDefinitionFetcher (FR-3).
   */
  private async loadProcessorInfo(
    processorSystemIds: number[],
    sessionId: number | null,
  ): Promise<Map<number, ProcessorSummaryReadModel>> {
    const map = new Map<number, ProcessorSummaryReadModel>();
    if (processorSystemIds.length === 0) return map;

    const rows = await this.processorFetcher.fetchMany(
      processorSystemIds,
      sessionId,
    );
    for (const row of rows) {
      map.set(row.systemId, {
        systemId: row.systemId,
        processorId: row.processorDefinitionId,
        name: row.name,
      });
    }
    return map;
  }

  /**
   * Batch-loads container type names by system IDs via ContainerTypeFetcher (FR-3).
   */
  private async loadContainerTypeNames(
    containerTypeSystemIds: number[],
    sessionId: number | null,
  ): Promise<Map<number, ContainerTypeSummaryReadModel>> {
    const map = new Map<number, ContainerTypeSummaryReadModel>();
    if (containerTypeSystemIds.length === 0) return map;

    const rows = await this.containerTypeFetcher.fetchMany(
      containerTypeSystemIds,
      sessionId,
    );
    for (const row of rows) {
      map.set(row.systemId, {name: row.name, value: String(row.value)});
    }
    return map;
  }

  /** Returns the set of definition systemIds that have custom module metadata. */
  private async resolveCustomModuleSystemIds(
    defSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<Set<number>> {
    if (defSystemIds.length === 0) return new Set();
    const rows = await this.moduleManagerFetcher.fetchMany(
      defSystemIds,
      fileSystemId,
      sessionId,
    );
    return new Set(rows.map(row => row.moduleDefinitionSystemId));
  }

  // ── Assembly methods ──────────────────────────────────────────────────────

  /**
   * Maps a loaded definition aggregate to SpfModuleDefinitionReadModel.
   * FullDetails includes nested structures; Summary includes only port counts.
   */
  private buildDefinitionReadModel(
    agg: DefinitionAggregate,
    includes: ConfigurationIncludes,
  ): SpfModuleDefinitionReadModel {
    const maxInputPortsSupported = agg.portGroups
      .filter(g => g.portIoType === PORT_IO_TYPE.Input)
      .reduce((sum, g) => sum + g.maxAllowedPortCount, 0);
    const maxOutputPortsSupported = agg.portGroups
      .filter(g => g.portIoType === PORT_IO_TYPE.Output)
      .reduce((sum, g) => sum + g.maxAllowedPortCount, 0);
    const maxControlPortsSupported = agg.staticPorts.length;

    const details =
      includes === CONFIGURATION_INCLUDES.FullDetails
        ? {
            dataPortGroups: this.mapPortGroups(agg.portGroups),
            staticControlPorts: this.mapStaticPorts(agg.staticPorts),
            dynamicIntents: this.mapDynamicIntents(agg.dynamicIntents),
            parameterDefinitions: agg.parameters.map(p =>
              this.toParameterDefinitionReadModel(p),
            ),
          }
        : {
            dataPortGroups: null,
            staticControlPorts: null,
            dynamicIntents: null,
            parameterDefinitions: null,
          };

    return {
      systemId: agg.root.systemId,
      name: agg.root.name,
      moduleId: agg.root.moduleDefinitionId,
      maxInputPortsSupported,
      maxOutputPortsSupported,
      maxControlPortsSupported,
      ...details,
    };
  }

  /** Maps a loaded definition aggregate to SpfModuleDefinitionSummaryReadModel. */
  private buildSummaryReadModel(
    agg: DefinitionAggregate,
    processorInfo: ProcessorSummaryReadModel,
    containerTypeNameMap: Map<number, ContainerTypeSummaryReadModel>,
    isCustomModule: boolean,
  ): SpfModuleDefinitionSummaryReadModel {
    return {
      systemId: agg.root.systemId,
      moduleId: agg.root.moduleDefinitionId,
      name: agg.root.name,
      displayName: agg.root.displayName ?? undefined,
      description: agg.root.description ?? undefined,
      parameterDefinitions: agg.parameters.map(p =>
        this.toParameterSummaryReadModel(p),
      ),
      deprecated: undefined, // no column on spf_module_definitions yet
      processorInfo,
      modSearchKeys: agg.root.modSearchKeys ?? undefined,
      isOffloadable: undefined, // no column yet
      builtIn: false, // no column yet
      vocoderModuleType: undefined, // no column yet
      moduleDirectionType: undefined, // no column yet
      moduleInfo: this.buildModuleInfoSummary(agg, containerTypeNameMap),
      isLoadedAtBootup: agg.root.isLoadedAtBootup,
      isCustomModule,
    };
  }

  private buildModuleInfoSummary(
    agg: DefinitionAggregate,
    containerTypeNameMap: Map<number, ContainerTypeSummaryReadModel>,
  ): ModuleInfoSummaryReadModel {
    const portGroups = this.mapPortGroups(agg.portGroups);
    const staticCtrlPorts = this.mapStaticPorts(agg.staticPorts);
    const dynamicIntents = this.mapDynamicIntents(agg.dynamicIntents);
    const containerTypeInfo = agg.root.containerTypeSystemIds
      .map(id => containerTypeNameMap.get(id))
      .filter((ct): ct is ContainerTypeSummaryReadModel => ct !== undefined);

    return {
      pidFramework: 0, // no column yet
      stackSize: agg.root.stackSize,
      containerTypeInfo,
      metaData: undefined, // no column yet
      reserved: undefined, // no column yet
      inputDataPortInfo:
        portGroups.find(g => g.portIoType === PORT_IO_TYPE.Input) ?? null,
      outputDataPortInfo:
        portGroups.find(g => g.portIoType === PORT_IO_TYPE.Output) ?? null,
      staticCtrlPorts,
      dynamicIntents,
      moduleTypeInfo: undefined, // no column yet
      mdfModuleType: undefined, // no column yet
    };
  }

  // ── Read model mappers ────────────────────────────────────────────────────

  private mapPortGroups(
    groups: OverlaidDataPortGroup[],
  ): DataPortGroupReadModel[] {
    return groups.map(g => ({
      systemId: g.systemId,
      portIoType: g.portIoType,
      maxAllowedPortCount: g.maxAllowedPortCount,
      ports: this.mapPorts(g.portDefinitions),
    }));
  }

  private mapPorts(
    defs: DataPortDefinitionBase[],
  ): DataPortDefinitionReadModel[] {
    return defs.map(p => ({
      systemId: p.systemId,
      dataPortId: p.dataPortId,
      name: p.name ?? '',
    }));
  }

  private mapStaticPorts(
    ports: OverlaidStaticControlPortDefinition[],
  ): ControlPortDefinitionReadModel[] {
    return ports.map(p => ({
      systemId: p.systemId,
      portId: p.portId,
      portName: p.portName,
      staticIntents: this.mapStaticIntents(p.staticIntents),
    }));
  }

  private mapStaticIntents(
    intents: StaticIntentDefinitionBase[],
  ): StaticIntentDefinitionReadModel[] {
    return intents.map(i => ({
      systemId: i.systemId,
      intentId: i.intentId,
      name: i.name,
    }));
  }

  private mapDynamicIntents(
    intents: DynamicIntentDefinitionBase[],
  ): DynamicIntentDefinitionReadModel[] {
    return intents.map(d => ({
      systemId: d.systemId,
      intentId: d.intentId,
      name: d.name,
      maxPort: d.maxPort,
    }));
  }

  private toParameterDefinitionReadModel(
    p: SpfModuleParameterDefinitionBase,
  ): ParameterDefinitionReadModel {
    return {
      systemId: p.systemId,
      paramId: p.paramId,
      name: p.name ?? '',
      isReadOnly: p.isReadOnly,
      description: p.description,
      pidType: p.pidType,
      elementsStructure: p.elementsStructure,
    };
  }

  private toParameterSummaryReadModel(
    p: SpfModuleParameterDefinitionBase,
  ): ParameterDefinitionSummaryReadModel {
    return {
      systemId: p.systemId,
      paramId: p.paramId,
      name: p.name ?? '',
      description: p.description,
      isHidden: false, // not persisted yet
      isReadOnly: p.isReadOnly,
      deprecated: undefined, // not persisted yet
      toolPolicies: p.toolPolicies ?? '',
      pidType: p.pidType,
    };
  }

  private toCustomModuleMetadataReadModel(
    row: ModuleManagerDataBase,
  ): CustomModuleMetadataReadModel {
    return {
      type: {
        name: ModuleType.valueToName(row.moduleType),
        value: String(row.moduleType),
      },
      interface: {
        type: {
          name: InterfaceType.valueToName(row.interfaceType),
          value: String(row.interfaceType),
        },
        version: {
          name: InterfaceVersion.valueToName(row.interfaceVersion),
          value: String(row.interfaceVersion),
        },
      },
      fileName: row.fileName,
      endPointFunctionTag: row.tag,
    };
  }
}
