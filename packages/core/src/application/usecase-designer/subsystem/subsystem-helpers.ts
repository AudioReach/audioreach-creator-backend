/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SubsystemKey} from '../../ports/persistence/repositories/subsystem/subsystem.repository.js';
import type {SubsystemHierarchy} from '../../../domain/entities/usecase-data/subsystem/subsystem.js';

export interface SubsystemPatchReadModel {
  readonly systemId: number;
  readonly naturalId: number;
  readonly name: string;
  readonly parentSystemId: number | null;
  readonly filteredKeys: SubsystemKey[];
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
  subsystems: SubsystemHierarchy[],
  systemId: number,
): SubsystemHierarchy | null {
  return subsystems.find(subsystem => subsystem.systemId === systemId) ?? null;
}

export function isDescendant(
  candidateSystemId: number,
  ancestorSystemId: number,
  subsystems: SubsystemHierarchy[],
): boolean {
  let current = findSubsystem(subsystems, candidateSystemId);
  const visited = new Set<number>();

  while (current !== null && current.parentSystemId !== null) {
    if (visited.has(current.systemId)) return false;
    visited.add(current.systemId);
    if (current.parentSystemId === ancestorSystemId) return true;
    current = findSubsystem(subsystems, current.parentSystemId);
  }
  return false;
}

export function resolveSubsystemNameInput(
  name: string | null | undefined,
): string | null | undefined {
  if (name === undefined) return undefined;
  return name === null || name.trim() === '' ? null : name;
}

export function defaultSubsystemName(naturalId: number): string {
  return `SS_0x${naturalId.toString(16).padStart(8, '0').toUpperCase()}`;
}

export function findSubsystemNameConflict(
  subsystems: readonly SubsystemHierarchy[],
  name: string,
  excludedSystemId?: number,
): SubsystemHierarchy | undefined {
  const normalizedName = name.toLocaleLowerCase();
  return subsystems.find(
    subsystem =>
      subsystem.systemId !== excludedSystemId &&
      subsystem.name.toLocaleLowerCase() === normalizedName,
  );
}
