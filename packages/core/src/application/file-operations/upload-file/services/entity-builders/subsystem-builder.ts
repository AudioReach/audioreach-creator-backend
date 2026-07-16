/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {Subsystem} from '../../../../../domain/entities/usecase-data/subsystem/subsystem.js';
import type {UiSubsystem} from '../../../shared/awsp-serializers/v1/ui-metadata/index.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../shared/types/branded-ids.js';

export class SubsystemBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  async build(
    subsystems: UiSubsystem[],
    fileSystemId: number,
  ): Promise<Subsystem[]> {
    const result: Subsystem[] = [];

    if (!subsystems || subsystems.length === 0) return result;

    const childToParent = this.buildChildToParentMap(subsystems);
    const sorted = this.topologicalSort(subsystems, childToParent);

    for (const entry of sorted) {
      const nodeSystemId = await this.idGenerator.getNextId(fileSystemId);
      const parentId = this.resolveParentId(entry.id, childToParent);

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
        asSystemId(nodeSystemId),
      );

      result.push(subsystem);
    }

    return result;
  }

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
