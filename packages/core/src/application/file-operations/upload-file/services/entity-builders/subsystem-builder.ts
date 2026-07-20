/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {Subsystem} from '../../../../../domain/entities/usecase-data/subsystem/subsystem.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import {SubsystemDataLink} from '../../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import {SubsystemControlLink} from '../../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import {DataPort} from '../../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../../domain/entities/usecase-data/node/entities/control-port.js';
import {SubsystemBoundaryPathService} from '../../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';
import type {PathOutput} from '../../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';
import type {UiSubsystem} from '../../../shared/awsp-serializers/v1/ui-metadata/index.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {WorkerPoolPort} from '../../../../ports/worker/worker-pool.port.js';
import type {WorkerTask} from '../../../../ports/worker/worker-types.js';
import {
  asNaturalId,
  asSystemId,
  type SystemId,
} from '../../../../../shared/types/branded-ids.js';
import {HANDLER_KEYS} from '../../../shared/constants/registry-keys.js';

// ─── Worker-serializable types ────────────────────────────────────────────────

export interface SubsystemPathComputeInput {
  links: Array<{systemId: number; nodeAId: number; nodeBId: number}>;
  nodeParentMapEntries: [number, number | null][];
}

export interface SubsystemPathComputeOutput {
  paths: Array<{
    linkSystemId: number;
    nodeSequence: number[];
    requiredPortType: [number, string][];
  } | null>;
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface SubsystemBuildResult {
  subsystems: Subsystem[];
  dataLinks: DataLink[];
  controlLinks: ControlLink[];
}

// ─── Internal types ───────────────────────────────────────────────────────────

type DataPortKey = `d:${number}:${number}`; // `d:${linkIdx}:${subsystemSystemId}`
type ControlPortKey = `c:${number}:${number}`; // `c:${linkIdx}:${subsystemSystemId}`

interface DataPortAssignment {
  systemId: number;
  portId: number;
  portIoType: string;
}

interface ControlPortAssignment {
  systemId: number;
  portId: number;
}

export class SubsystemBuilder {
  private readonly subgraphToSubsystemMap = new Map<SystemId, SystemId>();

  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {}

  getSubgraphToSubsystemMap(): ReadonlyMap<SystemId, SystemId> {
    return this.subgraphToSubsystemMap;
  }

  /**
   * Build Subsystem shells from UI metadata, compute boundary ports for any
   * links that cross subsystem boundaries, and attach SLS/CSLS segments.
   * Returns all three entity arrays so the caller can insert them in order.
   */
  async build(
    uiSubsystems: UiSubsystem[],
    fileSystemId: number,
    dataLinks: DataLink[],
    controlLinks: ControlLink[],
  ): Promise<SubsystemBuildResult> {
    if (!uiSubsystems || uiSubsystems.length === 0) {
      return {subsystems: [], dataLinks, controlLinks};
    }

    const subsystems = await this.buildSubsystemShells(
      uiSubsystems,
      fileSystemId,
    );
    const updatedSubsystems = await this.attachBoundaryPorts(
      subsystems,
      dataLinks,
      controlLinks,
      fileSystemId,
    );

    return {subsystems: updatedSubsystems, dataLinks, controlLinks};
  }

  /**
   * Static handler — called by worker threads via the parser registry.
   * Pure: no I/O, no side-effects, serializable input and output.
   */
  static computePaths(
    input: SubsystemPathComputeInput,
  ): SubsystemPathComputeOutput {
    const nodeParentMap = new Map<number, number | null>(
      input.nodeParentMapEntries,
    );
    const paths = input.links.map(link => {
      const result = SubsystemBoundaryPathService.compute({
        sourceNodeId: link.nodeAId,
        destNodeId: link.nodeBId,
        nodeParentMap,
      });
      if (result.nodeSequence.length <= 2) return null;
      return {
        linkSystemId: link.systemId,
        nodeSequence: result.nodeSequence,
        requiredPortType: [...result.requiredPortType.entries()] as [
          number,
          string,
        ][],
      };
    });
    return {paths};
  }

  // ─── Shell building ───────────────────────────────────────────────────────

