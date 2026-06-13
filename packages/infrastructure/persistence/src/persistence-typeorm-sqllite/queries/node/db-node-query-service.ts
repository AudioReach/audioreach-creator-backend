/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  NodeQueryService,
  DataPortReadModel,
  ControlPortReadModel,
  IntentReadModel,
} from '@arc/core';
import {Result, ERROR_CODES, NodeType} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import type {DataPortRow} from '../../entity-schema/usecase-data/node/data-port-info.schema.js';
import type {
  ControlPortRow,
  IntentRow,
} from '../../entity-schema/usecase-data/node/control-port.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {NodeRow} from '../../entity-schema/usecase-data/node/node.schema.js';
import type {DataPortDefinitionRow} from '../../entity-schema/definitions/module/spf/data-port-definition.schema.js';
import type {StaticControlPortDefinitionRow} from '../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';

/**
 * Centralized database implementation of NodeQueryService.
 *
 * Provides getDataPorts and getControlPorts for any node type
 * (SpfModule, Subsystem, etc.) in a single service — replaces the
 * separate DbDataPortQueryService and DbControlPortQueryService.
 *
 * Both methods apply the three-tier edit session overlay independently.
 * totalLinksAtPort is overlay-aware for both data and control ports.
 */
export class DbNodeQueryService implements NodeQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  // ── Data ports ─────────────────────────────────────────────────────────────

  async getDataPorts(
    nodeSystemId: number,
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<Result<DataPortReadModel[]>> {
    try {
      // Step 1 — baseline port rows for this node
      const baseRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.DataPort)
        .createQueryBuilder('dp')
        .where('dp.nodeSystemId = :nodeSystemId', {nodeSystemId})
        .getMany()) as DataPortRow[];
      // SQL: SELECT * FROM data_ports WHERE node_system_id = ?

      // Step 2 — link counts (overlay-aware)
      const portIds = baseRows.map(r => r.systemId);
      const linkCounts = await this.countDataLinksPerPort(
        portIds,
        fileSystemId,
        applyOverlay,
      );

      // Step 3 — three-tier overlay on port rows
      const session = applyOverlay
        ? await this.editActionsSvc.findActiveSession(fileSystemId)
        : null;

      const portEditActionMap = new Map<number, EditActionRow>();
      if (session) {
        const actions = await this.editActionsSvc.getEditActionsByAggregateId(
          session.sessionId,
          nodeSystemId,
        );
        for (const action of actions.filter(
          a => a.tableName === ENTITY_NAMES.DataPort,
        )) {
          portEditActionMap.set(action.systemId, action);
        }
      }

      const portRows: DataPortRow[] =
        portEditActionMap.size > 0
          ? applyToCollection(baseRows, [...portEditActionMap.values()])
          : baseRows;

      // Step 4 — resolve authoritative names from definition tables (module nodes only).
      // For subsystem nodes definitionSystemId is null — portNameMap stays null and
      // the mapping falls back to the overlay-applied instance name (row.name ?? '').
      const definitionSystemId =
        await this.resolveDefinitionSystemId(nodeSystemId);
      let portNameMap: Map<number, string> | null = null;
      if (definitionSystemId !== null) {
        const defDraftMap = new Map<string, EditActionRow>();
        if (session) {
          const defActions =
            await this.editActionsSvc.getEditActionsByAggregateId(
              session.sessionId,
              definitionSystemId,
            );
          for (const a of defActions)
            defDraftMap.set(`${a.systemId}:${a.tableName}`, a);
        }
        portNameMap = await this.buildDataPortNameMap(
          definitionSystemId,
          defDraftMap,
        );
      }

      return Result.ok(
        portRows.map(row => ({
          systemId: row.systemId,
          portId: row.dataPortId,
          name: portNameMap?.get(row.dataPortId) ?? row.name ?? '',
          portIoType: row.portIoType,
          isStatic: row.isStatic,
          totalLinksAtPort: linkCounts.get(row.systemId) ?? 0,
        })),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load data ports for node ${nodeSystemId}`,
      });
    }
  }

  // ── Control ports ──────────────────────────────────────────────────────────

  async getControlPorts(
    nodeSystemId: number,
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<Result<ControlPortReadModel[]>> {
    try {
      // Step 1 — baseline control port rows with intents
      const baseRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.ControlPort)
        .createQueryBuilder('cp')
        .leftJoinAndSelect('cp.allocatedIntents', 'intent')
        .where('cp.nodeSystemId = :nodeSystemId', {nodeSystemId})
        .getMany()) as ControlPortRow[];
      // SQL:
      // SELECT cp.*, intent.*
      // FROM control_ports cp
      // LEFT JOIN intents intent ON intent.control_port_system_id = cp.system_id
      // WHERE cp.node_system_id = ?

      // Step 2 — link counts (overlay-aware)
      const portIds = baseRows.map(r => r.systemId);
      const linkCounts = await this.countControlLinksPerPort(
        portIds,
        fileSystemId,
        applyOverlay,
      );

      // Step 3 — three-tier overlay on port rows
      const session = applyOverlay
        ? await this.editActionsSvc.findActiveSession(fileSystemId)
        : null;

      const portEditActionMap = new Map<number, EditActionRow>();
      if (session) {
        const actions = await this.editActionsSvc.getEditActionsByAggregateId(
          session.sessionId,
          nodeSystemId,
        );
        for (const action of actions.filter(
          a => a.tableName === ENTITY_NAMES.ControlPort,
        )) {
          portEditActionMap.set(action.systemId, action);
        }
      }

      const portRows: ControlPortRow[] =
        portEditActionMap.size > 0
          ? applyToCollection(baseRows, [...portEditActionMap.values()])
          : baseRows;

      // Step 4 — resolve authoritative names from definition tables (module nodes only).
      // For subsystem nodes definitionSystemId is null — name maps stay null and
      // the mapping falls back to overlay-applied instance names and Intent_{intentId}.
      const definitionSystemId =
        await this.resolveDefinitionSystemId(nodeSystemId);
      let controlPortNameMap: Map<number, string> | null = null;
      let intentNameMap: Map<number, string> | null = null;
      if (definitionSystemId !== null) {
        const defDraftMap = new Map<string, EditActionRow>();
        if (session) {
          const defActions =
            await this.editActionsSvc.getEditActionsByAggregateId(
              session.sessionId,
              definitionSystemId,
            );
          for (const a of defActions)
            defDraftMap.set(`${a.systemId}:${a.tableName}`, a);
        }
        ({controlPortNameMap, intentNameMap} =
          await this.buildControlPortNameMaps(definitionSystemId, defDraftMap));
      }

      return Result.ok(
        portRows.map(row => ({
          systemId: row.systemId,
          portId: row.portId,
          name: controlPortNameMap?.get(row.portId) ?? row.name ?? '',
          isStatic: row.isStatic,
          allocatedIntents: (row.allocatedIntents ?? []).map(i =>
            this.mapToIntentReadModel(i, intentNameMap ?? undefined),
          ),
          totalLinksAtPort: linkCounts.get(row.systemId) ?? 0,
        })),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load control ports for node ${nodeSystemId}`,
      });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async countDataLinksPerPort(
    portSystemIds: number[],
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<Map<number, number>> {
    if (portSystemIds.length === 0) return new Map();

    // COUNT data_links where this port appears on either end
    const rows: Array<{portId: number; linkCount: string}> =
      await this.dataSource
        .getRepository(ENTITY_NAMES.DataPort)
        .createQueryBuilder('p')
        .select('p.systemId', 'portId')
        .addSelect('COUNT(dl.systemId)', 'linkCount')
        .leftJoin(
          ENTITY_NAMES.DataLink,
          'dl',
          'dl.sourcePortSystemId = p.systemId OR dl.destinationPortSystemId = p.systemId',
        )
        .where('p.systemId IN (:...ids)', {ids: portSystemIds})
        .groupBy('p.systemId')
        .getRawMany();

    const countMap = new Map<number, number>(
      rows.map(r => [r.portId, Number(r.linkCount)]),
    );

    if (!applyOverlay) return countMap;

    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    if (!session) return countMap;

    const linkDrafts = await this.editActionsSvc.getEditActionsByTable(
      session.sessionId,
      ENTITY_NAMES.DataLink,
    );

    for (const draft of linkDrafts) {
      const p = JSON.parse(draft.payload as string) as {
        sourcePortSystemId?: number;
        destinationPortSystemId?: number;
      };
      for (const portId of [p.sourcePortSystemId, p.destinationPortSystemId]) {
        if (!portId || !portSystemIds.includes(portId)) continue;
        const current = countMap.get(portId) ?? 0;
        if (draft.operation === 'CREATE') countMap.set(portId, current + 1);
        if (draft.operation === 'DELETE')
          countMap.set(portId, Math.max(0, current - 1));
      }
    }

    return countMap;
  }

  private async countControlLinksPerPort(
    portSystemIds: number[],
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<Map<number, number>> {
    if (portSystemIds.length === 0) return new Map();

    // COUNT control_links where this port appears on either peer end
    const rows: Array<{portId: number; linkCount: string}> =
      await this.dataSource
        .getRepository(ENTITY_NAMES.ControlPort)
        .createQueryBuilder('cp')
        .select('cp.systemId', 'portId')
        .addSelect('COUNT(cl.systemId)', 'linkCount')
        .leftJoin(
          ENTITY_NAMES.ControlLink,
          'cl',
          'cl.nodeAPortSystemId = cp.systemId OR cl.nodeBPortSystemId = cp.systemId',
        )
        .where('cp.systemId IN (:...ids)', {ids: portSystemIds})
        .groupBy('cp.systemId')
        .getRawMany();

    const countMap = new Map<number, number>(
      rows.map(r => [r.portId, Number(r.linkCount)]),
    );

    if (!applyOverlay) return countMap;

    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    if (!session) return countMap;

    const linkDrafts = await this.editActionsSvc.getEditActionsByTable(
      session.sessionId,
      ENTITY_NAMES.ControlLink,
    );

    for (const draft of linkDrafts) {
      const p = JSON.parse(draft.payload as string) as {
        nodeAPortSystemId?: number;
        nodeBPortSystemId?: number;
      };
      for (const portId of [p.nodeAPortSystemId, p.nodeBPortSystemId]) {
        if (!portId || !portSystemIds.includes(portId)) continue;
        const current = countMap.get(portId) ?? 0;
        if (draft.operation === 'CREATE') countMap.set(portId, current + 1);
        if (draft.operation === 'DELETE')
          countMap.set(portId, Math.max(0, current - 1));
      }
    }

    return countMap;
  }

  /**
   * Resolves the SpfModuleDefinition system ID for a module node.
   * Returns null when the node is a Subsystem (no definition).
   */
  private async resolveDefinitionSystemId(
    nodeSystemId: number,
  ): Promise<number | null> {
    const nodeRow = (await this.dataSource
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('node')
      .select(['node.systemId', 'node.type'])
      .leftJoinAndSelect('node.spfModule', 'spfModule')
      .where('node.systemId = :id', {id: nodeSystemId})
      .getOne()) as NodeRow | null;

    if (!nodeRow || nodeRow.type !== NodeType.Module) return null;
    const spfModule = nodeRow.spfModule;
    return spfModule?.definitionSystemId ?? null;
  }

  /**
   * Builds a map of dataPortId → name from definition tables with overlay applied.
   * Only called for module nodes — returns empty map for subsystems.
   */
  private async buildDataPortNameMap(
    definitionSystemId: number,
    draftMap: Map<string, EditActionRow>,
  ): Promise<Map<number, string>> {
    const portDefRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.DataPortDefinition)
      .createQueryBuilder('pd')
      .select(['pd.systemId', 'pd.dataPortId', 'pd.name'])
      .innerJoin(
        'pd.dataPortGroup',
        'pg',
        'pg.moduleDefinitionSystemId = :defId',
        {defId: definitionSystemId},
      )
      .getMany()) as DataPortDefinitionRow[];

    const portDefActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.DataPortDefinition,
    );
    const overlaid =
      portDefActions.length > 0
        ? applyToCollection(portDefRows, portDefActions)
        : portDefRows;

    return new Map(overlaid.map(r => [r.dataPortId, r.name ?? '']));
  }

  /**
   * Builds maps of portId → portName and intentId → name from definition tables with overlay applied.
   * Only called for module nodes — returns empty maps for subsystems.
   */
  private async buildControlPortNameMaps(
    definitionSystemId: number,
    draftMap: Map<string, EditActionRow>,
  ): Promise<{
    controlPortNameMap: Map<number, string>;
    intentNameMap: Map<number, string>;
  }> {
    const staticPortDefRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.StaticControlPortDefinition)
      .createQueryBuilder('scp')
      .leftJoinAndSelect('scp.staticIntents', 'si')
      .where('scp.moduleDefinitionSystemId = :defId', {
        defId: definitionSystemId,
      })
      .getMany()) as StaticControlPortDefinitionRow[];

    const staticPortActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.StaticControlPortDefinition,
    );
    const intentDefActions = [...draftMap.values()].filter(
      a => a.tableName === ENTITY_NAMES.StaticIntentDefinition,
    );

    const overlaidPorts =
      staticPortActions.length > 0
        ? applyToCollection(staticPortDefRows, staticPortActions)
        : staticPortDefRows;

    const controlPortNameMap = new Map(
      overlaidPorts.map(r => [r.portId, r.portName ?? '']),
    );
    const intentNameMap = new Map(
      overlaidPorts.flatMap(p => {
        const intents =
          intentDefActions.length > 0
            ? applyToCollection(p.staticIntents ?? [], intentDefActions)
            : (p.staticIntents ?? []);
        return (intents ?? []).map(
          i => [i.intentId, i.name ?? ''] as [number, string],
        );
      }),
    );

    return {controlPortNameMap, intentNameMap};
  }

  private mapToIntentReadModel(
    row: IntentRow,
    intentNameMap?: Map<number, string>,
  ): IntentReadModel {
    return {
      systemId: row.systemId,
      intentId: row.intentId,
      // Use definition name when available; fall back to generated name
      name: intentNameMap?.get(row.intentId) ?? `Intent_${row.intentId}`,
    };
  }
}
