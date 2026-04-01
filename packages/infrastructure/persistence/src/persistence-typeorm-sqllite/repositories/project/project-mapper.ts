/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ArcDbFile, Project, type ProjectType} from '@arc/core';
import type {
  ArcDbFileRow,
  EntityRowForInsert,
  ProjectRow,
} from '../../entity-schema/index.js';

export function toProjectDomain(row: ProjectRow): Project {
  return new Project(
    row.systemId,
    row.name,
    row.description,
    row.type as ProjectType, // Cast string to enum
  );
}

export function toProjectRow(
  entity: Omit<Project, 'systemId'>,
): EntityRowForInsert<ProjectRow> {
  return {
    name: entity.name,
    description: entity.description,
    type: entity.type,
  };
}

export function toArcDbFileDomain(row: ArcDbFileRow): ArcDbFile {
  return new ArcDbFile({
    systemId: row.systemId,
    description: row.description,
    metadata: row.metadata,
    fileName: row.fileName,
    isTarget: row.isTarget,
    projectSystemId: row.projectSystemId,
  });
}

export function toArcDbFileRow(
  file: Omit<ArcDbFile, 'systemId' | 'projectSystemId'>,
  projectSystemId: number,
): EntityRowForInsert<ArcDbFileRow> {
  return {
    description: file.description,
    metadata: file.metadata,
    fileName: file.fileName,
    isTarget: file.isTarget,
    // Seeded to 0 on insert; EntityIdService.reserveBlock() (or auto-reserve
    // on first getNextId) will advance last_reserved_id before issuing the
    // first composite ID for this file.
    lastReservedId: 0,
    projectSystemId,
  };
}
