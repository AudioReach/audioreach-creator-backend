import {
  PROJECT_TYPE,
  type ArcDbFile,
  type Project,
  type ProjectRepository,
  type ProjectType,
} from '@arc/core';
import {
  ArcDbFileRow,
  ArcDbFileSchema,
  EntityRowForInsert,
  ProjectRow,
  ProjectSchema,
} from '../../entity-schema/index.js';
import {DataSource} from 'typeorm';
import {
  toProjectDomain,
  toArcDbFileDomain,
  toArcDbFileRow,
  toProjectRow,
} from './project-mapper.js';

export class TypeOrmProjectRepository implements ProjectRepository {
  constructor(private dataSource: DataSource) {}

  async createOfflineProject(
    project: Omit<Project, 'systemId' | 'type'>,
    file: Omit<ArcDbFile, 'systemId' | 'projectSystemId'>,
  ): Promise<{project: Project; file: ArcDbFile}> {
    const projectRow: EntityRowForInsert<ProjectRow> = toProjectRow({
      ...project,
      type: PROJECT_TYPE.OFFLINE,
    } as Project);

    return this.dataSource.transaction(async manager => {
      const projectInsertResult = await manager.insert(
        ProjectSchema.options.name,
        projectRow,
      );
      const projectSystemId = projectInsertResult.identifiers[0]
        .systemId as number;
      // 2. Query back project to get complete row
      const savedProjectRow = await manager.findOneOrFail(
        ProjectSchema.options.name,
        {
          where: {systemId: projectSystemId},
        },
      );

      // 3. Insert file with FK to project
      const fileRow = toArcDbFileRow(file, projectSystemId);

      const fileInsertResult = await manager.insert(
        ArcDbFileSchema.options.name,
        fileRow,
      );
      const fileSystemId = fileInsertResult.identifiers[0].systemId as number;

      // 4. Query back file to get complete row
      const savedFileRow = await manager.findOneOrFail(
        ArcDbFileSchema.options.name,
        {
          where: {systemId: fileSystemId},
        },
      );

      // 5. Map to domain entities
      return {
        project: toProjectDomain(savedProjectRow as ProjectRow),
        file: toArcDbFileDomain(savedFileRow as ArcDbFileRow),
      };
    });
  }

  createConnectedProject(
    _project: Omit<Project, 'systemId' | 'type'>,
  ): Promise<Project> {
    throw new Error('Method not implemented.');
  }
  addFile(
    _projectSystemId: number,
    _file: Omit<ArcDbFile, 'systemId' | 'projectSystemId'>,
  ): Promise<ArcDbFile> {
    throw new Error('Method not implemented.');
  }
  findProjectById(_systemId: number): Promise<Project | null> {
    throw new Error('Method not implemented.');
  }
  findProjectByName(_name: string): Promise<Project | null> {
    throw new Error('Method not implemented.');
  }
  listAllProjects(): Promise<Project[]> {
    throw new Error('Method not implemented.');
  }
  listProjectsByType(_type: ProjectType): Promise<Project[]> {
    throw new Error('Method not implemented.');
  }
  updateProject(
    _systemId: number,
    _updates: Partial<Pick<Project, 'name' | 'description'>>,
  ): Promise<void> {
    throw new Error('Method not implemented.');
  }
  deleteProject(_systemId: number): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
