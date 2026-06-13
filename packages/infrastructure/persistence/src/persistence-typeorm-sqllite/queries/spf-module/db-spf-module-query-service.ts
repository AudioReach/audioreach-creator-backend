/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  SpfModuleQueryService,
  SpfModuleReadModel,
  DataPortQueryService,
  ControlPortQueryService,
  SpfTuningConfigService,
  SpfModuleDefinitionQueryService,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {DbDataPortQueryService} from '../node/port/db-data-port-query-service.js';
import {DbControlPortQueryService} from '../node/port/db-control-port-query-service.js';
import {DbSpfTuningConfigService} from './db-spf-tuning-config-service.js';
import type {NodeRow} from '../../entity-schema/usecase-data/node/node.schema.js';
import type {SpfModuleRow} from '../../entity-schema/usecase-data/module/spf-module.schema.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';

interface ModuleRootData {
  systemId: number;
  parentId?: number;
  instanceId: number;
  alias: string;
  definitionSystemId: number;
  subgraphSystemId: number;
  containerSystemId: number;
}

interface DefinitionCapabilityData {
  name: string;
  moduleId: number;
  subgraphId: number; // subgraphs.subgraph_id (business key)
  containerId: number; // containers.container_id (business key)
  maxInputPortsSupported: number;
  maxOutputPortsSupported: number;
  maxControlPortsSupported: number;
}

/**
 * Database implementation of SpfModuleQueryService.
 *
 * Assembles SpfModuleReadModel from:
 *   Step 1: Node JOIN SpfModule (module root data)
 *   Step 2: SpfModuleDefinition JOIN subgraphs JOIN containers
 *           JOIN data_port_groups JOIN static_control_port_definitions
 *           (definition capabilities + business keys)
 *   Step 3: DataPortQueryService.loadDataPorts (ports + link counts)
 *   Step 4: ControlPortQueryService.loadControlPorts (control ports + intents)
 *   Step 5: edit_actions overlay (three-tier pattern)
 *   Step 6: assemble in memory
 */
