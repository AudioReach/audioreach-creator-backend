/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  SpfModuleDefinitionQueryService,
  SpfModuleDefinitionReadModel,
  DataPortGroupReadModel,
  DataPortDefinitionReadModel,
  ControlPortDefinitionReadModel,
  StaticIntentDefinitionReadModel,
  DynamicIntentDefinitionReadModel,
  DefinitionSpec,
  ParameterDefinitionReadModel,
} from '@arc/core';
import {Result, ERROR_CODES} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import type {SpfModuleDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-definition.schema.js';
import type {DataPortGroupRow} from '../../entity-schema/definitions/module/spf/data-group-definition.schema.js';
import type {StaticControlPortDefinitionRow} from '../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import {DbParameterDefinitionQueryService} from '../definition/db-parameter-definition-query-service.js';
import type {SpfModuleRow} from '../../entity-schema/usecase-data/module/spf-module.schema.js';

/**
 * Database implementation of SpfModuleDefinitionQueryService.
 *
 * getDefinition() uses DefinitionIncludes to load only the requested chunks.
 * Each chunk applies the three-tier edit session overlay independently.
 * Definitions can be modified when a new module version is imported during a session.
 */
export class DbSpfModuleDefinitionQueryService implements SpfModuleDefinitionQueryService {
  private readonly paramDefSvc: DbParameterDefinitionQueryService;

  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {
    this.paramDefSvc = new DbParameterDefinitionQueryService(
      dataSource,
      editActionsSvc,
    );
  }

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

      if (!module)
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModule not found for systemId=${spfModuleSystemId} — cannot resolve definition system ID`,
        });
      return Result.ok(module.definitionSystemId);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to resolve definition system ID for module ${spfModuleSystemId}`,
      });
    }
  }

  async getDefinition(
    defSystemId: number,
    fileSystemId: number,
    includes: DefinitionSpec,
    applyOverlay = true,
  ): Promise<Result<SpfModuleDefinitionReadModel>> {
    try {
      // ── Step 1: build query — join only the requested chunk tables ────────────
      let qb = this.dataSource
        .getRepository(ENTITY_NAMES.SpfModuleDefinition)
        .createQueryBuilder('def')
        .where('def.systemId = :id', {id: defSystemId});

      if (includes.includeFullDetails) {
        qb = qb
          .leftJoinAndSelect('def.dataPortGroups', 'portGroup')
          .leftJoinAndSelect('portGroup.ports', 'portDef')
          .leftJoinAndSelect('def.staticPorts', 'staticPort')
          .leftJoinAndSelect('staticPort.staticIntents', 'staticIntent')
          .leftJoinAndSelect('def.dynamicIntents', 'dynamicIntent');
      } else if (includes.includeSummary) {
        qb = qb
          .leftJoinAndSelect('def.dataPortGroups', 'portGroup')
          .leftJoinAndSelect('def.staticPorts', 'staticPort');
      }

      const defRow = (await qb.getOne()) as SpfModuleDefinitionRow | null;
      if (!defRow) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModuleDefinition not found for systemId=${defSystemId}`,
        });
      }

      // ── Step 2: load all edit_actions for this definition aggregate ───────────
      const draftMap = await this.loadDefinitionDraftMap(
        defSystemId,
        fileSystemId,
        applyOverlay,
      );

      // ── Step 3: overlay on definition root row ────────────────────────────────
      const defAction = draftMap.get(
        `${defRow.systemId}:${ENTITY_NAMES.SpfModuleDefinition}`,
      );
      const defDelta =
        defAction?.operation === 'UPDATE'
          ? (JSON.parse(
              defAction.payload as string,
            ) as Partial<SpfModuleDefinitionRow>)
          : {};

      // ── Step 4: summary — port capacity counts ────────────────────────────────
      const {
        maxInputPortsSupported,
        maxOutputPortsSupported,
        maxControlPortsSupported,
      } = this.computeSummaryCounts(defRow, draftMap, includes);

      // ── Step 5: full details — ports, intents, parameters ────────────────────
      const {
        dataPortGroups,
        staticControlPorts,
        dynamicIntents,
        parameterDefinitions,
      } = includes.includeFullDetails
        ? await this.assembleFullDetails(
            defRow,
            draftMap,
            fileSystemId,
            defSystemId,
          )
        : {
            dataPortGroups: null,
            staticControlPorts: null,
            dynamicIntents: null,
            parameterDefinitions: null,
          };

      // ── Step 6: assemble ──────────────────────────────────────────────────────
      return Result.ok({
        systemId: defRow.systemId,
        name: defDelta.name ?? defRow.name ?? '',
        moduleId: defRow.moduleDefinitionId,
        maxInputPortsSupported,
        maxOutputPortsSupported,
        maxControlPortsSupported,
        dataPortGroups,
        staticControlPorts,
        dynamicIntents,
        parameterDefinitions,
      });
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error ? error.message : 'Failed to load definition',
      });
    }
  }

  private computeSummaryCounts(
    defRow: SpfModuleDefinitionRow,
    draftMap: Map<string, EditActionRow>,
    includes: DefinitionSpec,
  ): {
    maxInputPortsSupported: number | null;
    maxOutputPortsSupported: number | null;
    maxControlPortsSupported: number | null;
  } {
    if (!includes.includeSummary && !includes.includeFullDetails)
      return {
        maxInputPortsSupported: null,
        maxOutputPortsSupported: null,
        maxControlPortsSupported: null,
      };

    const portGroupActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.DataPortGroup,
    );
    const portGroups: DataPortGroupRow[] =
      portGroupActions.length > 0
        ? applyToCollection(defRow.dataPortGroups ?? [], portGroupActions)
        : (defRow.dataPortGroups ?? []);

    const staticPortActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.StaticControlPortDefinition,
    );
    const staticPorts: StaticControlPortDefinitionRow[] =
      staticPortActions.length > 0
        ? applyToCollection(defRow.staticPorts ?? [], staticPortActions)
        : (defRow.staticPorts ?? []);

    return {
      maxInputPortsSupported: portGroups
        .filter(g => g.portIoType === 'Input')
        .reduce((s, g) => s + g.maxAllowedPortCount, 0),
      maxOutputPortsSupported: portGroups
        .filter(g => g.portIoType === 'Output')
        .reduce((s, g) => s + g.maxAllowedPortCount, 0),
      maxControlPortsSupported: staticPorts.length,
    };
  }

  private async assembleFullDetails(
    defRow: SpfModuleDefinitionRow,
    draftMap: Map<string, EditActionRow>,
    fileSystemId: number,
    defSystemId: number,
  ): Promise<{
    dataPortGroups: DataPortGroupReadModel[];
    staticControlPorts: ControlPortDefinitionReadModel[];
    dynamicIntents: DynamicIntentDefinitionReadModel[];
    parameterDefinitions: ParameterDefinitionReadModel[];
  }> {
    const portGroupActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.DataPortGroup,
    );
    const portGroups: DataPortGroupRow[] =
      portGroupActions.length > 0
        ? applyToCollection(defRow.dataPortGroups ?? [], portGroupActions)
        : (defRow.dataPortGroups ?? []);

    const portDefActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.DataPortDefinition,
    );
    const dataPortGroups = portGroups.map((g): DataPortGroupReadModel => {
      const ports =
        portDefActions.length > 0
          ? applyToCollection(g.ports ?? [], portDefActions)
          : (g.ports ?? []);
      return {
        systemId: g.systemId,
        portIoType: g.portIoType,
        maxAllowedPortCount: g.maxAllowedPortCount,
        ports: ports.map(
          (p): DataPortDefinitionReadModel => ({
            systemId: p.systemId,
            dataPortId: p.dataPortId,
            name: p.name ?? '',
          }),
        ),
      };
    });

    const staticPortActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.StaticControlPortDefinition,
    );
    const staticPorts: StaticControlPortDefinitionRow[] =
      staticPortActions.length > 0
        ? applyToCollection(defRow.staticPorts ?? [], staticPortActions)
        : (defRow.staticPorts ?? []);

    const intentActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.StaticIntentDefinition,
    );
    const staticControlPorts = staticPorts.map(
      (p): ControlPortDefinitionReadModel => {
        const intents =
          intentActions.length > 0
            ? applyToCollection(p.staticIntents ?? [], intentActions)
            : (p.staticIntents ?? []);
        return {
          systemId: p.systemId,
          portId: p.portId,
          portName: p.portName ?? '',
          staticIntents: intents.map(
            (i): StaticIntentDefinitionReadModel => ({
              systemId: i.systemId,
              intentId: i.intentId,
              name: i.name ?? '',
            }),
          ),
        };
      },
    );

    const dynamicIntentActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.DynamicIntentDefinition,
    );
    const rawDynamic =
      dynamicIntentActions.length > 0
        ? applyToCollection(defRow.dynamicIntents ?? [], dynamicIntentActions)
        : (defRow.dynamicIntents ?? []);
    const dynamicIntents = rawDynamic.map(
      (d): DynamicIntentDefinitionReadModel => ({
        systemId: d.systemId,
        intentId: d.intentId,
        name: d.name ?? '',
        maxPort: d.maxPort,
      }),
    );

    const parameterDefinitions = await this.paramDefSvc.getParameterDefinitions(
      fileSystemId,
      defSystemId,
    );

    return {
      dataPortGroups,
      staticControlPorts,
      dynamicIntents,
      parameterDefinitions,
    };
  }

  private async loadDefinitionDraftMap(
    defSystemId: number,
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<Map<string, EditActionRow>> {
    const draftMap = new Map<string, EditActionRow>();
    if (!applyOverlay) return draftMap;

    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    if (!session) return draftMap;

    const actions = await this.editActionsSvc.getEditActionsByAggregateId(
      session.sessionId,
      defSystemId,
    );
    for (const a of actions) {
      draftMap.set(`${a.systemId}:${a.tableName}`, a);
    }
    return draftMap;
  }
}
