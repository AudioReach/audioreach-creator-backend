/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
/* eslint-disable sonarjs/deprecation -- TODO(LLD3): migrate to OverlayMergeImpl; these services use compat shims pending read-service rewrite */

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
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {applyTableOverlay} from '../edit-session/overlay-utils.js';
import type {SpfModuleDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-definition.schema.js';
import type {SpfModuleParameterDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.js';
import type {DynamicIntentDefinitionRow} from '../../entity-schema/definitions/module/spf/dynamic-intent-definition.schema.js';
import type {DataPortGroupRow} from '../../entity-schema/definitions/module/spf/data-group-definition.schema.js';
import type {DataPortDefinitionRow} from '../../entity-schema/definitions/module/spf/data-port-definition.schema.js';
import type {StaticControlPortDefinitionRow} from '../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';
import type {StaticIntentDefinitionRow} from '../../entity-schema/definitions/module/spf/static-intent-definition.schema.js';
import type {ModuleDefinitionContainerTypeLinkRow} from '../../entity-schema/definitions/module/spf/module-definition-container-type-link.schema.js';
import type {SpfModuleRow} from '../../entity-schema/usecase-data/module/spf-module.schema.js';
import type {ModuleManagerDataRow} from '../../entity-schema/module-manager/module-manager-data.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import {
  ModuleType,
  InterfaceType,
  InterfaceVersion,
} from '../../entity-schema/module-manager/types.js';

/**
 * Database implementation of SpfModuleDefinitionQueryService.
 *
 * getDefinition() always loads summary (port capacity counts) by default.
 * fullDetails=true loads ports, intents, and parameters on top of summary.
 *
 * Single-item overlay (getDefinition/getParameterDefinition) — one
 * getEditActionsByAggregateId call per aggregate, applyTableOverlay filters
 * per table from the single result. Same pattern as applyKeyDefOverlay
 * across all services.
 *
 * List overlay (getAllSpfModuleDefinitionSummaries/getSpfModuleDefinitionSummary)
 * batches instead — loadOverlaidDefinitionRows/loadParameterDefinitionsForModules
 * fetch each table once via getEditActionsByTable and group by aggregateId,
 * so listing N modules costs O(1) queries, not O(N).
 *
 * Parameter definition loading merged here — internal concern of this service.
 */
export class DbSpfModuleDefinitionQueryService implements SpfModuleDefinitionQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  // ── Public methods ───────────────────────────────────────────────────────

  async getModuleDefinitionSystemId(
    spfModuleSystemId: number,
  ): Promise<Result<number>> {
    try {
      const module = (await this.dataSource
        .getRepository(ENTITY_NAMES.SpfModule)
        .createQueryBuilder('m')
        .select(['m.systemId', 'm.definitionSystemId'])
        .where('m.systemId = :systemId', {systemId: spfModuleSystemId})
        .getOne()) as SpfModuleRow | null;

      if (!module) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModule not found for systemId=${spfModuleSystemId} — cannot resolve definition system ID`,
          severity: IssueSeverity.Error,
        });
      }
      return Result.ok(module.definitionSystemId);
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

  async getDefinition(
    defSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<SpfModuleDefinitionReadModel>> {
    try {
      // Use batched infrastructure (same as summary queries) for consistency
      const qb = this.buildSummaryQueryBuilder(fileSystemId).andWhere(
        'def.systemId = :defSystemId',
        {defSystemId},
      );

      const summaries = await this.loadSummaryReadModels(qb, fileSystemId);
      const summary = summaries.find(s => s.systemId === defSystemId);

      if (!summary) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModuleDefinition not found for systemId=${defSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      // Convert SpfModuleDefinitionSummaryReadModel → SpfModuleDefinitionReadModel
      return Result.ok(this.summaryToDefinitionReadModel(summary, includes));
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
      // Step 1 — Load base row to get the module definition system ID
      const row = (await this.dataSource
        .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
        .createQueryBuilder('param')
        .where('param.systemId = :id', {id: parameterDefinitionSystemId})
        .getOne()) as SpfModuleParameterDefinitionRow | null;

      if (!row) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `ParameterDefinition not found for systemId=${parameterDefinitionSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      // Step 2 — Use batched overlay method (consistent with summary queries)
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const sessionId = session?.sessionId ?? null;

      const parametersByModuleId =
        await this.loadParameterDefinitionsForModules(
          [row.spfModuleDefinitionSystemId],
          sessionId,
        );

      const params =
        parametersByModuleId.get(row.spfModuleDefinitionSystemId) ?? [];
      const overlaid = params.find(
        p => p.systemId === parameterDefinitionSystemId,
      );

      if (!overlaid) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `ParameterDefinition not found after overlay for systemId=${parameterDefinitionSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      // Step 3 — Return based on ConfigurationIncludes
      // summary: systemId, paramId, name, description, pidType (already in overlaid)
      // fullDetails: all fields (already in overlaid from toParameterDefinitionReadModel)
      if (includes !== CONFIGURATION_INCLUDES.FullDetails) {
        return Result.ok({
          systemId: overlaid.systemId,
          paramId: overlaid.paramId,
          name: overlaid.name,
          isReadOnly: overlaid.isReadOnly,
          description: overlaid.description,
          pidType: overlaid.pidType,
        });
      }

      return Result.ok(overlaid);
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

  // ── Summary query methods (list / get-by-id / custom-module-metadata) ───

  /**
   * Returns all SPF module definitions for the file, filtered by any
   * combination of processorNaturalId/moduleDefinitionNaturalId/parameterNaturalId (AND
   * semantics). Overlay always applied.
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
      const qb = this.buildSummaryQueryBuilder(fileSystemId);

      if (filters.moduleDefinitionNaturalId !== undefined) {
        qb.andWhere('def.moduleDefinitionId = :moduleDefinitionId', {
          moduleDefinitionId: filters.moduleDefinitionNaturalId,
        });
      }
      if (filters.processorNaturalId !== undefined) {
        qb.andWhere('processor.processorDefinitionId = :processorId', {
          processorId: filters.processorNaturalId,
        });
      }
      if (filters.parameterNaturalId !== undefined) {
        qb.andWhere(
          `EXISTS (${qb
            .subQuery()
            .select('1')
            .from(ENTITY_NAMES.SpfModuleParameterDefinition, 'p2')
            .where('p2.spfModuleDefinitionSystemId = def.systemId')
            .andWhere('p2.paramId = :parameterId')
            .getQuery()})`,
          {parameterId: filters.parameterNaturalId},
        );
      }

      const data = await this.loadSummaryReadModels(qb, fileSystemId);
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

  /**
   * Returns a single SPF module definition summary by system ID.
   * Result.fail with ENTITY_NOT_FOUND if absent from DB and session.
   */
  async getSpfModuleDefinitionSummary(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleDefinitionSummaryReadModel>> {
    try {
      const qb = this.buildSummaryQueryBuilder(fileSystemId).andWhere(
        'def.systemId = :moduleSystemId',
        {moduleSystemId},
      );

      const data = await this.loadSummaryReadModels(qb, fileSystemId);
      const match = data.find(d => d.systemId === moduleSystemId);
      if (!match) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModuleDefinition not found for systemId=${moduleSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      return Result.ok(match);
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

  /**
   * Returns FR-3's custom module metadata for one module definition,
   * sourced from module_manager_data (joined by moduleDefinitionSystemId).
   */
  async getCustomModuleMetadata(
    moduleDefinitionSystemId: number,
    fileSystemId: number,
  ): Promise<Result<CustomModuleMetadataReadModel>> {
    try {
      const row = (await this.dataSource
        .getRepository(ENTITY_NAMES.ModuleManagerData)
        .createQueryBuilder('mmd')
        .where('mmd.moduleDefinitionSystemId = :moduleDefinitionSystemId', {
          moduleDefinitionSystemId,
        })
        .andWhere('mmd.fileSystemId = :fileSystemId', {fileSystemId})
        .getOne()) as ModuleManagerDataRow | null;

      if (!row) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `No custom module metadata found for module definition systemId=${moduleDefinitionSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      return Result.ok(this.toCustomModuleMetadataReadModel(row));
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

  /**
   * Batched variant of getCustomModuleMetadata — one IN query for a list of
   * module definition system IDs instead of one query per module. Modules
   * with no module_manager_data row are simply absent from the returned map.
   */
  async getCustomModuleMetadataBySystemIds(
    moduleDefinitionSystemIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, CustomModuleMetadataReadModel>> {
    const map = new Map<number, CustomModuleMetadataReadModel>();
    if (moduleDefinitionSystemIds.length === 0) return map;

    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.ModuleManagerData)
      .createQueryBuilder('mmd')
      .where(
        'mmd.moduleDefinitionSystemId IN (:...moduleDefinitionSystemIds)',
        {
          moduleDefinitionSystemIds,
        },
      )
      .andWhere('mmd.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as ModuleManagerDataRow[];

    for (const row of rows) {
      map.set(
        row.moduleDefinitionSystemId,
        this.toCustomModuleMetadataReadModel(row),
      );
    }
    return map;
  }

  private toCustomModuleMetadataReadModel(
    row: ModuleManagerDataRow,
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

  // ── Summary query helpers ────────────────────────────────────────────────

  private buildSummaryQueryBuilder(fileSystemId: number) {
    return this.dataSource
      .getRepository(ENTITY_NAMES.SpfModuleDefinition)
      .createQueryBuilder('def')
      .where('def.fileSystemId = :fileSystemId', {fileSystemId})
      .leftJoinAndSelect('def.processor', 'processor')
      .leftJoinAndSelect('def.containerTypeLinks', 'ctLink')
      .leftJoinAndSelect('ctLink.containerType', 'ct')
      .leftJoinAndSelect('def.dataPortGroups', 'portGroup')
      .leftJoinAndSelect('portGroup.ports', 'portDef')
      .leftJoinAndSelect('def.staticPorts', 'staticPort')
      .leftJoinAndSelect('staticPort.staticIntents', 'staticIntent')
      .leftJoinAndSelect('def.dynamicIntents', 'dynamicIntent');
  }

  /**
   * Runs the given summary query, then overlays + assembles every matched
   * row into a SpfModuleDefinitionSummaryReadModel. Batches overlay and
   * parameter resolution across all matched rows — see
   * loadOverlaidDefinitionRows / loadParameterDefinitionsForModules —
   * instead of one getEditActionsByAggregateId + one parameter query per
   * row (O(1) queries total, not O(N)).
   */
  private async loadSummaryReadModels(
    qb: ReturnType<
      DbSpfModuleDefinitionQueryService['buildSummaryQueryBuilder']
    >,
    fileSystemId: number,
  ): Promise<SpfModuleDefinitionSummaryReadModel[]> {
    const rows = (await qb.getMany()) as SpfModuleDefinitionRow[];
    if (rows.length === 0) return [];

    const moduleSystemIds = rows.map(r => r.systemId);
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    const sessionId = session?.sessionId ?? null;

    const [overlaidRows, parametersByModuleId, customModuleSystemIds] =
      await Promise.all([
        this.loadOverlaidDefinitionRows(rows, sessionId),
        this.loadParameterDefinitionsForModules(moduleSystemIds, sessionId),
        (async () => {
          if (moduleSystemIds.length === 0) return new Set<number>();

          const rows = (await this.dataSource
            .getRepository(ENTITY_NAMES.ModuleManagerData)
            .createQueryBuilder('mmd')
            .select(['mmd.moduleDefinitionSystemId'])
            .where('mmd.moduleDefinitionSystemId IN (:...systemIds)', {
              systemIds: moduleSystemIds,
            })
            .getMany()) as ModuleManagerDataRow[];

          return new Set(rows.map(r => r.moduleDefinitionSystemId));
        })(),
      ]);

    return rows.map(row => {
      const overlaidRow = overlaidRows.get(row.systemId) ?? row;
      const parameterDefinitions = (
        parametersByModuleId.get(row.systemId) ?? []
      ).map(p => this.toParameterSummaryReadModel(p));

      const processorInfo: ProcessorSummaryReadModel = {
        systemId:
          overlaidRow.processor?.systemId ?? overlaidRow.processorSystemId,
        processorId: overlaidRow.processor?.processorDefinitionId ?? 0,
        name: overlaidRow.processor?.name ?? '',
      };

      return {
        systemId: overlaidRow.systemId,
        moduleId: overlaidRow.moduleDefinitionId,
        name: overlaidRow.name ?? '',
        displayName: overlaidRow.displayName,
        description: overlaidRow.description,
        parameterDefinitions,
        deprecated: undefined, // no column on spf_module_definitions yet
        processorInfo,
        modSearchKeys: overlaidRow.modSearchKeys,
        isOffloadable: undefined, // no column on spf_module_definitions yet
        builtIn: false, // no column on spf_module_definitions yet
        vocoderModuleType: undefined, // no column on spf_module_definitions yet
        moduleDirectionType: undefined, // no column on spf_module_definitions yet
        moduleInfo: this.mapModuleInfoSummary(overlaidRow),
        isLoadedAtBootup: overlaidRow.isLoadedAtBootup,
        isCustomModule: customModuleSystemIds.has(row.systemId),
      };
    });
  }

  /**
   * Batched overlay for a list of SpfModuleDefinition rows — one
   * getEditActionsByAggregateId call per row, run concurrently. Always
   * resolves full detail (ports/intents) — the summary read model has no
   * summary/fullDetails toggle, unlike getDefinition. Delegates the actual
   * tree-walk to overlayModuleDefinitionTree — same shared logic
   * getDefinition uses for a single row.
   *
   * Aggregate-scoped rather than table-scoped: N modules cost N queries,
   * each returning only that module's own actions (no session-wide
   * over-fetch), instead of a fixed 6 getEditActionsByTable calls that pull
   * every action across the whole session and discard what doesn't belong
   * to the requested modules. This trades an O(1)-regardless-of-N query
   * count for O(N) with no wasted rows — the right call when N is small
   * (get-by-id, small lists); revisit if list sizes grow large enough that
   * N queries becomes the bottleneck instead.
   */
  private async loadOverlaidDefinitionRows(
    baseRows: SpfModuleDefinitionRow[],
    sessionId: number | null,
  ): Promise<Map<number, SpfModuleDefinitionRow>> {
    const map = new Map<number, SpfModuleDefinitionRow>();
    if (sessionId === null) {
      for (const row of baseRows) map.set(row.systemId, row);
      return map;
    }

    const actionsByRow = await Promise.all(
      baseRows.map(row =>
        this.editActionsSvc.getByAggregateId(sessionId, row.systemId),
      ),
    );

    for (const [index, baseRow] of baseRows.entries()) {
      const actions = actionsByRow[index];
      map.set(
        baseRow.systemId,
        this.overlayModuleDefinitionTree(baseRow, actions),
      );
    }

    return map;
  }

  /**
   * Batched parameter resolution for a list of module definition system
   * ids — one IN query + one getEditActionsByTable call total, instead of
   * one query + one getEditActionsByAggregateId call per module. Mirrors
   * DbKeyValueDefQueryService.getKeyDefinitionsBySystemIds's batching shape.
   */
  private async loadParameterDefinitionsForModules(
    moduleDefSystemIds: number[],
    sessionId: number | null,
  ): Promise<Map<number, ParameterDefinitionReadModel[]>> {
    if (moduleDefSystemIds.length === 0) return new Map();

    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
      .createQueryBuilder('param')
      .where('param.spfModuleDefinitionSystemId IN (:...moduleDefSystemIds)', {
        moduleDefSystemIds,
      })
      .getMany()) as SpfModuleParameterDefinitionRow[];

    const overlaidRows =
      sessionId === null
        ? rows
        : applyToCollection(
            rows,
            await this.editActionsSvc.getByTable(
              sessionId,
              ENTITY_NAMES.SpfModuleParameterDefinition,
            ),
          );

    const rowsByModuleId = new Map<number, SpfModuleParameterDefinitionRow[]>();
    for (const row of overlaidRows) {
      const bucket = rowsByModuleId.get(row.spfModuleDefinitionSystemId) ?? [];
      bucket.push(row);
      rowsByModuleId.set(row.spfModuleDefinitionSystemId, bucket);
    }

    const map = new Map<number, ParameterDefinitionReadModel[]>();
    for (const [moduleId, rows] of rowsByModuleId) {
      map.set(moduleId, this.mapParameterDefs(rows));
    }
    return map;
  }

  private toParameterSummaryReadModel(
    p: ParameterDefinitionReadModel,
  ): ParameterDefinitionSummaryReadModel {
    return {
      systemId: p.systemId,
      paramId: p.paramId,
      name: p.name,
      description: p.description,
      isHidden: false, // not persisted anywhere yet — LLD §2.3.1
      isReadOnly: p.isReadOnly,
      deprecated: undefined, // not persisted yet — LLD §2.3.1
      toolPolicies: p.toolPolicies ?? '',
      pidType: p.pidType,
    };
  }

  /**
   * Composes the mapping helpers into ModuleInfoSummaryReadModel — replaces
   * toModuleInfoSummary + assembleFullDetails combined. Container type
   * links are read from the base DB only; overlayModuleDefinitionTree does
   * not overlay the containerTypeLinks join table (out of scope for this
   * phase; container-type assignment editing isn't a primary concern here).
   */
  private mapModuleInfoSummary(
    overlaidRow: SpfModuleDefinitionRow,
  ): ModuleInfoSummaryReadModel {
    const portGroups = this.mapPortGroups(overlaidRow.dataPortGroups ?? []);
    const staticCtrlPorts = this.mapStaticPorts(overlaidRow.staticPorts ?? []);
    const dynamicIntents = this.mapDynamicIntents(
      overlaidRow.dynamicIntents ?? [],
    );
    const containerTypeInfo = this.mapContainerTypes(
      overlaidRow.containerTypeLinks ?? [],
    );

    return {
      pidFramework: 0, // no column on spf_module_definitions yet
      stackSize: overlaidRow.stackSize,
      containerTypeInfo,
      metaData: undefined, // no column on spf_module_definitions yet
      reserved: undefined, // no column on spf_module_definitions yet
      inputDataPortInfo:
        portGroups.find(g => g.portIoType === PORT_IO_TYPE.Input) ?? null,
      outputDataPortInfo:
        portGroups.find(g => g.portIoType === PORT_IO_TYPE.Output) ?? null,
      staticCtrlPorts,
      dynamicIntents,
      moduleTypeInfo: undefined, // no column yet — parseModuleTypeInfo deferred with schema
      mdfModuleType: undefined, // no column yet — parseMdfModuleType deferred with schema
    };
  }

  // ── Overlay methods ──────────────────────────────────────────────────────

  private overlayDynamicIntents(
    rows: DynamicIntentDefinitionRow[],
    actions: EditActionRow[],
  ): DynamicIntentDefinitionRow[] {
    return applyToCollection(
      rows,
      actions.filter(
        a => a.targetTable === ENTITY_NAMES.DynamicIntentDefinition,
      ),
    );
  }

  private overlayPortGroups(
    rows: DataPortGroupRow[],
    actions: EditActionRow[],
  ): DataPortGroupRow[] {
    return applyToCollection(
      rows,
      actions.filter(a => a.targetTable === ENTITY_NAMES.DataPortGroup),
    );
  }

  private overlayPorts(
    rows: DataPortDefinitionRow[],
    actions: EditActionRow[],
  ): DataPortDefinitionRow[] {
    return applyToCollection(
      rows,
      actions.filter(a => a.targetTable === ENTITY_NAMES.DataPortDefinition),
    );
  }

  private overlayStaticPorts(
    rows: StaticControlPortDefinitionRow[],
    actions: EditActionRow[],
  ): StaticControlPortDefinitionRow[] {
    return applyToCollection(
      rows,
      actions.filter(
        a => a.targetTable === ENTITY_NAMES.StaticControlPortDefinition,
      ),
    );
  }

  private overlayStaticIntents(
    rows: StaticIntentDefinitionRow[],
    actions: EditActionRow[],
  ): StaticIntentDefinitionRow[] {
    return applyToCollection(
      rows,
      actions.filter(
        a => a.targetTable === ENTITY_NAMES.StaticIntentDefinition,
      ),
    );
  }

  /**
   * Composes the root-row overlay (inline, single call site) with the five
   * per-table overlay helpers into the full SpfModuleDefinition tree:
   * root → dataPortGroups → ports, staticPorts → staticIntents,
   * dynamicIntents. Always overlays every leaf table — replaces
   * overlayDefinitionTree, which gated leaf overlay behind an
   * `includeLeafDetails` flag that every live caller already passed as
   * `true` (the summary read model has no summary/fullDetails toggle;
   * getDefinition derives its own split downstream in
   * summaryToDefinitionReadModel, not via overlay-skipping).
   */
  private overlayModuleDefinitionTree(
    row: SpfModuleDefinitionRow,
    actions: EditActionRow[],
  ): SpfModuleDefinitionRow {
    const overlaidDef =
      applyTableOverlay(row, actions, ENTITY_NAMES.SpfModuleDefinition) ?? row;

    const overlaidPortGroups = this.overlayPortGroups(
      overlaidDef.dataPortGroups ?? [],
      actions,
    ).map(g => ({
      ...g,
      ports: this.overlayPorts(g.ports ?? [], actions),
    }));

    const overlaidStaticPorts = this.overlayStaticPorts(
      overlaidDef.staticPorts ?? [],
      actions,
    ).map(p => ({
      ...p,
      staticIntents: this.overlayStaticIntents(p.staticIntents ?? [], actions),
    }));

    return {
      ...overlaidDef,
      dataPortGroups: overlaidPortGroups,
      staticPorts: overlaidStaticPorts,
      dynamicIntents: this.overlayDynamicIntents(
        overlaidDef.dynamicIntents ?? [],
        actions,
      ),
    };
  }

  // ── Assembly methods ─────────────────────────────────────────────────────

  private mapPortGroups(rows: DataPortGroupRow[]): DataPortGroupReadModel[] {
    return rows.map(
      (g): DataPortGroupReadModel => ({
        systemId: g.systemId,
        portIoType: g.portIoType,
        maxAllowedPortCount: g.maxAllowedPortCount,
        ports: this.mapPorts(g.ports ?? []),
      }),
    );
  }

  private mapPorts(
    rows: DataPortDefinitionRow[],
  ): DataPortDefinitionReadModel[] {
    return rows.map(
      (p): DataPortDefinitionReadModel => ({
        systemId: p.systemId,
        dataPortId: p.dataPortId,
        name: p.name ?? '',
      }),
    );
  }

  private mapStaticPorts(
    rows: StaticControlPortDefinitionRow[],
  ): ControlPortDefinitionReadModel[] {
    return rows.map(
      (p): ControlPortDefinitionReadModel => ({
        systemId: p.systemId,
        portId: p.portId,
        portName: p.portName ?? '',
        staticIntents: this.mapStaticIntents(p.staticIntents ?? []),
      }),
    );
  }

  private mapStaticIntents(
    rows: StaticIntentDefinitionRow[],
  ): StaticIntentDefinitionReadModel[] {
    return rows.map(
      (i): StaticIntentDefinitionReadModel => ({
        systemId: i.systemId,
        intentId: i.intentId,
        name: i.name ?? '',
      }),
    );
  }

  private mapDynamicIntents(
    rows: DynamicIntentDefinitionRow[],
  ): DynamicIntentDefinitionReadModel[] {
    return rows.map(
      (d): DynamicIntentDefinitionReadModel => ({
        systemId: d.systemId,
        intentId: d.intentId,
        name: d.name ?? '',
        maxPort: d.maxPort,
      }),
    );
  }

  private mapContainerTypes(
    links: ModuleDefinitionContainerTypeLinkRow[],
  ): ContainerTypeSummaryReadModel[] {
    return links
      .map(l => l.containerType)
      .filter((ct): ct is NonNullable<typeof ct> => ct != null)
      .map(ct => ({name: ct.name, value: String(ct.value)}));
  }

  private mapParameterDefs(
    rows: SpfModuleParameterDefinitionRow[],
  ): ParameterDefinitionReadModel[] {
    return rows.map(
      (row): ParameterDefinitionReadModel => ({
        systemId: row.systemId,
        paramId: row.paramId,
        name: row.name,
        isReadOnly: false, // ToDO
        description: row.description,
        pidType: row.pidType ?? '',
      }),
    );
  }

  /**
   * Loads and overlays parameter definitions for a module definition aggregate.
   * Parameters are keyed by moduleDefSystemId — separate aggregate from the definition.
   *
   * Delegates to loadParameterDefinitionsForModules for consistent batched overlay
   * strategy across single and multi-module queries. The batched method uses
   * getEditActionsByTable instead of getEditActionsByAggregateId, providing a
   * uniform approach that matches the pattern used by summary queries.
   *
   * sessionId lets a caller that already resolved the active session pass
   * it through instead of this method re-deriving it via its own
   * findActiveSession call.
   */
  async queryParameterDefinitions(
    fileSystemId: number,
    moduleDefSystemId: number,
    paramSystemIds?: number[],
    sessionId?: number | null,
  ): Promise<ParameterDefinitionReadModel[]> {
    if (sessionId === undefined) {
      const activeSession =
        await this.editActionsSvc.findActiveSession(fileSystemId);
      sessionId = activeSession?.sessionId ?? null;
    }

    const parametersByModuleId = await this.loadParameterDefinitionsForModules(
      [moduleDefSystemId],
      sessionId,
    );

    const params = parametersByModuleId.get(moduleDefSystemId) ?? [];

    return paramSystemIds && paramSystemIds.length > 0
      ? params.filter(p => paramSystemIds.includes(p.systemId))
      : params;
  }

  /**
   * Converts SpfModuleDefinitionSummaryReadModel → SpfModuleDefinitionReadModel.
   * The summary model contains all the data needed for the definition model;
   * we just need to reshape it and filter based on ConfigurationIncludes.
   */
  private summaryToDefinitionReadModel(
    summary: SpfModuleDefinitionSummaryReadModel,
    includes: ConfigurationIncludes,
  ): SpfModuleDefinitionReadModel {
    // Compute capacity counts from moduleInfo
    const staticPorts = summary.moduleInfo.staticCtrlPorts ?? [];

    const counts = {
      maxInputPortsSupported:
        summary.moduleInfo.inputDataPortInfo?.maxAllowedPortCount ?? 0,
      maxOutputPortsSupported:
        summary.moduleInfo.outputDataPortInfo?.maxAllowedPortCount ?? 0,
      maxControlPortsSupported: staticPorts.length,
    };

    // For fullDetails, extract the nested structures
    const details =
      includes === CONFIGURATION_INCLUDES.FullDetails
        ? {
            dataPortGroups: [
              summary.moduleInfo.inputDataPortInfo,
              summary.moduleInfo.outputDataPortInfo,
            ].filter((g): g is NonNullable<typeof g> => g != null),
            staticControlPorts: summary.moduleInfo.staticCtrlPorts ?? [],
            dynamicIntents: summary.moduleInfo.dynamicIntents ?? [],
            parameterDefinitions: summary.parameterDefinitions.map(p => ({
              systemId: p.systemId,
              paramId: p.paramId,
              name: p.name,
              isReadOnly: p.isReadOnly,
              description: p.description,
              pidType: p.pidType,
            })),
          }
        : {
            dataPortGroups: null,
            staticControlPorts: null,
            dynamicIntents: null,
            parameterDefinitions: null,
          };

    return {
      systemId: summary.systemId,
      name: summary.name,
      moduleId: summary.moduleId,
      ...counts,
      ...details,
    };
  }
}
