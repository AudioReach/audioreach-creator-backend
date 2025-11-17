import {ArcDbFile, Project, ProjectType} from '@arc/core';
import {ArcDbFileRow, ProjectRow} from '../../entity-schema/index.js';

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
): Omit<ProjectRow, 'systemId' | 'creationDate' | 'updateDate'> {
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
    tag: row.tag,
    isTarget: row.isTarget,
    projectSystemId: row.projectSystemId,
  });
}

export function toArcDbFileRow(
  file: Omit<ArcDbFile, 'systemId' | 'projectSystemId'>,
  projectSystemId: number,
): Omit<ArcDbFileRow, 'systemId' | 'creationDate' | 'updateDate'> {
  return {
    description: file.description,
    metadata: file.metadata,
    tag: file.tag,
    isTarget: file.isTarget,
    projectSystemId,
  };
}
