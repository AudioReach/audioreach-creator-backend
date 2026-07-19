/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
/* eslint-disable sonarjs/deprecation -- TODO(LLD3): migrate to OverlayMergeImpl; these services use compat shims pending read-service rewrite */

import type {DataSource} from 'typeorm';
import type {
  SpfModuleDefinitionQueryService,
  SpfModuleDefinitionReadModel,
  DataPortGroupReadModel,
  DataPortDefinitionReadModel,
  ControlPortDefinitionReadModel,
  StaticIntentDefinitionReadModel,
  DynamicIntentDefinitionReadModel,
  ParameterDefinitionReadModel,
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
import type {SpfModuleRow} from '../../entity-schema/usecase-data/module/spf-module.schema.js';

/**
 * Database implementation of SpfModuleDefinitionQueryService.
 *
 * getDefinition() always loads summary (port capacity counts) by default.
 * fullDetails=true loads ports, intents, and parameters on top of summary.
 *
 * Overlay always applied — one getByAggregateId call per aggregate,
 * applyTableOverlay filters per table from the single result.
 * Same pattern as applyParamDefOverlay / applyKeyDefOverlay across all services.
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
      // Step 1 — QueryBuilder
      // summary is always loaded — port groups + static ports needed for capacity counts
      let qb = this.dataSource
        .getRepository(ENTITY_NAMES.SpfModuleDefinition)
        .createQueryBuilder('def')
        .where('def.systemId = :id', {id: defSystemId})
        .leftJoinAndSelect('def.dataPortGroups', 'portGroup')
        .leftJoinAndSelect('def.staticPorts', 'staticPort');

      // fullDetails adds port definitions, intents, dynamic intents on top of summary
      if (includes === CONFIGURATION_INCLUDES.FullDetails) {
        qb = qb
          .leftJoinAndSelect('portGroup.ports', 'portDef')
          .leftJoinAndSelect('staticPort.staticIntents', 'staticIntent')
          .leftJoinAndSelect('def.dynamicIntents', 'dynamicIntent');
      }

      const defRow = (await qb.getOne()) as SpfModuleDefinitionRow | null;
      if (!defRow) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModuleDefinition not found for systemId=${defSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      // Step 2 — Overlay: one session lookup, one aggregate actions call
      // applyDefinitionOverlay applies applyTableOverlay per table from the single result
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaidRow = session
        ? await this.applyDefinitionOverlay(
            defRow,
            defSystemId,
            session,
            includes,
          )
        : defRow;

      // Step 3 — summary counts always computed (summary is always loaded)
      const counts = this.computeSummaryCounts(overlaidRow);

      // Step 4 — full details built on top of overlaid row
      const details =
        includes === CONFIGURATION_INCLUDES.FullDetails
          ? this.assembleFullDetails(overlaidRow)
          : {
              dataPortGroups: null,
              staticControlPorts: null,
              dynamicIntents: null,
              parameterDefinitions: null,
            };

      // Step 5 — parameter definitions loaded separately (own aggregate)
      const parameterDefinitions =
        includes === CONFIGURATION_INCLUDES.FullDetails
          ? await this.queryParameterDefinitions(fileSystemId, defSystemId)
          : null;

      return Result.ok({
        systemId: overlaidRow.systemId,
        name: overlaidRow.name ?? '',
        moduleId: overlaidRow.moduleDefinitionId,
        ...counts,
        ...details,
        parameterDefinitions,
      });
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
      // Step 1 — QueryBuilder
      const row = (await this.dataSource
        .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
        .createQueryBuilder('param')
        .where('param.systemId = :id', {id: parameterDefinitionSystemId})
        .getOne()) as SpfModuleParameterDefinitionRow | null;

      // Step 2 — Overlay
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaid = session
        ? await this.applyParamDefOverlay(
            row,
            parameterDefinitionSystemId,
            session,
          )
        : row;

      if (!overlaid) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `ParameterDefinition not found for systemId=${parameterDefinitionSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      // Step 3 — Map based on ConfigurationIncludes
      // summary: systemId, paramId, name, description, pidType
      // fullDetails: all fields
      const base: ParameterDefinitionReadModel = {
        systemId: overlaid.systemId,
        paramId: overlaid.paramId,
        name: overlaid.name,
        description: overlaid.description,
        pidType: overlaid.pidType ?? '',
      };

      if (includes !== CONFIGURATION_INCLUDES.FullDetails)
        return Result.ok(base);

      return Result.ok({
        ...base,
        maxSize: overlaid.maxSize,
        elementsStructure: overlaid.elementsStructure,
        isPersistent: overlaid.isPersistent,
        isReadOnly: overlaid.isReadOnly,
        toolPolicies: overlaid.toolPolicies,
      });
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

  // ── Overlay methods ──────────────────────────────────────────────────────

  /**
   * Applies overlay to a SpfModuleDefinition aggregate.
   * One getByAggregateId call returns actions for all tables under
   * this aggregate. applyTableOverlay filters per table — same pattern as
   * applyParamDefOverlay and applyKeyDefOverlay across all services.
   * Only overlays tables that were joined based on includes.
   */
  private async applyDefinitionOverlay(
    baseRow: SpfModuleDefinitionRow,
    defSystemId: number,
    session: {sessionId: number},
    includes: ConfigurationIncludes,
  ): Promise<SpfModuleDefinitionRow> {
    const actions = await this.editActionsSvc.getByAggregateId(
      session.sessionId,
      defSystemId,
    );

    // Overlay root definition row
    const overlaidDef =
      applyTableOverlay(baseRow, actions, ENTITY_NAMES.SpfModuleDefinition) ??
      baseRow;

    // summary always loaded — overlay port groups and static ports
    const overlaidPortGroups = applyToCollection(
      overlaidDef.dataPortGroups ?? [],
      actions.filter(a => a.targetTable === ENTITY_NAMES.DataPortGroup),
    );

    const overlaidStaticPorts = applyToCollection(
      overlaidDef.staticPorts ?? [],
      actions.filter(
        a => a.targetTable === ENTITY_NAMES.StaticControlPortDefinition,
      ),
    );

    // fullDetails — overlay ports, intents, dynamic intents
    const overlaidPortGroupsWithPorts =
      includes === CONFIGURATION_INCLUDES.FullDetails
        ? overlaidPortGroups.map(g => ({
            ...g,
            ports: applyToCollection(
              g.ports ?? [],
              actions.filter(
                a => a.targetTable === ENTITY_NAMES.DataPortDefinition,
              ),
            ),
          }))
        : overlaidPortGroups;

    const overlaidStaticPortsWithIntents =
      includes === CONFIGURATION_INCLUDES.FullDetails
        ? overlaidStaticPorts.map(p => ({
            ...p,
            staticIntents: applyToCollection(
              p.staticIntents ?? [],
              actions.filter(
                a => a.targetTable === ENTITY_NAMES.StaticIntentDefinition,
              ),
            ),
          }))
        : overlaidStaticPorts;

    const overlaidDynamicIntents =
      includes === CONFIGURATION_INCLUDES.FullDetails
        ? applyToCollection(
            overlaidDef.dynamicIntents ?? [],
            actions.filter(
              a => a.targetTable === ENTITY_NAMES.DynamicIntentDefinition,
            ),
          )
        : (overlaidDef.dynamicIntents ?? []);

    return {
      ...overlaidDef,
      dataPortGroups: overlaidPortGroupsWithPorts,
      staticPorts: overlaidStaticPortsWithIntents,
      dynamicIntents: overlaidDynamicIntents,
    };
  }

  /**
   * Applies overlay to a SpfModuleParameterDefinition row.
   * Called only when an active session exists — session is guaranteed non-null.
   * One getByAggregateId call, applyTableOverlay filters to the table.
   */
  private async applyParamDefOverlay(
    baseRow: SpfModuleParameterDefinitionRow | null,
    parameterDefinitionSystemId: number,
    session: {sessionId: number},
  ): Promise<SpfModuleParameterDefinitionRow | null> {
    const actions = await this.editActionsSvc.getByAggregateId(
      session.sessionId,
      parameterDefinitionSystemId,
    );
    return applyTableOverlay(
      baseRow,
      actions,
      ENTITY_NAMES.SpfModuleParameterDefinition,
    );
  }

  // ── Assembly methods ─────────────────────────────────────────────────────

  /**
   * Computes port capacity counts from the already-overlaid row.
   * summary is always loaded so this is always called.
   */
  private computeSummaryCounts(row: SpfModuleDefinitionRow): {
    maxInputPortsSupported: number;
    maxOutputPortsSupported: number;
    maxControlPortsSupported: number;
  } {
    const portGroups = row.dataPortGroups ?? [];
    const staticPorts = row.staticPorts ?? [];

    return {
      maxInputPortsSupported: portGroups
        .filter(g => g.portIoType === PORT_IO_TYPE.Input)
        .reduce((s, g) => s + g.maxAllowedPortCount, 0),
      maxOutputPortsSupported: portGroups
        .filter(g => g.portIoType === PORT_IO_TYPE.Output)
        .reduce((s, g) => s + g.maxAllowedPortCount, 0),
      maxControlPortsSupported: staticPorts.length,
    };
  }

  /**
   * Assembles full detail read models from the already-overlaid row.
   * Parameter definitions loaded separately via queryParameterDefinitions.
   */
  private assembleFullDetails(row: SpfModuleDefinitionRow): {
    dataPortGroups: DataPortGroupReadModel[];
    staticControlPorts: ControlPortDefinitionReadModel[];
    dynamicIntents: DynamicIntentDefinitionReadModel[];
  } {
    const dataPortGroups = (row.dataPortGroups ?? []).map(
      (g): DataPortGroupReadModel => ({
        systemId: g.systemId,
        portIoType: g.portIoType,
        maxAllowedPortCount: g.maxAllowedPortCount,
        ports: (g.ports ?? []).map(
          (p): DataPortDefinitionReadModel => ({
            systemId: p.systemId,
            dataPortId: p.dataPortId,
            name: p.name ?? '',
          }),
        ),
      }),
    );

    const staticControlPorts = (row.staticPorts ?? []).map(
      (p): ControlPortDefinitionReadModel => ({
        systemId: p.systemId,
        portId: p.portId,
        portName: p.portName ?? '',
        staticIntents: (p.staticIntents ?? []).map(
          (i): StaticIntentDefinitionReadModel => ({
            systemId: i.systemId,
            intentId: i.intentId,
            name: i.name ?? '',
          }),
        ),
      }),
    );

    const dynamicIntents = (row.dynamicIntents ?? []).map(
      (d): DynamicIntentDefinitionReadModel => ({
        systemId: d.systemId,
        intentId: d.intentId,
        name: d.name ?? '',
        maxPort: d.maxPort,
      }),
    );

    return {dataPortGroups, staticControlPorts, dynamicIntents};
  }

  /**
   * Loads and overlays parameter definitions for a module definition aggregate.
   * Parameters are keyed by moduleDefSystemId — separate aggregate from the definition.
   * One getByAggregateId call, applyToCollection filters to param table.
   */
  async queryParameterDefinitions(
    fileSystemId: number,
    moduleDefSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterDefinitionReadModel[]> {
    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
      .createQueryBuilder('param')
      .where('param.spfModuleDefinitionSystemId = :moduleDefSystemId', {
        moduleDefSystemId,
      })
      .getMany()) as SpfModuleParameterDefinitionRow[];

    const filtered =
      paramSystemIds && paramSystemIds.length > 0
        ? rows.filter(r => paramSystemIds.includes(r.systemId))
        : rows;

    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    if (!session)
      return filtered.map(r => this.toParameterDefinitionReadModel(r));

    const actions = await this.editActionsSvc.getByAggregateId(
      session.sessionId,
      moduleDefSystemId,
    );
    const paramActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.SpfModuleParameterDefinition,
    );
    const overlaid =
      paramActions.length > 0 ? applyToCollection(rows, paramActions) : rows;

    return overlaid.map(r => this.toParameterDefinitionReadModel(r));
  }

  private toParameterDefinitionReadModel(
    row: SpfModuleParameterDefinitionRow,
  ): ParameterDefinitionReadModel {
    return {
      systemId: row.systemId,
      paramId: row.paramId,
      name: row.name,
      description: row.description,
      pidType: row.pidType ?? '',
    };
  }
}
