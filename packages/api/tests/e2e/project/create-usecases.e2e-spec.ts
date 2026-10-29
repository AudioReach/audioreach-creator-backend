/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import type {INestApplication} from '@nestjs/common';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  DATA_LINK_TYPE,
  SOURCE,
} from '@arc/core';
import {DataSourceProvider} from '../../../src/infrastructure-wrapper/database/providers/data-source-provider.js';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Create usecases endpoint E2E', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
    const uploaded = await request(httpServer as Parameters<typeof request>[0])
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach(
        'workspaceFile',
        join(__dirname, '../fixtures/workspaceFileXml.awsp'),
      )
      .timeout(300000)
      .expect(201);
    projectId = uploaded.body.data.projectId as string;
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'DESIGNER'})
      .expect(201);
  }, 350000);

  afterAll(async () => {
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/end-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .then(() => undefined)
      .catch(() => undefined);
    await teardownE2ETest(app);
  });

  async function seedIncompleteSubsystemDataLink(): Promise<string> {
    const ids = {
      project: 92_001,
      file: 92_002,
      module: 92_003,
      subsystem: 92_004,
      segment: 92_005,
    } as const;
    const dataSource = await app
      .get<DataSourceProvider>(DataSourceProvider)
      .getDataSource();

    await dataSource.transaction(async manager => {
      await manager.insert('Project', {
        systemId: ids.project,
        name: 'incomplete-subsystem-link-e2e-project',
        description: 'Test-only project with an incomplete subsystem link.',
        type: 'OFFLINE',
      });
      await manager.insert('ArcDbFile', {
        systemId: ids.file,
        description: 'Test-only incomplete subsystem-link topology file.',
        metadata: '{}',
        fileName: 'incomplete-subsystem-link-e2e.acdb',
        isTarget: true,
        projectSystemId: ids.project,
      });
      const session = (await manager.save('ProjectSession', {
        fileSystemId: ids.file,
        userId: null,
        sessionMode: 'DESIGNER',
        status: 'ACTIVE',
        endedAt: null,
      })) as {sessionId: number};
      await manager.insert('Node', [
        {
          systemId: ids.module,
          parentSystemId: null,
          type: 'module',
          fileSystemId: ids.file,
        },
        {
          systemId: ids.subsystem,
          parentSystemId: null,
          type: 'subsystem',
          fileSystemId: ids.file,
        },
      ]);
      await manager.insert('EditAction', {
        sessionId: session.sessionId,
        aggregateId: ids.segment,
        targetSystemId: ids.segment,
        targetTable: 'SubsystemDataLink',
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {
          sourceNodeSystemId: ids.module,
          destinationNodeSystemId: ids.subsystem,
          sourcePortSystemId: 92_006,
          destinationPortSystemId: 92_007,
          dataLinkSystemId: null,
          fileSystemId: ids.file,
          linkType: DATA_LINK_TYPE.Normal,
        },
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        linkedEntityGroupId: null,
      });
    });

    return String(ids.project);
  }

  it('activates automatic routing and returns the unified response contract', async () => {
    const response = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/create-usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        activeSubgraphs: [],
        includedDataLinkSystemIds: [],
        includedControlLinkSystemIds: [],
      })
      .expect(201);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        changes: expect.any(Array),
        issues: expect.any(Array),
        groupId: expect.any(String),
      }),
    );
  });

  it('returns 422 with an incomplete-chain issue before routing begins', async () => {
    const incompleteProjectId = await seedIncompleteSubsystemDataLink();

    const response = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${incompleteProjectId}/create-usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        activeSubgraphs: [],
        includedDataLinkSystemIds: [],
        includedControlLinkSystemIds: [],
      })
      .expect(422);

    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ARC-ROUTING-PHASE0-INCOMPLETE-DATA-CHAIN',
        }),
      ]),
    );
  });
});
