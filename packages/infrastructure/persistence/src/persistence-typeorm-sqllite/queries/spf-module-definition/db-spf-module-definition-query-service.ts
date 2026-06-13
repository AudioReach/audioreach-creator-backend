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
  StaticControlPortDefinitionReadModel,
  StaticIntentDefinitionReadModel,
  DynamicIntentDefinitionReadModel,
  DefinitionIncludes,
  ParameterDefinitionReadModel,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import type {SpfModuleDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-definition.schema.js';
import type {DataPortGroupRow} from '../../entity-schema/definitions/module/spf/data-group-definition.schema.js';
import type {StaticControlPortDefinitionRow} from '../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import {DbParameterDefinitionQueryService} from '../definition/db-parameter-definition-query-service.js';

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

  async getDefinition(
    defSystemId: number,
    fileSystemId: number,
    includes: DefinitionIncludes,
    applyOverlay = true,
  ): Promise<SpfModuleDefinitionReadModel> {
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
      throw new Error(`SpfModuleDefinition not found: systemId=${defSystemId}`);
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
    let maxInputPortsSupported: number | null = null;
    let maxOutputPortsSupported: number | null = null;
    let maxControlPortsSupported: number | null = null;

    if (includes.includeSummary) {
      const portGroupActions = [...draftMap.values()].filter(
        a => a.tableName === ENTITY_NAMES.DataPortGroup,
      );
      const portGroups: DataPortGroupRow[] =
        portGroupActions.length > 0
          ? applyToCollection(defRow.dataPortGroups ?? [], portGroupActions)
          : (defRow.dataPortGroups ?? []);

      maxInputPortsSupported = portGroups
        .filter(g => g.portIoType === 'Input')
        .reduce((s, g) => s + g.maxAllowedPortCount, 0);
      maxOutputPortsSupported = portGroups
        .filter(g => g.portIoType === 'Output')
        .reduce((s, g) => s + g.maxAllowedPortCount, 0);

      const staticPortActions = [...draftMap.values()].filter(
        a => a.tableName === ENTITY_NAMES.StaticControlPortDefinition,
      );
      const staticPorts: StaticControlPortDefinitionRow[] =
        staticPortActions.length > 0
          ? applyToCollection(defRow.staticPorts ?? [], staticPortActions)
          : (defRow.staticPorts ?? []);

      maxControlPortsSupported = staticPorts.length;
    }

    // ── Step 5: full details — ports, intents, parameters ────────────────────
    let dataPortGroups: DataPortGroupReadModel[] | null = null;
    let staticControlPorts: StaticControlPortDefinitionReadModel[] | null =
      null;
    let dynamicIntents: DynamicIntentDefinitionReadModel[] | null = null;
    let parameterDefinitions: ParameterDefinitionReadModel[] | null = null;

    if (includes.includeFullDetails) {
      const portGroupActions = [...draftMap.values()].filter(
        a => a.tableName === ENTITY_NAMES.DataPortGroup,
      );
      const portGroups: DataPortGroupRow[] =
        portGroupActions.length > 0
          ? applyToCollection(defRow.dataPortGroups ?? [], portGroupActions)
          : (defRow.dataPortGroups ?? []);

      dataPortGroups = portGroups.map(
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

      const staticPortActions = [...draftMap.values()].filter(
        a => a.tableName === ENTITY_NAMES.StaticControlPortDefinition,
      );
      const staticPorts: StaticControlPortDefinitionRow[] =
        staticPortActions.length > 0
          ? applyToCollection(defRow.staticPorts ?? [], staticPortActions)
          : (defRow.staticPorts ?? []);

      staticControlPorts = staticPorts.map(
        (p): StaticControlPortDefinitionReadModel => ({
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

      dynamicIntents = (defRow.dynamicIntents ?? []).map(
        (d): DynamicIntentDefinitionReadModel => ({
          systemId: d.systemId,
          intentId: d.intentId,
          name: d.name ?? '',
          maxPort: d.maxPort,
        }),
      );

      parameterDefinitions = await this.paramDefSvc.getParameterDefinitions(
        fileSystemId,
        defSystemId,
      );
    }

    // ── Step 6: assemble ──────────────────────────────────────────────────────
    return {
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