export class DbSpfModuleQueryService implements SpfModuleQueryService {
  readonly dataPortQueryService: DataPortQueryService;
  readonly controlPortQueryService: ControlPortQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;

  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly definitionQuerySvc: SpfModuleDefinitionQueryService,
  ) {
    this.dataPortQueryService = new DbDataPortQueryService(
      dataSource,
      editActionsSvc,
    );
    this.controlPortQueryService = new DbControlPortQueryService(
      dataSource,
      editActionsSvc,
    );
    this.spfTuningConfigService = new DbSpfTuningConfigService(
      dataSource,
      editActionsSvc,
    );
  }

  async getModuleDefinitionSystemId(
    spfModuleSystemId: number,
  ): Promise<number> {
    const module = (await this.dataSource
      .getRepository(ENTITY_NAMES.SpfModule)
      .createQueryBuilder('m')
      .select(['m.systemId', 'm.definitionSystemId'])
      .where('m.systemId = :systemId', {systemId: spfModuleSystemId})
      .getOne()) as SpfModuleRow | null;

    if (!module)
      throw new Error(`SpfModule not found: systemId=${spfModuleSystemId}`);
    return module.definitionSystemId;
  }

  async findOne(
    spfModuleSystemId: number,
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<SpfModuleReadModel | null> {
    const results = await this.findMany(
      [spfModuleSystemId],
      fileSystemId,
      applyOverlay,
    );
    return results[0] ?? null;
  }

  async findMany(
    systemIds: number[],
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<SpfModuleReadModel[]> {
    if (systemIds.length === 0) return [];
    const uniqueIds = [...new Set(systemIds)];

    // Step 1 — module roots
    const roots = await this.loadModuleRoots(uniqueIds);
    if (roots.length === 0) return [];

    // Step 2 — definition capabilities (deduped by definitionSystemId)
    // Now overlay-aware — delegates to SpfModuleDefinitionQueryService
    const defIds = [...new Set(roots.map(r => r.definitionSystemId))];
    const capabilityMap = await this.loadDefinitionCapabilities(
      defIds,
      roots,
      fileSystemId,
      applyOverlay,
    );

    // Steps 3+4 — ports per module (parallel per module)
    // Each service call is scoped to one nodeSystemId
    const portResults = await Promise.all(
      uniqueIds.map(async nodeId => ({
        nodeId,
        dataPorts: await this.dataPortQueryService.getDataPorts(
          nodeId,
          fileSystemId,
          applyOverlay,
        ),
        controlPorts: await this.controlPortQueryService.getControlPorts(
          nodeId,
          fileSystemId,
          applyOverlay,
        ),
      })),
    );
    const dataPortMap = new Map(portResults.map(r => [r.nodeId, r.dataPorts]));
    const controlPortMap = new Map(
      portResults.map(r => [r.nodeId, r.controlPorts]),
    );

    // Step 5 — module-level draft overlay (three-tier)
    const draftMap = await this.loadModuleDraftMap(
      uniqueIds,
      fileSystemId,
      applyOverlay,
    );

    // Step 6 — assemble
    const assembled: (SpfModuleReadModel | null)[] = roots.map(root => {
      const moduleDraft = draftMap.get(root.systemId);
      if (moduleDraft?.operation === 'DELETE') return null;

      const capability = capabilityMap.get(root.systemId);
      if (!capability) return null;

      const delta =
        moduleDraft?.operation === 'UPDATE'
          ? (JSON.parse(moduleDraft.payload as string) as Partial<SpfModuleRow>)
          : {};

      const result: SpfModuleReadModel = {
        systemId: root.systemId,
        parentId: root.parentId,
        instanceId: root.instanceId,
        alias: delta.alias ?? root.alias,
        definitionSystemId: root.definitionSystemId,
        name: capability.name,
        moduleId: capability.moduleId,
        subgraphId: capability.subgraphId,
        containerId: capability.containerId,
        maxInputPortsSupported: capability.maxInputPortsSupported,
        maxOutputPortsSupported: capability.maxOutputPortsSupported,
        maxControlPortsSupported: capability.maxControlPortsSupported,
        dataPorts: dataPortMap.get(root.systemId) ?? [],
        controlPorts: controlPortMap.get(root.systemId) ?? [],
      };
      return result;
    });
    return assembled.filter((m): m is SpfModuleReadModel => m !== null);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadModuleRoots(
    nodeSystemIds: number[],
  ): Promise<ModuleRootData[]> {
    const rows = await this.dataSource
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('node')
      .innerJoinAndSelect('node.spfModule', 'spfModule')
      .where('node.systemId IN (:...ids)', {ids: nodeSystemIds})
      .andWhere('node.type = :type', {type: 'module'})
      .getMany();

    // SQL:
    // SELECT node.system_id, node.parent_id,
    //        spf.instance_id, spf.alias,
    //        spf.subgraph_system_id, spf.container_system_id, spf.definition_system_id
    // FROM nodes node
    // INNER JOIN spf_modules spf ON spf.system_id = node.system_id
    // WHERE node.system_id IN (?) AND node.type = 'module'

    return rows.map(node => {
      const n = node as NodeRow;
      return {
        systemId: n.systemId,
        parentId: n.parentId ?? undefined,
        instanceId: n.spfModule!.instanceId,
        alias: n.spfModule!.alias,
        definitionSystemId: n.spfModule!.definitionSystemId,
        subgraphSystemId: n.spfModule!.subgraphSystemId,
        containerSystemId: n.spfModule!.containerSystemId,
      };
    });
  }

  /**
   * Loads definition capabilities for a set of definition system IDs.
   * Delegates to SpfModuleDefinitionQueryService.getDefinition() with the
   * Identity + DataPortCapabilities + ControlPortCapabilities attributes —
   * three-tier overlay applied to all definition tables.
   * Returns a map keyed by nodeSystemId for O(1) assembly lookup.
   */
  private async loadDefinitionCapabilities(
    definitionIds: number[],
    roots: ModuleRootData[],
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<Map<number, DefinitionCapabilityData>> {
    const defCapMap = new Map<number, DefinitionCapabilityData>();

    // Fetch each unique definition with overlay-aware attribute selector
    await Promise.all(
      definitionIds.map(async defId => {
        const def = await this.definitionQuerySvc.getDefinition(
          defId,
          fileSystemId,
          {includeSummary: true, includeFullDetails: false},
          applyOverlay,
        );
        defCapMap.set(defId, {
          name: def.name,
          moduleId: def.moduleId,
          subgraphId: 0, // overridden per-root below
          containerId: 0, // overridden per-root below
          maxInputPortsSupported: def.maxInputPortsSupported ?? 0,
          maxOutputPortsSupported: def.maxOutputPortsSupported ?? 0,
          maxControlPortsSupported: def.maxControlPortsSupported ?? 0,
        });
      }),
    );

    // Resolve subgraph/container business keys per root from instance FK data
    // Load subgraph_id and container_id (business keys) by querying the
    // subgraphs and containers tables with the FK system IDs from each root
    const subgraphSystemIds = [...new Set(roots.map(r => r.subgraphSystemId))];
    const containerSystemIds = [
      ...new Set(roots.map(r => r.containerSystemId)),
    ];

    const [subgraphRows, containerRows] = (await Promise.all([
      this.dataSource.query(
        `SELECT system_id, subgraph_id FROM subgraphs WHERE system_id IN (${subgraphSystemIds.map(() => '?').join(',')})`,
        subgraphSystemIds,
      ),
      this.dataSource.query(
        `SELECT system_id, container_id FROM containers WHERE system_id IN (${containerSystemIds.map(() => '?').join(',')})`,
        containerSystemIds,
      ),
    ])) as [
      Array<{system_id: number; subgraph_id: number}>,
      Array<{system_id: number; container_id: number}>,
    ];

    const subgraphMap = new Map<number, number>(
      subgraphRows.map(r => [r.system_id, r.subgraph_id]),
    );
    const containerMap = new Map<number, number>(
      containerRows.map(r => [r.system_id, r.container_id]),
    );

    const resultMap = new Map<number, DefinitionCapabilityData>();
    for (const root of roots) {
      const cap = defCapMap.get(root.definitionSystemId);
      if (!cap) continue;

      resultMap.set(root.systemId, {
        ...cap,
        subgraphId:
          subgraphMap.get(root.subgraphSystemId) ?? root.subgraphSystemId,
        containerId:
          containerMap.get(root.containerSystemId) ?? root.containerSystemId,
      });
    }

    return resultMap;
  }

  private async loadModuleDraftMap(
    nodeSystemIds: number[],
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<Map<number, EditActionRow>> {
    if (!applyOverlay) return new Map();
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    if (!session) return new Map();

    const draftMap = new Map<number, EditActionRow>();
    for (const nodeId of nodeSystemIds) {
      const drafts = await this.editActionsSvc.getEditActionsByAggregateId(
        session.sessionId,
        nodeId,
      );
      const spfDraft = drafts.find(d => d.tableName === ENTITY_NAMES.SpfModule);
      if (spfDraft) draftMap.set(nodeId, spfDraft);
    }
    return draftMap;
  }
}