  private async buildSubsystemShells(
    uiSubsystems: UiSubsystem[],
    fileSystemId: number,
  ): Promise<Subsystem[]> {
    const result: Subsystem[] = [];
    const childToParent = this.buildChildToParentMap(uiSubsystems);
    const sorted = this.topologicalSort(uiSubsystems, childToParent);

    for (const entry of sorted) {
      const nodeSystemId = await this.idGenerator.getNextId(fileSystemId);
      const parentId = this.resolveParentId(entry.id, childToParent);
      const subsystemSystemId = asSystemId(nodeSystemId);

      const subsystem = new Subsystem({
        systemId: nodeSystemId,
        fileSystemId,
        parentId,
        name: entry.name,
        subsystemId: entry.id,
        filteredKeySystemIds: this.resolveFilteredKeys(entry),
        dataPorts: [],
        controlPorts: [],
      });

      this.foreignKeyMapper.addSubsystemMapping(
        asNaturalId(entry.id),
        subsystemSystemId,
      );

      for (const child of entry.children) {
        if (child.type !== 'Subgraph') continue;
        const subgraphSystemId = this.foreignKeyMapper.getSubgraphSystemId(
          asNaturalId(child.id),
        );
        if (subgraphSystemId === undefined) {
          this.logger?.logWarn({
            msg: `Subgraph child ${child.id.toString(16)} of subsystem ${entry.name} not found in FK mapper — subgraph-to-subsystem mapping skipped`,
            action: 'subsystem_child_subgraph_not_found',
            component: 'SubsystemBuilder',
            tag: 'subsystem-building',
            timestamp: new Date(),
          });
        } else {
          this.subgraphToSubsystemMap.set(subgraphSystemId, subsystemSystemId);
        }
      }

      result.push(subsystem);
    }

    return result;
  }

  // ─── Boundary port attachment (Steps A–F) ────────────────────────────────

  private async attachBoundaryPorts(
    subsystems: Subsystem[],
    dataLinks: DataLink[],
    controlLinks: ControlLink[],
    fileSystemId: number,
  ): Promise<Subsystem[]> {
    const nodeParentMap = this.buildNodeParentMap(subsystems);

    // Step A: compute paths (parallel when pool available, sequential otherwise)
    const [dataLinkPaths, controlLinkPaths] = this.shouldUseParallel(
      dataLinks,
      controlLinks,
    )
      ? await this.computePathsParallel(dataLinks, controlLinks, nodeParentMap)
      : [
          this.computeDataLinkPathsSequential(dataLinks, nodeParentMap),
          this.computeControlLinkPathsSequential(controlLinks, nodeParentMap),
        ];

    const hasDataBoundaries = dataLinkPaths.some(p => p !== null);
    const hasControlBoundaries = controlLinkPaths.some(p => p !== null);

    if (!hasDataBoundaries && !hasControlBoundaries) return subsystems;

    // Step B: collect port slot requirements
    const dataPortReqs = this.collectDataPortRequirements(dataLinkPaths);
    const controlPortReqs =
      this.collectControlPortRequirements(controlLinkPaths);

    // Step C: assign systemIds (async, must stay on main thread)
    const dataPortAssignments = await this.assignDataPortIds(
      dataPortReqs,
      fileSystemId,
    );
    const controlPortAssignments = await this.assignControlPortIds(
      controlPortReqs,
      fileSystemId,
    );

    // Step D: build SLS segments and attach
    await this.attachDataLinkSegments(
      dataLinks,
      dataLinkPaths,
      dataPortAssignments,
      fileSystemId,
    );

    // Step E: build CSLS segments and attach
    await this.attachControlLinkSegments(
      controlLinks,
      controlLinkPaths,
      controlPortAssignments,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `SubsystemBuilder: attached SLS for ${dataLinkPaths.filter(p => p !== null).length} data links, CSLS for ${controlLinkPaths.filter(p => p !== null).length} control links`,
      action: 'subsystem_links_built',
      component: 'SubsystemBuilder',
      tag: 'subsystem-links',
      timestamp: new Date(),
    });

    // Step F: rebuild Subsystem entities with boundary ports populated
    return this.rebuildSubsystemsWithPorts(
      subsystems,
      dataPortAssignments,
      controlPortAssignments,
    );
  }

