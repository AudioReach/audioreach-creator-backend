/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type SpfModuleQueryService,
  type SpfModuleReadModel,
  type SpfTuningConfigService,
  type CkvQueryService,
  type TkvQueryService,
  type KeyValueDefQueryService,
  type ISessionRepository,
  type Issue,
  PORT_IO_TYPE,
  Result,
  ERROR_CODES,
  IssueSeverity,
  RESULT_KIND,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {
  SpfModuleOverlayFetcher,
  type OverlaidSpfModule,
} from '../../fetchers/spf-module-overlay-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import {UseCaseCategoryFetcher} from '../../fetchers/usecase-category-fetcher.js';
import {UsecaseGkvValuesFetcher} from '../../fetchers/usecase-gkv-values-fetcher.js';
import {DbCkvCalibrationQueryService} from '../module-calibration/db-ckv-calibration-query-service.js';
import {DbTkvCalibrationQueryService} from '../module-calibration/db-tkv-calibration-query-service.js';
import type {SubgraphRow} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {ContainerRow} from '../../entity-schema/usecase-data/container/container.schema.js';
import {
  PortOverlayFetcher,
  type OverlaidDataPort,
  type OverlaidControlPort,
} from '../../fetchers/port-overlay-fetcher.js';
import {IntentFetcher} from '../../fetchers/intent-fetcher.js';
import {SpfModuleDefinitionFetcher} from '../../fetchers/definitions/spf-module-definitions/spf-module-definition-fetcher.js';
import {DataPortGroupFetcher} from '../../fetchers/definitions/spf-module-definitions/data-port-group-fetcher.js';
import {StaticControlPortDefFetcher} from '../../fetchers/definitions/spf-module-definitions/static-control-port-def-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';

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

/**
 * Capability data extracted from the SpfModuleDefinition aggregate for a
 * single definition. Built from three fetchers:
 *   - SpfModuleDefinitionFetcher   → name, moduleDefinitionId
 *   - DataPortGroupFetcher         → port name map + max port counts
 *   - StaticControlPortDefFetcher  → control port / intent name maps + max count
 */
interface DefinitionCapabilityData {
  name: string;
  moduleId: number;
  maxInputPortsSupported: number;
  maxOutputPortsSupported: number;
  maxControlPortsSupported: number;
  /** dataPortId → name resolved from DataPortGroupFetcher port definitions. */
  dataPortNames: Map<number, string>;
  /** portId → portName resolved from StaticControlPortDefFetcher. */
  controlPortNames: Map<number, string>;
  /** intentId → name resolved from StaticControlPortDefFetcher static intents. */
  intentNames: Map<number, string>;
}

/**
 * Database implementation of SpfModuleQueryService.
 *
 * Definition data is loaded directly from three definition fetchers (FR-4 —
 * raw fields needed that are not in the SpfModuleDefinitionReadModel at
 * Summary level). SpfModuleDefinitionQueryService is NOT used here.
 *
 * Port overlay is delegated to PortOverlayFetcher (FR-3). Link counts are
 * computed separately because fetchers return overlay data only — they do not
 * resolve cross-table counts.
 *
 * Assembly order:
 *   Step 1: SpfModuleOverlayFetcher + NodeOverlayFetcher — Node + SpfModule scalars with overlay
 *   Step 2: Per unique definition —
 *             SpfModuleDefinitionFetcher   (root; null = definition absent, FR-8 Rule 1)
 *             DataPortGroupFetcher         (port groups → data port names + max counts)
 *             StaticControlPortDefFetcher  (static ports → control port + intent names)
 *   Step 3: PortOverlayFetcher — 1-1 per node, data and control independently (FR-8 Rule 3)
 *   Step 4: Link counts across all ports (session-aware)
 *   Step 5: Assemble read models in memory
 */
