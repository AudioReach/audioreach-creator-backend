/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type SpfModuleQueryService,
  type SpfModuleReadModel,
  type NodeQueryService,
  type SpfTuningConfigService,
  type SpfModuleDefinitionQueryService,
  type CkvQueryService,
  type KeyValueDefQueryService,
  type ISessionRepository,
  type Issue,
  Result,
  ERROR_CODES,
  CONFIGURATION_INCLUDES,
  IssueSeverity,
  RESULT_KIND,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {
  ModuleNodeOverlayFetcher,
  type OverlaidSpfModule,
} from '../../fetchers/module-node-overlay-fetcher.js';
import {DbNodeQueryService} from '../node/db-node-query-service.js';
import {DbCkvCalibrationQueryService} from '../module-calibration/db-ckv-calibration-query-service.js';
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
 *   Step 1: ModuleNodeOverlayFetcher (Node + SpfModule scalars with session overlay)
 *   Step 2: SpfModuleDefinition JOIN subgraphs JOIN containers
 *           JOIN data_port_groups JOIN static_control_port_definitions
 *           (definition capabilities + business keys)
 *   Step 3: DataPortQueryService.loadDataPorts (ports + link counts)
 *   Step 4: ControlPortQueryService.loadControlPorts (control ports + intents)
 *   Step 5: assemble in memory
 */
export class DbSpfModuleQueryService implements SpfModuleQueryService {
  readonly nodeQueryService: NodeQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;
  readonly spfModuleDefinitionQuerySvc: SpfModuleDefinitionQueryService;
  readonly ckvQueryService: CkvQueryService;
  private readonly moduleNodeFetcher: ModuleNodeOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
    definitionQuerySvc: SpfModuleDefinitionQueryService,
    tuningConfigSvc: SpfTuningConfigService,
    keyValueDefQuerySvc: KeyValueDefQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    this.nodeQueryService = new DbNodeQueryService(dataSource, editActionsSvc);
    this.spfTuningConfigService = tuningConfigSvc;
    this.spfModuleDefinitionQuerySvc = definitionQuerySvc;
    this.ckvQueryService = new DbCkvCalibrationQueryService(
      dataSource,
      editActionsSvc,
      keyValueDefQuerySvc,
    );
    this.moduleNodeFetcher = new ModuleNodeOverlayFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  async getSpfModule(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel>> {
    const result = await this.getSpfModules([spfModuleSystemId], fileSystemId);

    if (result.kind === RESULT_KIND.Fail) {
      return Result.fail(...result.issues);
    }

    const module = result.data[0];
    if (!module) {
      return Result.fail({
        code: ERROR_CODES.ENTITY_NOT_FOUND,
        message: `SpfModule not found for systemId=${spfModuleSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
    return Result.ok(module);
  }

  async findByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>> {
    if (usecaseSystemIds.length === 0) return Result.ok([]);

    try {
      const {nodeIds, subgraphIds} =
        await this.moduleNodeFetcher.resolveBaseNodeIdsForUsecases(
          usecaseSystemIds,
          fileSystemId,
        );

      // Step 2 — Overlay: check BOTH main table and edit_actions
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      if (session) {
        await this.moduleNodeFetcher.resolveNodeIdsForUsecases(
          usecaseSystemIds,
          subgraphIds,
          nodeIds,
          session.sessionId,
        );
      }

      if (nodeIds.size === 0) return Result.ok([]);

      // Step 3 — findMany handles definition caps, port loading, and module-level overlay
      return this.getSpfModules([...nodeIds], fileSystemId);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load modules for usecases',
        severity: IssueSeverity.Error,
      });
    }
  }

  async findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>> {
    try {
      const nodeIds =
        await this.moduleNodeFetcher.resolveBaseNodeIdsForSubgraph(
          subgraphId,
          fileSystemId,
        );

      // Step 2 — Overlay: session-created/deleted modules for this subgraph
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);

      if (session) {
        await this.moduleNodeFetcher.resolveNodeIdsForSubgraph(
          subgraphId,
          nodeIds,
          session.sessionId,
        );
      }

      if (nodeIds.size === 0) return Result.ok([]);
      return this.getSpfModules([...nodeIds], fileSystemId);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load modules for subgraph',
        severity: IssueSeverity.Error,
      });
    }
  }

  async getSpfModules(
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

      // Step 1 — module roots (overlay always applied via fetcher)
      const rootsResult = await this.loadModuleRoots(uniqueIds, fileSystemId);
      if (rootsResult.kind === RESULT_KIND.Fail)
        return Result.fail(...rootsResult.issues);
      const roots = rootsResult.data;

      // Step 2 — definition capabilities (deduped by definitionSystemId, overlay always applied)
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

      // Step 5 — assemble (overlay already applied in loadModuleRoots via fetcher)
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
        const capabilityResult = capabilityMap.get(root.systemId);
        if (!capabilityResult || capabilityResult.kind === RESULT_KIND.Fail)
          return null;
        const capability = capabilityResult.data;

        return {
          systemId: root.systemId,
          parentId: root.parentId,
          instanceId: root.instanceId,
          alias: root.alias,
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
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const overlaidModules: OverlaidSpfModule[] =
        await this.moduleNodeFetcher.applyToModuleNodes(
          nodeSystemIds,
          fileSystemId,
          session?.sessionId ?? null,
        );

      if (overlaidModules.length === 0) return Result.ok([]);

      // Batch-resolve subgraph/container business keys from overlaid FK ids
      const subgraphSystemIds = [
        ...new Set(overlaidModules.map(m => m.subgraphSystemId)),
      ];
      const containerSystemIds = [
        ...new Set(overlaidModules.map(m => m.containerSystemId)),
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
        overlaidModules.map(m => ({
          systemId: m.systemId,
          parentId: m.parentId ?? undefined,
          instanceId: m.instanceId,
          alias: m.alias ?? '',
          definitionSystemId: m.definitionSystemId,
          subgraphSystemId: m.subgraphSystemId,
          containerSystemId: m.containerSystemId,
          subgraphId: subgraphMap.get(m.subgraphSystemId) ?? m.subgraphSystemId,
          containerId:
            containerMap.get(m.containerSystemId) ?? m.containerSystemId,
        })),
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
}