  private buildNodeParentMap(
    subsystems: Subsystem[],
  ): Map<number, number | null> {
    const nodeParentMap = new Map<number, number | null>();

    for (const s of subsystems) {
      nodeParentMap.set(s.systemId, s.parentId ?? null);
    }

    for (const [
      instanceNaturalId,
      subgraphSystemId,
    ] of this.foreignKeyMapper.getModuleInstanceSubgraphEntries()) {
      const moduleSystemId =
        this.foreignKeyMapper.getSpfModuleSystemId(instanceNaturalId);
      if (moduleSystemId === undefined) continue;
      const parentSubsystemSystemId =
        this.subgraphToSubsystemMap.get(subgraphSystemId) ?? null;
      nodeParentMap.set(moduleSystemId, parentSubsystemSystemId);
    }

    return nodeParentMap;
  }

  // ─── Step A: parallel ─────────────────────────────────────────────────────

  private shouldUseParallel(
    dataLinks: DataLink[],
    controlLinks: ControlLink[],
  ): boolean {
    return (
      this.workerPool !== undefined &&
      this.workerPool.isThreadingSupported() &&
      dataLinks.length + controlLinks.length > 1
    );
  }

  private async computePathsParallel(
    dataLinks: DataLink[],
    controlLinks: ControlLink[],
    nodeParentMap: Map<number, number | null>,
  ): Promise<[(PathOutput | null)[], (PathOutput | null)[]]> {
    const nodeParentMapEntries = [
      ...nodeParentMap.entries(),
    ] as SubsystemPathComputeInput['nodeParentMapEntries'];

    const serializedDataLinks = dataLinks.map(l => ({
      systemId: l.systemId,
      nodeAId: l.sourceNodeSystemId,
      nodeBId: l.destinationNodeSystemId,
    }));

    const serializedControlLinks = controlLinks.map(l => ({
      systemId: l.systemId,
      nodeAId: l.peerNodeASystemId,
      nodeBId: l.peerNodeBSystemId,
    }));

    // 4 tasks for data links, 1 for control links
    const dlChunkSize = Math.ceil(serializedDataLinks.length / 4);
    const dataLinkTasks: WorkerTask<SubsystemPathComputeInput>[] = [0, 1, 2, 3]
      .map(i =>
        serializedDataLinks.slice(i * dlChunkSize, (i + 1) * dlChunkSize),
      )
      .filter(chunk => chunk.length > 0)
      .map(chunk => ({
        handlerKey: HANDLER_KEYS.COMPUTE_SUBSYSTEM_LINK_PATHS,
        input: {links: chunk, nodeParentMapEntries},
      }));

    const controlLinkTask: WorkerTask<SubsystemPathComputeInput> = {
      handlerKey: HANDLER_KEYS.COMPUTE_SUBSYSTEM_LINK_PATHS,
      input: {links: serializedControlLinks, nodeParentMapEntries},
    };

    const allTasks = [...dataLinkTasks, controlLinkTask];

    // workerPool is guaranteed non-null here: computePathsParallel is only
    // called from shouldUseParallel() which guards on workerPool !== undefined.
    const results = await this.workerPool!.executeParallel<
      SubsystemPathComputeInput,
      unknown,
      SubsystemPathComputeOutput
    >(allTasks);

    // Reconstitute PathOutput from serialized worker output.
    // dataLinkTasks.length is used to split the results array so that adding
    // further tasks before/after the control chunk would require updating this
    // split — keep dataLinkTasks and controlLinkTask adjacent in allTasks.
    const [dataChunkResults, controlResult] = [
      results.slice(0, dataLinkTasks.length),
      results[dataLinkTasks.length],
    ];

    const dataLinkPaths = dataChunkResults.flatMap(r =>
      (r.data as SubsystemPathComputeOutput).paths.map(p =>
        this.deserializePathOutput(p),
      ),
    );

    const controlLinkPaths = (
      controlResult.data as SubsystemPathComputeOutput
    ).paths.map(p => this.deserializePathOutput(p));

    return [dataLinkPaths, controlLinkPaths];
  }

  private deserializePathOutput(
    raw: SubsystemPathComputeOutput['paths'][number],
  ): PathOutput | null {
    if (!raw) return null;
    return {
      nodeSequence: raw.nodeSequence,
      requiredPortType: new Map(
        raw.requiredPortType as [number, 'OUTPUT_INPUT' | 'INPUT_OUTPUT'][],
      ),
    };
  }

