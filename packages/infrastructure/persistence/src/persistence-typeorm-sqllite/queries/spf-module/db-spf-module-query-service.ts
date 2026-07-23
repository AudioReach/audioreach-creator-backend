/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
/* eslint-disable sonarjs/deprecation -- TODO(LLD3): migrate to OverlayMergeImpl; these services use compat shims pending read-service rewrite */

import type {DataSource} from 'typeorm';
import {
  type SpfModuleQueryService,
  type SpfModuleReadModel,
  type NodeQueryService,
  type SpfTuningConfigService,
  type SpfModuleDefinitionQueryService,
  type CkvQueryService,
  type KeyValueDefQueryService,
  type Issue,
  Result,
  ResourceNotFoundException,
  ERROR_CODES,
  CONFIGURATION_INCLUDES,
  IssueSeverity,
  RESULT_KIND,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {DbNodeQueryService} from '../node/db-node-query-service.js';
import {DbCkvCalibrationQueryService} from '../module-calibration/db-ckv-calibration-query-service.js';
import type {NodeRow} from '../../entity-schema/usecase-data/node/node.schema.js';
import type {SpfModuleRow} from '../../entity-schema/usecase-data/module/spf-module.schema.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {SubgraphRow} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {ContainerRow} from '../../entity-schema/usecase-data/container/container.schema.js';

interface ModuleRootData {
  systemId: number;
  parentId?: number;
  instanceId: number;
  alias: string;
  definitionSystemId: number;
  subgraphSystemId: number;
  containerSystemId: number;
  subgraphId: number;
  containerId: number;
}

interface DefinitionCapabilityData {
  name: string;
  moduleId: number;
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
  readonly nodeQueryService: NodeQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;
  readonly spfModuleDefinitionQuerySvc: SpfModuleDefinitionQueryService;
  readonly ckvQueryService: CkvQueryService;

  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    definitionQuerySvc: SpfModuleDefinitionQueryService,
    tuningConfigSvc: SpfTuningConfigService,
    keyValueDefQuerySvc: KeyValueDefQueryService,
  ) {
    this.nodeQueryService = new DbNodeQueryService(dataSource, editActionsSvc);
    this.spfTuningConfigService = tuningConfigSvc;
    this.spfModuleDefinitionQuerySvc = definitionQuerySvc;
    this.ckvQueryService = new DbCkvCalibrationQueryService(
      dataSource,
      editActionsSvc,
      keyValueDefQuerySvc,
    );
  }

  async findOne(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleReadModel> {
    const result = await this.findMany([spfModuleSystemId], fileSystemId);

    if (result.kind === RESULT_KIND.Fail) {
      const message = result.issues[0]?.message ?? 'Failed to load SPF module';
      throw new ResourceNotFoundException(
        `SpfModule not found for systemId=${spfModuleSystemId}: ${message}`,
      );
    }

    const module = result.data[0];
    if (!module) {
      throw new ResourceNotFoundException(
        `SpfModule not found for systemId=${spfModuleSystemId}`,
      );
    }
    return module;
  }

  async findMany(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>> {
    try {
      if (systemIds.length === 0)
        return Result.fail({
          code: ERROR_CODES.INVALID_INPUT,
          message: 'systemIds must not be empty',
          severity: IssueSeverity.Error,
        });
      const uniqueIds = [...new Set(systemIds)];

      // Step 1 — module roots (overlay always applied)
      const rootsResult = await this.loadModuleRoots(uniqueIds, fileSystemId);
      if (rootsResult.kind === RESULT_KIND.Fail)
        return Result.fail(...rootsResult.issues);
      const roots = rootsResult.data;

      // Step 2 — definition capabilities (deduped by definitionSystemId, overlay always applied)
      // loadDefinitionCapabilities is keyed by defSystemId — each entry is a Result<DefinitionCapabilityData>
      // so individual definition failures are captured without failing the whole query.
      // Re-key to nodeSystemId here since one definition may serve multiple module instances.
      const defIds = [
        ...new Set(roots.map((r: ModuleRootData) => r.definitionSystemId)),
      ];
      const defCapResult = await this.loadDefinitionCapabilities(
        defIds,
        fileSystemId,
      );
      if (defCapResult.kind === RESULT_KIND.Fail)
        return Result.fail(...defCapResult.issues);
      const defCapByDefId = defCapResult.data;
      const capabilityMap = new Map<number, Result<DefinitionCapabilityData>>();
      for (const root of roots) {
        const capResult = defCapByDefId.get(root.definitionSystemId);
        if (!capResult) continue;
        capabilityMap.set(root.systemId, capResult);
      }

      // Steps 3+4 — ports per module (parallel per module)
      // Result failures on individual ports become warnings — the module is still
      // returned with empty ports rather than dropping it entirely.
      const warnings: Issue[] = [];
      const portResults = await Promise.all(
        uniqueIds.map(async nodeId => {
          const dataPortResult = await this.nodeQueryService.getDataPorts(
            nodeId,
            fileSystemId,
          );
          const controlPortResult = await this.nodeQueryService.getControlPorts(
            nodeId,
            fileSystemId,
          );
          if (dataPortResult.kind === RESULT_KIND.Fail)
            warnings.push({
              code: ERROR_CODES.INTERNAL_ERROR,
              message: `Data ports failed for node ${nodeId}: ${dataPortResult.issues?.[0]?.message}`,
              severity: IssueSeverity.Warning,
            });
          if (controlPortResult.kind === RESULT_KIND.Fail)
            warnings.push({
              code: ERROR_CODES.INTERNAL_ERROR,
              message: `Control ports failed for node ${nodeId}: ${controlPortResult.issues?.[0]?.message}`,
              severity: IssueSeverity.Warning,
            });
          return {
            nodeId,
            dataPorts:
              dataPortResult.kind === RESULT_KIND.Fail
                ? []
                : dataPortResult.data,
            controlPorts:
              controlPortResult.kind === RESULT_KIND.Fail
                ? []
                : controlPortResult.data,
          };
        }),
      );
      const dataPortMap = new Map(
        portResults.map(r => [r.nodeId, r.dataPorts]),
      );
      const controlPortMap = new Map(
        portResults.map(r => [r.nodeId, r.controlPorts]),
      );

      // Step 5 — module-level draft overlay (three-tier)
      const tableDataMap = await this.loadSpfModuleTableData(
        uniqueIds,
        fileSystemId,
      );

      // Step 6 — assemble
      // Collect definition capability errors first — a failed definition means the module
      // cannot be assembled and is treated as a hard error, not a warning.
      const capabilityErrors = roots
        .map(root => capabilityMap.get(root.systemId))
        .filter(
          (
            r,
          ): r is Extract<
            Result<DefinitionCapabilityData>,
            {kind: typeof RESULT_KIND.Fail}
          > => r?.kind === RESULT_KIND.Fail,
        )
        .flatMap(r => r.issues);

      if (capabilityErrors.length > 0) return Result.fail(...capabilityErrors);

      const assembled: (SpfModuleReadModel | null)[] = roots.map(root => {
        const moduleDraft = tableDataMap.get(root.systemId);
        if (moduleDraft?.operation === 'DELETE') return null;

        const capabilityResult = capabilityMap.get(root.systemId);
        if (!capabilityResult || capabilityResult.kind === RESULT_KIND.Fail)
          return null;
        const capability = capabilityResult.data;

        const delta =
          moduleDraft?.operation === 'UPDATE'
            ? (moduleDraft.newValue as Partial<SpfModuleRow>)
            : {};

        const result: SpfModuleReadModel = {
          systemId: root.systemId,
          parentId: root.parentId,
          instanceId: root.instanceId,
          alias: delta.alias ?? root.alias,
          definitionSystemId: root.definitionSystemId,
          name: capability.name,
          moduleId: capability.moduleId,
          subgraphId: root.subgraphId,
          containerId: root.containerId,
          maxInputPortsSupported: capability.maxInputPortsSupported,
          maxOutputPortsSupported: capability.maxOutputPortsSupported,
          maxControlPortsSupported: capability.maxControlPortsSupported,
          dataPorts: dataPortMap.get(root.systemId) ?? [],
          controlPorts: controlPortMap.get(root.systemId) ?? [],
        };
        return result;
      });
      return Result.ok(
        assembled.filter((m): m is SpfModuleReadModel => m !== null),
        warnings,
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to query SPF modules',
        severity: IssueSeverity.Error,
      });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadModuleRoots(
    nodeSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<ModuleRootData[]>> {
    try {
      const baseRows = await this.dataSource
        .getRepository(ENTITY_NAMES.Node)
        .createQueryBuilder('node')
        .innerJoinAndSelect('node.spfModule', 'spfModule')
        .where('node.systemId IN (:...ids)', {ids: nodeSystemIds})
        .andWhere('node.type = :type', {type: 'module'})
        .getMany();

      // Three-tier overlay — apply drafts on nodes + spf_modules rows
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);

      let rows = baseRows;
      if (session) {
        const actionArrays = await Promise.all(
          nodeSystemIds.map(id =>
            this.editActionsSvc.getByAggregateId(session.sessionId, id),
          ),
        );
        const allActions = actionArrays.flat();

        const nodeActions = allActions.filter(
          a => a.targetTable === ENTITY_NAMES.Node,
        );
        const spfActions = allActions.filter(
          a => a.targetTable === ENTITY_NAMES.SpfModule,
        );

        if (nodeActions.length > 0 || spfActions.length > 0) {
          rows = applyToCollection(baseRows as NodeRow[], [
            ...nodeActions,
            ...spfActions,
          ]) as typeof baseRows;
        }
      }

      // Resolve subgraph/container business keys for all roots in two batch queries
      const subgraphSystemIds = [
        ...new Set(rows.map(n => (n as NodeRow).spfModule!.subgraphSystemId)),
      ];
      const containerSystemIds = [
        ...new Set(rows.map(n => (n as NodeRow).spfModule!.containerSystemId)),
      ];

      const [subgraphRows, containerRows] = await Promise.all([
        this.dataSource
          .getRepository(ENTITY_NAMES.Subgraph)
          .createQueryBuilder('s')
          .select(['s.systemId', 's.subgraphId'])
          .where('s.systemId IN (:...ids)', {ids: subgraphSystemIds})
          .getMany(),
        this.dataSource
          .getRepository(ENTITY_NAMES.Container)
          .createQueryBuilder('c')
          .select(['c.systemId', 'c.containerId'])
          .where('c.systemId IN (:...ids)', {ids: containerSystemIds})
          .getMany(),
      ]);

      const subgraphMap = new Map<number, number>(
        (subgraphRows as SubgraphRow[]).map(r => [r.systemId, r.subgraphId]),
      );
      const containerMap = new Map<number, number>(
        (containerRows as ContainerRow[]).map(r => [r.systemId, r.containerId]),
      );

      return Result.ok(
        rows.map(node => {
          const n = node as NodeRow;
          return {
            systemId: n.systemId,
            parentId: n.parentId,
            instanceId: n.spfModule!.instanceId,
            alias: n.spfModule!.alias,
            definitionSystemId: n.spfModule!.definitionSystemId,
            subgraphSystemId: n.spfModule!.subgraphSystemId,
            containerSystemId: n.spfModule!.containerSystemId,
            subgraphId:
              subgraphMap.get(n.spfModule!.subgraphSystemId) ??
              n.spfModule!.subgraphSystemId,
            containerId:
              containerMap.get(n.spfModule!.containerSystemId) ??
              n.spfModule!.containerSystemId,
          };
        }),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load module roots',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Loads definition capabilities for a set of definition system IDs.
   * Delegates to SpfModuleDefinitionQueryService.getDefinition() with
   * includeSummary — three-tier overlay applied to all definition tables.
   *
   * Returns Map<defSystemId, Result<DefinitionCapabilityData>>:
   *   - Keyed by defSystemId — caller re-keys to nodeSystemId via roots.
   *   - Each entry carries its own Result so the caller can inspect per-definition
   *     success or failure and derive the overall outcome.
   */
  private async loadDefinitionCapabilities(
    definitionIds: number[],
    fileSystemId: number,
  ): Promise<Result<Map<number, Result<DefinitionCapabilityData>>>> {
    try {
      const entries = await Promise.all(
        definitionIds.map(async defId => {
          const defResult =
            await this.spfModuleDefinitionQuerySvc.getDefinition(
              defId,
              fileSystemId,
              CONFIGURATION_INCLUDES.Summary,
            );

          if (defResult.kind === RESULT_KIND.Fail) {
            return {
              defId,
              capResult: Result.fail<DefinitionCapabilityData>(
                ...defResult.issues,
              ),
            };
          }

          const def = defResult.data;
          return {
            defId,
            capResult: Result.ok<DefinitionCapabilityData>({
              name: def.name,
              moduleId: def.moduleId,
              maxInputPortsSupported: def.maxInputPortsSupported ?? 0,
              maxOutputPortsSupported: def.maxOutputPortsSupported ?? 0,
              maxControlPortsSupported: def.maxControlPortsSupported ?? 0,
            }),
          };
        }),
      );

      return Result.ok(
        new Map<number, Result<DefinitionCapabilityData>>(
          entries.map(e => [e.defId, e.capResult]),
        ),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load definition capabilities',
        severity: IssueSeverity.Error,
      });
    }
  }

  private async loadSpfModuleTableData(
    nodeSystemIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, EditActionRow>> {
    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    if (!session) return new Map();

    const draftMap = new Map<number, EditActionRow>();
    for (const nodeId of nodeSystemIds) {
      const drafts = await this.editActionsSvc.getByAggregateId(
        session.sessionId,
        nodeId,
      );
      const spfDraft = drafts.find(
        d => d.targetTable === ENTITY_NAMES.SpfModule,
      );
      if (spfDraft) draftMap.set(nodeId, spfDraft);
    }
    return draftMap;
  }
}
