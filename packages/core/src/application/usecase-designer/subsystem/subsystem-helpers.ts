/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  SubsystemKeyDefinition,
  SubsystemSummary,
} from '../../ports/persistence/repositories/subsystem/subsystem.repository.js';

export interface SubsystemPatchReadModel {
  readonly systemId: number;
  readonly naturalId: number;
  readonly name: string;
  readonly parentId?: number;
  readonly filteredKeys: SubsystemKeyDefinition[];
  readonly dataPorts: Array<{
    readonly systemId: number;
    readonly portId: number;
    readonly name: string | null;
    readonly portIoType: string;
    readonly isStatic: boolean;
    readonly totalLinksAtPort: number;
  }>;
  readonly controlPorts: Array<{
    readonly systemId: number;
    readonly portId: number;
    readonly name: string | null;
    readonly isStatic: boolean;
    readonly allocatedIntents: Array<{
      readonly systemId: number;
      readonly intentId: number;
      readonly name?: string;
    }>;
    readonly totalLinksAtPort: number;
  }>;
}

export function findSubsystem(
  subsystems: SubsystemSummary[],
  systemId: number,
): SubsystemSummary | null {
  return subsystems.find(subsystem => subsystem.systemId === systemId) ?? null;
}

export function isDescendant(
  candidateSystemId: number,
  ancestorSystemId: number,
  subsystems: SubsystemSummary[],
): boolean {
  let current = findSubsystem(subsystems, candidateSystemId);
  const visited = new Set<number>();

  while (current?.parentId !== undefined) {
    if (visited.has(current.systemId)) return false;
    visited.add(current.systemId);
    if (current.parentId === ancestorSystemId) return true;
    current = findSubsystem(subsystems, current.parentId);
  }
  return false;
}