  // ─── Step A: sequential ───────────────────────────────────────────────────

  private computeDataLinkPathsSequential(
    dataLinks: DataLink[],
    nodeParentMap: Map<number, number | null>,
  ): (PathOutput | null)[] {
    return dataLinks.map(link => {
      const result = SubsystemBoundaryPathService.compute({
        sourceNodeId: link.sourceNodeSystemId,
        destNodeId: link.destinationNodeSystemId,
        nodeParentMap,
      });
      return result.nodeSequence.length > 2 ? result : null;
    });
  }

  private computeControlLinkPathsSequential(
    controlLinks: ControlLink[],
    nodeParentMap: Map<number, number | null>,
  ): (PathOutput | null)[] {
    return controlLinks.map(link => {
      const result = SubsystemBoundaryPathService.compute({
        sourceNodeId: link.peerNodeASystemId,
        destNodeId: link.peerNodeBSystemId,
        nodeParentMap,
      });
      return result.nodeSequence.length > 2 ? result : null;
    });
  }

  // ─── Step B ───────────────────────────────────────────────────────────────

  private collectDataPortRequirements(
    paths: (PathOutput | null)[],
  ): Map<DataPortKey, {portIoType: string}> {
    const reqs = new Map<DataPortKey, {portIoType: string}>();
    for (const [i, path] of paths.entries()) {
      if (!path) continue;
      const {nodeSequence, requiredPortType} = path;
      for (let j = 1; j < nodeSequence.length - 1; j++) {
        const subsystemId = nodeSequence[j];
        const key: DataPortKey = `d:${i}:${subsystemId}`;
        const ioType = requiredPortType.get(subsystemId) ?? 'OUTPUT_INPUT';
        reqs.set(key, {portIoType: ioType});
      }
    }
    return reqs;
  }

  private collectControlPortRequirements(
    paths: (PathOutput | null)[],
  ): Map<ControlPortKey, object> {
    const reqs = new Map<ControlPortKey, object>();
    for (const [i, path] of paths.entries()) {
      if (!path) continue;
      const {nodeSequence} = path;
      for (let j = 1; j < nodeSequence.length - 1; j++) {
        const subsystemId = nodeSequence[j];
        const key: ControlPortKey = `c:${i}:${subsystemId}`;
        reqs.set(key, {});
      }
    }
    return reqs;
  }

  // ─── Step C ───────────────────────────────────────────────────────────────

  private async assignDataPortIds(
    reqs: Map<DataPortKey, {portIoType: string}>,
    fileSystemId: number,
  ): Promise<Map<DataPortKey, DataPortAssignment>> {
    const assignments = new Map<DataPortKey, DataPortAssignment>();
    const portCounters = new Map<number, number>();

    for (const [key, req] of reqs) {
      const subsystemId = Number(key.split(':')[2]);
      const counter = (portCounters.get(subsystemId) ?? 0) + 1;
      portCounters.set(subsystemId, counter);
      const systemId = await this.idGenerator.getNextId(fileSystemId);
      assignments.set(key, {
        systemId,
        portId: counter,
        portIoType: req.portIoType,
      });
    }
    return assignments;
  }

  private async assignControlPortIds(
    reqs: Map<ControlPortKey, object>,
    fileSystemId: number,
  ): Promise<Map<ControlPortKey, ControlPortAssignment>> {
    const assignments = new Map<ControlPortKey, ControlPortAssignment>();
    const portCounters = new Map<number, number>();

    for (const key of reqs.keys()) {
      const subsystemId = Number(key.split(':')[2]);
      const counter = (portCounters.get(subsystemId) ?? 0) + 1;
      portCounters.set(subsystemId, counter);
      const systemId = await this.idGenerator.getNextId(fileSystemId);
      assignments.set(key, {systemId, portId: counter});
    }
    return assignments;
  }

  // ─── Step D ───────────────────────────────────────────────────────────────

