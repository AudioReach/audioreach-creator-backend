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
import {Result, ERROR_CODES, NodeType, IssueSeverity} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {OverlayMergeImpl} from '../edit-session/overlay-merge.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {NodeRow} from '../../entity-schema/usecase-data/node/node.schema.js';
import type {DataPortDefinitionRow} from '../../entity-schema/definitions/module/spf/data-port-definition.schema.js';
import type {StaticControlPortDefinitionRow} from '../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';
import {
  PortOverlayFetcher,
  type OverlaidIntent,
} from '../../fetchers/port-overlay-fetcher.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';

/**
 * Centralized database implementation of NodeQueryService.
 *
 * Provides getDataPorts and getControlPorts for any node type
 * (SpfModule, Subsystem, etc.) in a single service — replaces the
 * separate DbDataPortQueryService and DbControlPortQueryService.
 *
 * Both methods delegate overlay to PortOverlayFetcher (FR-3).
 * totalLinksAtPort is overlay-aware for both data and control ports.
 */
export class DbNodeQueryService implements NodeQueryService {
  private readonly portFetcher: PortOverlayFetcher;
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {
    this.portFetcher = new PortOverlayFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  // ── Data ports ─────────────────────────────────────────────────────────────

  async getDataPorts(
    nodeSystemId: number,
    fileSystemId: number,
  ): Promise<Result<DataPortReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Step 1 — overlay via PortOverlayFetcher (FR-3)
      const overlaidPorts = await this.portFetcher.fetchDataPorts(
        nodeSystemId,
        fileSystemId,
        sessionId,
      );

      const portIds = overlaidPorts.map(p => p.systemId);
      const linkCounts = await this.countDataLinksPerPort(
        portIds,
        fileSystemId,
      );

      // Step 2 — resolve authoritative names from definition tables (module nodes only).
      // For subsystem nodes getDefinitionSystemIdForModule returns null — portNameMap stays null and
      // the mapping falls back to the overlay-applied instance name (port.name ?? '').
      const definitionSystemId =
        await this.getDefinitionSystemIdForModule(nodeSystemId);
      let portNameMap: Map<number, string> | null = null;
      if (definitionSystemId !== null) {
        const defDraftMap = new Map<string, EditActionRow>();
        if (sessionId !== null) {
          const defActions = await this.editActionsSvc.getByAggregateId(
            sessionId,
            definitionSystemId,
          );
          for (const a of defActions)
            defDraftMap.set(`${a.targetSystemId}:${a.targetTable}`, a);
        }
        portNameMap = await this.buildDataPortNameMap(
          definitionSystemId,
          defDraftMap,
        );
      }

      return Result.ok(
        overlaidPorts.map(port => ({
          systemId: port.systemId,
          portId: port.dataPortId,
          name: portNameMap?.get(port.dataPortId) ?? port.name ?? '',
          portIoType: port.portIoType,
          isStatic: port.isStatic,
          totalLinksAtPort: linkCounts.get(port.systemId) ?? 0,
        })),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load data ports for node ${nodeSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  // ── Control ports ──────────────────────────────────────────────────────────

  async getControlPorts(
    nodeSystemId: number,
    fileSystemId: number,
  ): Promise<Result<ControlPortReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Step 1 — overlay via PortOverlayFetcher (FR-3)
      const overlaidPorts = await this.portFetcher.fetchControlPortsWithIntents(
        nodeSystemId,
        fileSystemId,
        sessionId,
      );

      const portIds = overlaidPorts.map(p => p.systemId);
      const linkCounts = await this.countControlLinksPerPort(
        portIds,
        fileSystemId,
      );

      // Step 2 — resolve authoritative names from definition tables (module nodes only).
      // For subsystem nodes getDefinitionSystemIdForModule returns null — name maps stay null and
      // the mapping falls back to overlay-applied instance names and Intent_{intentId}.
      const definitionSystemId =
        await this.getDefinitionSystemIdForModule(nodeSystemId);
      let controlPortNameMap: Map<number, string> | null = null;
      let intentNameMap: Map<number, string> | null = null;
      if (definitionSystemId !== null) {
        const defDraftMap = new Map<string, EditActionRow>();
        if (sessionId !== null) {
          const defActions = await this.editActionsSvc.getByAggregateId(
            sessionId,
            definitionSystemId,
          );
          for (const a of defActions)
            defDraftMap.set(`${a.targetSystemId}:${a.targetTable}`, a);
        }
        ({controlPortNameMap, intentNameMap} =
          await this.buildControlPortNameMaps(definitionSystemId, defDraftMap));
      }

      return Result.ok(
        overlaidPorts.map(port => ({
          systemId: port.systemId,
          portId: port.portId,
          name: controlPortNameMap?.get(port.portId) ?? port.name ?? '',
          isStatic: port.isStatic,
          allocatedIntents: port.intents.map(i =>
            this.mapToIntentReadModel(i, intentNameMap ?? undefined),
          ),
          totalLinksAtPort: linkCounts.get(port.systemId) ?? 0,
        })),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load control ports for node ${nodeSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async countDataLinksPerPort(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, number>> {
    if (portSystemIds.length === 0) return new Map();

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

    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );
    if (sessionId === null) return countMap;

    const linkDrafts = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.DataLink,
    );

    for (const draft of linkDrafts) {
      const p = JSON.parse(draft.newValue as string) as {
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
  ): Promise<Map<number, number>> {
    if (portSystemIds.length === 0) return new Map();

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

    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );
    if (sessionId === null) return countMap;

    const linkDrafts = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ControlLink,
    );

    for (const draft of linkDrafts) {
      const p = JSON.parse(draft.newValue as string) as {
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
   * Returns the definitionSystemId for the SpfModule at the given node.
   * Returns null when the node is a Subsystem (no definition).
   */
  private async getDefinitionSystemIdForModule(
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
      a => a.targetTable === ENTITY_NAMES.DataPortDefinition,
    );
    const overlaid =
      portDefActions.length > 0
        ? this.overlay
            .applyToCollection(portDefRows, portDefActions)
            .map(r => r.effective)
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
      a => a.targetTable === ENTITY_NAMES.StaticControlPortDefinition,
    );
    const intentDefActions = [...draftMap.values()].filter(
      a => a.targetTable === ENTITY_NAMES.StaticIntentDefinition,
    );

    const overlaidPorts =
      staticPortActions.length > 0
        ? this.overlay
            .applyToCollection(staticPortDefRows, staticPortActions)
            .map(r => r.effective)
        : staticPortDefRows;

    const controlPortNameMap = new Map(
      overlaidPorts.map(r => [r.portId, r.portName ?? '']),
    );
    const intentNameMap = new Map(
      overlaidPorts.flatMap(p => {
        const intents =
          intentDefActions.length > 0
            ? this.overlay
                .applyToCollection(p.staticIntents ?? [], intentDefActions)
                .map(r => r.effective)
            : (p.staticIntents ?? []);
        return (intents ?? []).map(
          i => [i.intentId, i.name ?? ''] as [number, string],
        );
      }),
    );

    return {controlPortNameMap, intentNameMap};
  }

  private mapToIntentReadModel(
    intent: OverlaidIntent,
    intentNameMap?: Map<number, string>,
  ): IntentReadModel {
    return {
      systemId: intent.systemId,
      intentId: intent.intentId,
      // Use definition name when available; fall back to generated name
      name: intentNameMap?.get(intent.intentId) ?? `Intent_${intent.intentId}`,
    };
  }
}
