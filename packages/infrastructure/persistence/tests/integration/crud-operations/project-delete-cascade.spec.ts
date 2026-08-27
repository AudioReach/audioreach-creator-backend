/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Repository} from 'typeorm';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  ProjectSessionSchema,
  ProjectSessionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  RestorePointSchema,
  RestorePointRow,
  RESTORE_TYPE,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/restore-point.schema.js';
import {
  ValidationPreferencesSchema,
  ValidationPreferencesRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/validation/validation-preferences.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {EntityRowForAutoInsert} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-base.js';

/**
 * Integration tests verifying that deleting a Project cascades to all
 * dependent tables via the foreign key constraints.
 *
 * This test seeds one row in each entity that references `file_system_id`
 * (directly or transitively), deletes the project, and asserts zero rows
 * remain for that file in every table.
 */
describe('Project Delete Cascade Integration Tests', () => {
  let projectRepo: Repository<ProjectRow>;
  let fileRepo: Repository<ArcDbFileRow>;
  let sessionRepo: Repository<ProjectSessionRow>;
  let restorePointRepo: Repository<RestorePointRow>;
  let validationPrefsRepo: Repository<ValidationPreferencesRow>;

  beforeAll(async () => {
    await setupIntegrationTest();
    projectRepo = getTestRepository<ProjectRow>(ProjectSchema);
    fileRepo = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    sessionRepo = getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    restorePointRepo = getTestRepository<RestorePointRow>(RestorePointSchema);
    validationPrefsRepo = getTestRepository<ValidationPreferencesRow>(
      ValidationPreferencesSchema,
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  it('should cascade-delete ArcDbFile when Project is deleted', async () => {
    const project = await projectRepo.save({
      name: 'Cascade Test',
      description: '',
      type: 'OFFLINE',
    } as EntityRowForAutoInsert<ProjectRow>);

    await fileRepo.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: '',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    } as EntityRowForAutoInsert<ArcDbFileRow>);

    await projectRepo.delete({systemId: project.systemId});

    const remaining = await fileRepo.find({
      where: {projectSystemId: project.systemId},
    });
    expect(remaining).toHaveLength(0);
  });

  it('should cascade-delete ProjectSession when Project is deleted', async () => {
    const project = await projectRepo.save({
      name: 'Cascade Session Test',
      description: '',
      type: 'OFFLINE',
    } as EntityRowForAutoInsert<ProjectRow>);

    const file = await fileRepo.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: '',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    } as EntityRowForAutoInsert<ArcDbFileRow>);

    await sessionRepo.save({
      fileSystemId: file.systemId,
      sessionMode: 'DESIGNER',
      status: 'ACTIVE',
      userId: null,
    } as unknown as ProjectSessionRow);

    await projectRepo.delete({systemId: project.systemId});

    const ds = getTestDataSource();
    const sessions = await ds.query(
      `SELECT * FROM project_sessions WHERE file_system_id = ?`,
      [file.systemId],
    );
    expect(sessions).toHaveLength(0);
  });

  it('should cascade-delete RestorePoint when Project is deleted', async () => {
    const project = await projectRepo.save({
      name: 'Cascade RestorePoint Test',
      description: '',
      type: 'OFFLINE',
    } as EntityRowForAutoInsert<ProjectRow>);

    const file = await fileRepo.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: '',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    } as EntityRowForAutoInsert<ArcDbFileRow>);

    await restorePointRepo.save({
      fileSystemId: file.systemId,
      sessionId: null,
      restoreType: RESTORE_TYPE.FullSnapshot,
      snapshotData: '{}',
      description: null,
    } as EntityRowForAutoInsert<RestorePointRow>);

    await projectRepo.delete({systemId: project.systemId});

    const remaining = await restorePointRepo.find({
      where: {fileSystemId: file.systemId},
    });
    expect(remaining).toHaveLength(0);
  });

  it('should cascade-delete ValidationPreferences when Project is deleted', async () => {
    const project = await projectRepo.save({
      name: 'Cascade ValidationPrefs Test',
      description: '',
      type: 'OFFLINE',
    } as EntityRowForAutoInsert<ProjectRow>);

    const file = await fileRepo.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: '',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    } as EntityRowForAutoInsert<ArcDbFileRow>);

    await validationPrefsRepo.save({
      fileSystemId: file.systemId,
      preferences: '{"overrides":{},"suppressions":{}}',
    } as unknown as ValidationPreferencesRow);

    await projectRepo.delete({systemId: project.systemId});

    const ds = getTestDataSource();
    const prefs = await ds.query(
      `SELECT * FROM validation_preferences WHERE file_system_id = ?`,
      [file.systemId],
    );
    expect(prefs).toHaveLength(0);
  });

  it('should cascade-delete Configuration, Subgraph, Container when Project is deleted', async () => {
    const project = await projectRepo.save({
      name: 'Cascade Config Test',
      description: '',
      type: 'OFFLINE',
    } as EntityRowForAutoInsert<ProjectRow>);

    const file = await fileRepo.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: '',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    } as EntityRowForAutoInsert<ArcDbFileRow>);

    const ds = getTestDataSource();

    await ds.query(
      `INSERT INTO configuration (file_system_id, port_strategy, default_processor_domain, rtc_config, alsa_lib_config) VALUES (?, 'INPUT_EVEN_OUTPUT_ODD', 0, '{}', '{}')`,
      [file.systemId],
    );

    await ds.query(
      `INSERT INTO subgraphs (name, subgraph_id, is_imported, file_system_id) VALUES ('SG1', 1, 0, ?)`,
      [file.systemId],
    );

    await ds.query(
      `INSERT INTO containers (container_id, file_system_id) VALUES (1, ?)`,
      [file.systemId],
    );

    await projectRepo.delete({systemId: project.systemId});

    const configs = await ds.query(
      `SELECT * FROM configuration WHERE file_system_id = ?`,
      [file.systemId],
    );
    const subgraphs = await ds.query(
      `SELECT * FROM subgraphs WHERE file_system_id = ?`,
      [file.systemId],
    );
    const containers = await ds.query(
      `SELECT * FROM containers WHERE file_system_id = ?`,
      [file.systemId],
    );

    expect(configs).toHaveLength(0);
    expect(subgraphs).toHaveLength(0);
    expect(containers).toHaveLength(0);
  });

  it('should cascade-delete definition tables when Project is deleted', async () => {
    const project = await projectRepo.save({
      name: 'Cascade Definitions Test',
      description: '',
      type: 'OFFLINE',
    } as EntityRowForAutoInsert<ProjectRow>);

    const file = await fileRepo.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: '',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    } as EntityRowForAutoInsert<ArcDbFileRow>);

    const ds = getTestDataSource();

    await ds.query(
      `INSERT INTO processor_definitions (processor_definition_id, name, file_system_id) VALUES (1, 'TestProcessor', ?)`,
      [file.systemId],
    );

    await ds.query(
      `INSERT INTO tag_definitions (tag_id, name, is_voice, file_system_id) VALUES (1, 'TestTag', 0, ?)`,
      [file.systemId],
    );

    await projectRepo.delete({systemId: project.systemId});

    const processors = await ds.query(
      `SELECT * FROM processor_definitions WHERE file_system_id = ?`,
      [file.systemId],
    );
    const tags = await ds.query(
      `SELECT * FROM tag_definitions WHERE file_system_id = ?`,
      [file.systemId],
    );

    expect(processors).toHaveLength(0);
    expect(tags).toHaveLength(0);
  });
});