  private async attachDataLinkSegments(
    dataLinks: DataLink[],
    paths: (PathOutput | null)[],
    assignments: Map<DataPortKey, DataPortAssignment>,
    fileSystemId: number,
  ): Promise<void> {
    for (const [i, path] of paths.entries()) {
      if (!path) continue;
      const dataLink = dataLinks[i];
      const {nodeSequence} = path;

      for (let j = 0; j < nodeSequence.length - 1; j++) {
        const srcNodeId = nodeSequence[j];
        const dstNodeId = nodeSequence[j + 1];

        const srcPortSystemId =
          j === 0
            ? dataLink.sourcePortSystemId
            : assignments.get(`d:${i}:${srcNodeId}`)!.systemId;

        const dstPortSystemId =
          j === nodeSequence.length - 2
            ? dataLink.destinationPortSystemId
            : assignments.get(`d:${i}:${dstNodeId}`)!.systemId;

        const segmentSystemId = await this.idGenerator.getNextId(fileSystemId);

        dataLink.addSubsystemDataLink(
          new SubsystemDataLink({
            systemId: segmentSystemId,
            sourceNodeSystemId: srcNodeId,
            destinationNodeSystemId: dstNodeId,
            sourcePortSystemId: srcPortSystemId,
            destinationPortSystemId: dstPortSystemId,
            dataLinkSystemId: dataLink.systemId,
            fileSystemId,
          }),
        );
      }
    }
  }

  // ─── Step E ───────────────────────────────────────────────────────────────

  private async attachControlLinkSegments(
    controlLinks: ControlLink[],
    paths: (PathOutput | null)[],
    assignments: Map<ControlPortKey, ControlPortAssignment>,
    fileSystemId: number,
  ): Promise<void> {
    for (const [i, path] of paths.entries()) {
      if (!path) continue;
      const controlLink = controlLinks[i];
      const {nodeSequence} = path;

      for (let j = 0; j < nodeSequence.length - 1; j++) {
        const nodeAId = nodeSequence[j];
        const nodeBId = nodeSequence[j + 1];

        const nodeAPortSystemId =
          j === 0
            ? controlLink.nodeAPortSystemId
            : assignments.get(`c:${i}:${nodeAId}`)!.systemId;

        const nodeBPortSystemId =
          j === nodeSequence.length - 2
            ? controlLink.nodeBPortSystemId
            : assignments.get(`c:${i}:${nodeBId}`)!.systemId;

        const segmentSystemId = await this.idGenerator.getNextId(fileSystemId);

        controlLink.subsystemControlLinks.push(
          new SubsystemControlLink(
            segmentSystemId,
            nodeAId,
            nodeBId,
            nodeAPortSystemId,
            nodeBPortSystemId,
            controlLink.systemId,
            fileSystemId,
            0,
          ),
        );
      }
    }
  }

  // ─── Step F ───────────────────────────────────────────────────────────────

  private rebuildSubsystemsWithPorts(
    subsystems: Subsystem[],
    dataPortAssignments: Map<DataPortKey, DataPortAssignment>,
    controlPortAssignments: Map<ControlPortKey, ControlPortAssignment>,
  ): Subsystem[] {
    const dataPortsBySubsystem = new Map<number, DataPort[]>();
    const controlPortsBySubsystem = new Map<number, ControlPort[]>();

    for (const [key, assignment] of dataPortAssignments) {
      const subsystemId = Number(key.split(':')[2]);
      if (!dataPortsBySubsystem.has(subsystemId)) {
        dataPortsBySubsystem.set(subsystemId, []);
      }
      dataPortsBySubsystem.get(subsystemId)!.push(
        new DataPort({
          systemId: assignment.systemId,
          dataPortId: assignment.portId,
          portIoType: assignment.portIoType as 'OUTPUT_INPUT' | 'INPUT_OUTPUT',
          isStatic: false,
        }),
      );
    }

    for (const [key, assignment] of controlPortAssignments) {
      const subsystemId = Number(key.split(':')[2]);
      if (!controlPortsBySubsystem.has(subsystemId)) {
        controlPortsBySubsystem.set(subsystemId, []);
      }
      controlPortsBySubsystem.get(subsystemId)!.push(
        new ControlPort({
          systemId: assignment.systemId,
          portId: assignment.portId,
          isStatic: false,
          nodeSystemId: subsystemId,
          intentSystemIds: [],
        }),
      );
    }

    return subsystems.map(s => {
      const dataPorts = dataPortsBySubsystem.get(s.systemId);
      const controlPorts = controlPortsBySubsystem.get(s.systemId);
      if (!dataPorts && !controlPorts) return s;
      return new Subsystem({
        systemId: s.systemId,
        fileSystemId: s.fileSystemId,
        parentId: s.parentId,
        name: s.name,
        subsystemId: s.subsystemId,
        filteredKeySystemIds: s.filteredKeySystemIds,
        dataPorts: dataPorts ?? [],
        controlPorts: controlPorts ?? [],
      });
    });
  }