export class DbSpfModuleQueryService implements SpfModuleQueryService {
  readonly spfTuningConfigService: SpfTuningConfigService;
  readonly ckvQueryService: CkvQueryService;
  readonly tkvQueryService: TkvQueryService;
  private readonly spfModuleFetcher: SpfModuleOverlayFetcher;
  private readonly nodeFetcher: NodeOverlayFetcher;
  private readonly usecaseFetcher: UsecaseOverlayFetcher;
  private readonly portFetcher: PortOverlayFetcher;
  private readonly defFetcher: SpfModuleDefinitionFetcher;
  private readonly portGroupFetcher: DataPortGroupFetcher;
  private readonly staticPortFetcher: StaticControlPortDefFetcher;
  private readonly linkFetcher: LinkOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsQuerySvc: EditActionsQueryService,
    tuningConfigSvc: SpfTuningConfigService,
    keyValueDefQuerySvc: KeyValueDefQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    this.spfTuningConfigService = tuningConfigSvc;
    this.ckvQueryService = new DbCkvCalibrationQueryService(
      dataSource,
      editActionsQuerySvc,
      keyValueDefQuerySvc,
    );
    this.tkvQueryService = new DbTkvCalibrationQueryService(
      dataSource,
      editActionsQuerySvc,
      keyValueDefQuerySvc,
    );
    this.spfModuleFetcher = new SpfModuleOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
    this.nodeFetcher = new NodeOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
    this.usecaseFetcher = new UsecaseOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
      new UseCaseCategoryFetcher(dataSource.manager, editActionsQuerySvc),
      new UsecaseGkvValuesFetcher(dataSource.manager, editActionsQuerySvc),
    );
    this.portFetcher = new PortOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
      new IntentFetcher(dataSource.manager, editActionsQuerySvc),
    );
    this.defFetcher = new SpfModuleDefinitionFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
    this.portGroupFetcher = new DataPortGroupFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
    this.staticPortFetcher = new StaticControlPortDefFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
    this.linkFetcher = new LinkOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
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
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const sessionId = session?.sessionId ?? null;

      // Step 1: UseCase → Subgraph IDs (with UseCaseSubgraph session overlay).
      const subgraphIds =
        await this.usecaseFetcher.getSubgraphSystemIdsForUsecases(
          usecaseSystemIds,
          sessionId,
        );
      if (subgraphIds.length === 0) return Result.ok([]);

      // Step 2: Subgraph → SpfModule (with SpfModule session overlay).
      const modules = await this.spfModuleFetcher.fetchMany(
        fileSystemId,
        sessionId,
        {subgraphSystemId: subgraphIds},
      );
      const nodeIds = modules.map(m => m.systemId);
      if (nodeIds.length === 0) return Result.ok([]);

      return this.getSpfModules(nodeIds, fileSystemId);
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
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const sessionId = session?.sessionId ?? null;

      const modules = await this.spfModuleFetcher.fetchMany(
        fileSystemId,
        sessionId,
        {subgraphSystemId: subgraphId},
      );
      const nodeIds = modules.map(m => m.systemId);
      if (nodeIds.length === 0) return Result.ok([]);
      return this.getSpfModules(nodeIds, fileSystemId);
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

      // Session is resolved once and passed to all fetchers and link helpers
      // to avoid redundant lookups within a single request.
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const sessionId = session?.sessionId ?? null;

      // Step 1 — module roots (FR-8 Rule 1: fatal if fails — nothing to assemble)
      const rootsResult = await this.loadModuleRoots(
        uniqueIds,
        fileSystemId,
        sessionId,
      );
      if (rootsResult.kind === RESULT_KIND.Fail)
        return Result.fail(...rootsResult.issues);
      const roots = rootsResult.data;

      const warnings: Issue[] = [];

      // Step 2 — definition capabilities via extracted helper (reduces complexity)
      const {defCapMap, warnings: defWarnings} =
        await this.loadDefinitionCapabilities(
          [...new Set(roots.map((r: ModuleRootData) => r.definitionSystemId))],
          fileSystemId,
          sessionId,
        );
      warnings.push(...defWarnings);

      // Step 3 — ports per module via extracted helper (reduces complexity)
      const {portsByNode, warnings: portWarnings} =
        await this.loadPortsForNodes(uniqueIds, fileSystemId, sessionId);
      warnings.push(...portWarnings);

      // Step 4 — link counts: computed after all ports are loaded so a single
      // bulk query covers all port IDs. Fetchers return overlay data only and
      // do not resolve cross-table counts, hence this separate step.
      const allDataPortIds = [...portsByNode.values()].flatMap(p =>
        p.dataPorts.map(d => d.systemId),
      );
      const allControlPortIds = [...portsByNode.values()].flatMap(p =>
        p.controlPorts.map(c => c.systemId),
      );
      const dataLinkCounts = await this.countDataLinksForPorts(
        allDataPortIds,
        fileSystemId,
        sessionId,
      );
      const controlLinkCounts = await this.countControlLinksForPorts(
        allControlPortIds,
        fileSystemId,
        sessionId,
      );

      // Step 5 — assemble read models in memory
      const assembled: (SpfModuleReadModel | null)[] = roots.map(
        (root: ModuleRootData) => {
          // Module excluded if its definition was missing or failed to load.
          const defCap = defCapMap.get(root.definitionSystemId);
          if (!defCap) return null;

          const ports = portsByNode.get(root.systemId) ?? {
            dataPorts: [],
            controlPorts: [],
          };

          return {
            systemId: root.systemId,
            parentId: root.parentId,
            instanceId: root.instanceId,
            alias: root.alias,
            definitionSystemId: root.definitionSystemId,
            name: defCap.name,
            moduleId: defCap.moduleId,
            subgraphId: root.subgraphId,
            containerId: root.containerId,
            maxInputPortsSupported: defCap.maxInputPortsSupported,
            maxOutputPortsSupported: defCap.maxOutputPortsSupported,
            maxControlPortsSupported: defCap.maxControlPortsSupported,
            dataPorts: ports.dataPorts.map(port => ({
              systemId: port.systemId,
              portId: port.dataPortId,
              // Definition name takes precedence; fall back to instance name stored on the row.
              name:
                defCap.dataPortNames.get(port.dataPortId) ?? port.name ?? '',
              portIoType: port.portIoType,
              isStatic: port.isStatic,
              totalLinksAtPort: dataLinkCounts.get(port.systemId) ?? 0,
            })),
            controlPorts: ports.controlPorts.map(port => ({
              systemId: port.systemId,
              portId: port.portId,
              name: defCap.controlPortNames.get(port.portId) ?? port.name ?? '',
              isStatic: port.isStatic,
              allocatedIntents: port.intents.map(i => ({
                systemId: i.systemId,
                intentId: i.intentId,
                // Definition name takes precedence; fall back to Intent_${intentId}.
                name:
                  defCap.intentNames.get(i.intentId) ?? `Intent_${i.intentId}`,
              })),
              totalLinksAtPort: controlLinkCounts.get(port.systemId) ?? 0,
            })),
          };
        },
      );

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

  /**
   * Loads definition capability data for a set of unique definition IDs.
   * Extracted from getSpfModules to reduce its cognitive complexity.
   * Each definition is fetched independently — root failure excludes that
   * definition's modules (FR-8 Rule 1 + Rule 3).
   */
  private async loadDefinitionCapabilities(
    defIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<{
    defCapMap: Map<number, DefinitionCapabilityData>;
    warnings: Issue[];
  }> {
    const defCapMap = new Map<number, DefinitionCapabilityData>();
    const warnings: Issue[] = [];

    for (const defId of defIds) {
      try {
        const defRoot = await this.defFetcher.fetchOne(
          defId,
          fileSystemId,
          sessionId,
        );

        if (defRoot === null) {
          warnings.push({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `Definition ${defId} not found — modules referencing it will be excluded`,
            severity: IssueSeverity.Warning,
          });
          continue;
        }

        const portGroups = await this.portGroupFetcher.fetchMany(
          defId,
          sessionId,
        );
        const staticPorts = await this.staticPortFetcher.fetchMany(
          defId,
          sessionId,
        );

        defCapMap.set(defId, {
          name: defRoot.name,
          moduleId: defRoot.moduleDefinitionId,
          maxInputPortsSupported: portGroups
            .filter(g => g.portIoType === PORT_IO_TYPE.Input)
            .reduce((sum, g) => sum + g.maxAllowedPortCount, 0),
          maxOutputPortsSupported: portGroups
            .filter(g => g.portIoType === PORT_IO_TYPE.Output)
            .reduce((sum, g) => sum + g.maxAllowedPortCount, 0),
          maxControlPortsSupported: staticPorts.length,
          dataPortNames: new Map(
            portGroups.flatMap(g =>
              g.portDefinitions.map(
                p => [p.dataPortId, p.name ?? ''] as [number, string],
              ),
            ),
          ),
          controlPortNames: new Map(
            staticPorts.map(p => [p.portId, p.portName] as [number, string]),
          ),
          intentNames: new Map(
            staticPorts.flatMap(p =>
              p.staticIntents.map(
                i => [i.intentId, i.name] as [number, string],
              ),
            ),
          ),
        });
      } catch (error) {
        warnings.push({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: `Definition capabilities unavailable for def ${defId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
          severity: IssueSeverity.Warning,
        });
      }
    }

    return {defCapMap, warnings};
  }

  /**
   * Loads ports for a set of node IDs, one node at a time with independent
   * error handling per port type (FR-8 Rule 3).
   * Extracted from getSpfModules to reduce its cognitive complexity.
   */
  private async loadPortsForNodes(
    nodeIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<{
    portsByNode: Map<
      number,
      {dataPorts: OverlaidDataPort[]; controlPorts: OverlaidControlPort[]}
    >;
    warnings: Issue[];
  }> {
    const portsByNode = new Map<
      number,
      {dataPorts: OverlaidDataPort[]; controlPorts: OverlaidControlPort[]}
    >();
    const warnings: Issue[] = [];

    for (const nodeId of nodeIds) {
      let dataPorts: OverlaidDataPort[] = [];
      let controlPorts: OverlaidControlPort[] = [];

      try {
        dataPorts = await this.portFetcher.fetchDataPorts(
          nodeId,
          fileSystemId,
          sessionId,
        );
      } catch (error) {
        warnings.push({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: `Data ports unavailable for node ${nodeId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
          severity: IssueSeverity.Warning,
        });
      }

      try {
        controlPorts = await this.portFetcher.fetchControlPortsWithIntents(
          nodeId,
          fileSystemId,
          sessionId,
        );
      } catch (error) {
        warnings.push({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: `Control ports unavailable for node ${nodeId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
          severity: IssueSeverity.Warning,
        });
      }

      portsByNode.set(nodeId, {dataPorts, controlPorts});
    }

    return {portsByNode, warnings};
  }

  private async loadModuleRoots(
    nodeSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<Result<ModuleRootData[]>> {
    try {
      const [spfRows, nodeRows] = await Promise.all([
        this.spfModuleFetcher.fetchMany(fileSystemId, sessionId, {
          systemId: nodeSystemIds,
        }),
        this.nodeFetcher.fetchMany(nodeSystemIds, fileSystemId, sessionId),
      ]);
      const nodeMap = new Map(nodeRows.map(n => [n.systemId, n]));
      const overlaidModules: OverlaidSpfModule[] = spfRows.map(sm => ({
        ...sm,
        parentId: nodeMap.get(sm.systemId)?.parentId ?? null,
      }));

      if (overlaidModules.length === 0) return Result.ok([]);

      // subgraphId and containerId are immutable business keys — no session
      // overlay applies, so a direct batch query is safe (FR-7).
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
   * Returns the number of data links connected to each port (FR-3: delegates
   * to LinkOverlayFetcher for overlay-aware link loading).
   * Counts are derived in memory from the fetcher result.
   */
  private async countDataLinksForPorts(
    portSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<Map<number, number>> {
    if (portSystemIds.length === 0) return new Map();
    const links = await this.linkFetcher.loadDataLinkRows(
      fileSystemId,
      sessionId,
      {
        $or: [
          {sourcePortSystemId: portSystemIds},
          {destinationPortSystemId: portSystemIds},
        ],
      },
    );
    const portSet = new Set(portSystemIds);
    const countMap = new Map<number, number>();
    for (const link of links) {
      if (portSet.has(link.sourcePortSystemId))
        countMap.set(
          link.sourcePortSystemId,
          (countMap.get(link.sourcePortSystemId) ?? 0) + 1,
        );
      if (portSet.has(link.destinationPortSystemId))
        countMap.set(
          link.destinationPortSystemId,
          (countMap.get(link.destinationPortSystemId) ?? 0) + 1,
        );
    }
    return countMap;
  }

  /**
   * Returns the number of control links connected to each port.
   * Same pattern as countDataLinksForPorts.
   */
  private async countControlLinksForPorts(
    portSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<Map<number, number>> {
    if (portSystemIds.length === 0) return new Map();
    const links = await this.linkFetcher.loadControlLinkRows(
      fileSystemId,
      sessionId,
      {
        $or: [
          {nodeAPortSystemId: portSystemIds},
          {nodeBPortSystemId: portSystemIds},
        ],
      },
    );
    const portSet = new Set(portSystemIds);
    const countMap = new Map<number, number>();
    for (const link of links) {
      if (portSet.has(link.nodeAPortSystemId))
        countMap.set(
          link.nodeAPortSystemId,
          (countMap.get(link.nodeAPortSystemId) ?? 0) + 1,
        );
      if (portSet.has(link.nodeBPortSystemId))
        countMap.set(
          link.nodeBPortSystemId,
          (countMap.get(link.nodeBPortSystemId) ?? 0) + 1,
        );
    }
    return countMap;
  }
}
