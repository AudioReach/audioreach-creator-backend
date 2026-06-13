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
} from '@arc/core';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {DbDataPortQueryService} from './db-data-port-query-service.js';
import {DbControlPortQueryService} from './db-control-port-query-service.js';
import {DbSpfTuningConfigService} from './db-spf-tuning-config-service.js';
import type {NodeRow} from '../../entity-schema/usecase-data/node/node.schema.js';
import type {SpfModuleRow} from '../../entity-schema/usecase-data/module/spf-module.schema.js';
import type {SpfModuleDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-definition.schema.js';
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
    if (!systemIds.length) return [];
    const uniqueIds = [...new Set(systemIds)];

    // Step 1 — module roots
    const roots = await this.loadModuleRoots(uniqueIds);
    if (!roots.length) return [];

    // Step 2 — definition capabilities (deduped by definitionSystemId)
    const defIds = [...new Set(roots.map(r => r.definitionSystemId))];
    const capabilityMap = await this.loadDefinitionCapabilities(defIds, roots);

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
        changeInfo: moduleDraft
          ? {
              changeType: moduleDraft.operation,
              changeId: moduleDraft.changeId,
              changeStatus: moduleDraft.changeStatus,
            }
          : {changeType: CHANGE_OPERATION.None},
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
   * Returns a map keyed by nodeSystemId (not definitionSystemId) so assembly is O(1).
   * Multiple modules sharing the same definition get the same capability data.
   */
  private async loadDefinitionCapabilities(
    definitionIds: number[],
    roots: ModuleRootData[],
  ): Promise<Map<number, DefinitionCapabilityData>> {
    const rows = await this.dataSource
      .getRepository(ENTITY_NAMES.SpfModuleDefinition)
      .createQueryBuilder('def')
      .leftJoinAndSelect('def.dataPortGroups', 'portGroup')
      .leftJoinAndSelect('def.staticPorts', 'staticPort')
      .leftJoinAndSelect('def.modules', 'mod')
      .leftJoinAndSelect('mod.subgraph', 'sg')
      .leftJoinAndSelect('mod.container', 'co')
      .where('def.systemId IN (:...ids)', {ids: definitionIds})
      .getMany();

    // SQL:
    // SELECT def.system_id, def.name, def.module_definition_id, def.metadata,
    //        portGroup.max_allowed_port_count, portGroup.port_io_type,
    //        staticPort.system_id,
    //        mod.system_id, sg.subgraph_id, co.container_id
    // FROM spf_module_definitions def
    // LEFT JOIN data_port_groups portGroup ON portGroup.module_definition_system_id = def.system_id
    // LEFT JOIN static_control_port_definitions staticPort ON staticPort.module_definition_system_id = def.system_id
    // LEFT JOIN spf_modules mod ON mod.definition_system_id = def.system_id
    // LEFT JOIN subgraphs sg ON sg.system_id = mod.subgraph_system_id
    // LEFT JOIN containers co ON co.system_id = mod.container_system_id
    // WHERE def.system_id IN (?)

    // Build defSystemId → capability map first
    const defCapMap = new Map<number, DefinitionCapabilityData>();
    for (const def of rows) {
      const d = def as SpfModuleDefinitionRow;
      const maxInput = (d.dataPortGroups ?? [])
        .filter(g => g.portIoType === 'Input')
        .reduce((s, g) => s + g.maxAllowedPortCount, 0);
      const maxOutput = (d.dataPortGroups ?? [])
        .filter(g => g.portIoType === 'Output')
        .reduce((s, g) => s + g.maxAllowedPortCount, 0);
      const maxControl = (d.staticPorts ?? []).length;

      // subgraphId and containerId are per-instance — pick from first module for this def
      // (each module instance has its own subgraph/container, resolved below per root)
      defCapMap.set(d.systemId, {
        name: d.name,
        moduleId: d.moduleDefinitionId,
        subgraphId: 0, // overridden per-root below
        containerId: 0, // overridden per-root below
        maxInputPortsSupported: maxInput,
        maxOutputPortsSupported: maxOutput,
        maxControlPortsSupported: maxControl,
      });
    }

    // Remap to nodeSystemId, resolving subgraph/container business keys per root
    const resultMap = new Map<number, DefinitionCapabilityData>();
    for (const root of roots) {
      const cap = defCapMap.get(root.definitionSystemId);
      if (!cap) continue;

      // Find the specific module's subgraph and container business keys
      const defRow = rows.find(
        r => (r as SpfModuleDefinitionRow).systemId === root.definitionSystemId,
      ) as SpfModuleDefinitionRow | undefined;
      const moduleRow = defRow?.modules?.find(
        m => m.systemId === root.systemId,
      );
      const subgraphId =
        moduleRow?.subgraph?.subgraphId ?? root.subgraphSystemId;
      const containerId =
        moduleRow?.container?.containerId ?? root.containerSystemId;

      resultMap.set(root.systemId, {...cap, subgraphId, containerId});
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