  // ─── Shell building helpers ───────────────────────────────────────────────

  private buildChildToParentMap(
    subsystems: UiSubsystem[],
  ): Map<number, number> {
    const childToParent = new Map<number, number>();
    for (const s of subsystems) {
      for (const child of s.children) {
        if (child.type === 'Subsystem') {
          childToParent.set(child.id, s.id);
        }
      }
    }
    return childToParent;
  }

  private resolveParentId(
    entryId: number,
    childToParent: Map<number, number>,
  ): number | undefined {
    const parentNaturalId = childToParent.get(entryId);
    if (parentNaturalId === undefined) return undefined;
    const parentId = this.foreignKeyMapper.getSubsystemSystemId(
      asNaturalId(parentNaturalId),
    );
    if (parentId === undefined) {
      this.logger?.logWarn({
        msg: `Parent subsystem ${parentNaturalId.toString(16)} not found in FK mapper for child ${entryId.toString(16)}`,
        action: 'subsystem_parent_not_found',
        component: 'SubsystemBuilder',
        tag: 'subsystem-building',
        timestamp: new Date(),
      });
    }
    return parentId;
  }

  private resolveFilteredKeys(entry: UiSubsystem): number[] {
    const filteredKeySystemIds: number[] = [];
    if (!entry.filteredGraphKeys) return filteredKeySystemIds;
    const hexKeys = entry.filteredGraphKeys
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    for (const hex of hexKeys) {
      const keyNaturalId = Number.parseInt(hex, 16);
      if (Number.isNaN(keyNaturalId)) continue;
      const keySystemId = this.foreignKeyMapper.getKeySystemId(
        asNaturalId(keyNaturalId),
      );
      if (keySystemId === undefined) {
        this.logger?.logWarn({
          msg: `Key ${hex} not found in FK mapper for subsystem ${entry.name}`,
          action: 'subsystem_filtered_key_not_found',
          component: 'SubsystemBuilder',
          tag: 'subsystem-building',
          timestamp: new Date(),
        });
      } else {
        filteredKeySystemIds.push(keySystemId);
      }
    }
    return filteredKeySystemIds;
  }

  private topologicalSort(
    subsystems: UiSubsystem[],
    childToParent: Map<number, number>,
  ): UiSubsystem[] {
    const byId = new Map(subsystems.map(s => [s.id, s]));
    const inDegree = this.computeInDegrees(subsystems, childToParent);
    const queue = [...inDegree.entries()]
      .filter(([, deg]) => deg === 0)
      .map(([id]) => id);
    const sorted: UiSubsystem[] = [];

    while (queue.length > 0) {
      const id = queue.shift()!;
      const entry = byId.get(id);
      if (entry) {
        sorted.push(entry);
        this.decrementChildDegrees(entry, inDegree, queue);
      }
    }

    if (sorted.length < subsystems.length) {
      this.logger?.logWarn({
        msg: `Cycle detected in subsystem hierarchy — ${subsystems.length - sorted.length} subsystems skipped`,
        action: 'subsystem_cycle_detected',
        component: 'SubsystemBuilder',
        tag: 'subsystem-building',
        timestamp: new Date(),
      });
    }
    return sorted;
  }

  private computeInDegrees(
    subsystems: UiSubsystem[],
    childToParent: Map<number, number>,
  ): Map<number, number> {
    const inDegree = new Map<number, number>(subsystems.map(s => [s.id, 0]));
    for (const [childId] of childToParent) {
      inDegree.set(childId, (inDegree.get(childId) ?? 0) + 1);
    }
    return inDegree;
  }

  private decrementChildDegrees(
    entry: UiSubsystem,
    inDegree: Map<number, number>,
    queue: number[],
  ): void {
    for (const child of entry.children) {
      if (child.type !== 'Subsystem') continue;
      const deg = (inDegree.get(child.id) ?? 1) - 1;
      inDegree.set(child.id, deg);
      if (deg === 0) queue.push(child.id);
    }
  }
}
