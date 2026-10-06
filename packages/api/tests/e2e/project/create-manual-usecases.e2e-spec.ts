/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {afterAll, beforeAll, describe, expect, it} from '@jest/globals';
import type {INestApplication} from '@nestjs/common';
import {DATA_LINK_TYPE, PORT_IO_TYPE} from '@arc/core';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import request from 'supertest';
import {DataSourceProvider} from '../../../src/infrastructure-wrapper/database/providers/data-source-provider.js';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ManualRequest {
  readonly selectedUsecaseSystemIds: readonly string[];
  readonly activeSubgraphs: readonly {
    readonly systemId: string;
    readonly valueSystemIds: readonly (readonly string[])[];
  }[];
}

describe('POST /projects/:projectId/create-manual-usecases', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
  }, 120_000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  async function uploadProject(): Promise<string> {
    const response = await request(httpServer as Parameters<typeof request>[0])
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach(
        'workspaceFile',
        join(__dirname, '../fixtures/workspaceFileXml.awsp'),
      )
      .timeout(300_000)
      .expect(201);
    return response.body.data.projectId as string;
  }

  async function startSession(
    projectId: string,
    mode: 'DESIGNER' | 'DIFF_MERGE',
  ): Promise<void> {
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode})
      .expect(201);
  }

  async function manualMemberSystemIds(
    projectId: string,
  ): Promise<readonly string[]> {
    const usecasesResponse = await request(
      httpServer as Parameters<typeof request>[0],
    )
      .get(`/arc-api/v1/projects/${projectId}/usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const subgraphSystemIds = new Set<string>();
    for (const usecase of usecasesResponse.body.data as readonly {
      readonly systemId: string;
    }[]) {
      const componentsResponse = await request(
        httpServer as Parameters<typeof request>[0],
      )
        .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: [String(usecase.systemId)]})
        .expect(200);
      for (const module of componentsResponse.body.data.spfModules ?? [])
        subgraphSystemIds.add(String(module.subgraphSystemId));
    }
    return [...subgraphSystemIds];
  }

  function requestForMembers(
    memberSubgraphSystemIds: readonly string[],
  ): ManualRequest {
    return {
      selectedUsecaseSystemIds: [],
      activeSubgraphs: memberSubgraphSystemIds.map(systemId => ({
        systemId,
        valueSystemIds: [[]],
      })),
    };
  }

  async function seedManualCycle(): Promise<{
    readonly projectId: string;
    readonly subgraphSystemIds: readonly string[];
  }> {
    const ids = {
      project: 91_001,
      file: 91_002,
      firstSubgraph: 91_003,
      secondSubgraph: 91_004,
      firstNode: 91_005,
      secondNode: 91_006,
      firstOutputPort: 91_007,
      firstInputPort: 91_008,
      secondOutputPort: 91_009,
      secondInputPort: 91_010,
      firstLink: 91_011,
      secondLink: 91_012,
    } as const;
    const dataSource = await app
      .get<DataSourceProvider>(DataSourceProvider)
      .getDataSource();

    await dataSource.transaction(async manager => {
      await manager.insert('Project', {
        systemId: ids.project,
        name: 'manual-cycle-e2e-project',
        description: 'Test-only project containing a directed manual cycle.',
        type: 'OFFLINE',
      });
      await manager.insert('ArcDbFile', {
        systemId: ids.file,
        description: 'Test-only cycle topology file.',
        metadata: '{}',
        fileName: 'manual-cycle-e2e.acdb',
        isTarget: true,
        projectSystemId: ids.project,
      });
      await manager.insert('ProjectSession', {
        fileSystemId: ids.file,
        userId: null,
        sessionMode: 'DESIGNER',
        status: 'ACTIVE',
        endedAt: null,
      });
      await manager.insert('Subgraph', [
        {
          systemId: ids.firstSubgraph,
          naturalId: 1,
          name: 'manual-cycle-first-subgraph',
          isImported: false,
          fileSystemId: ids.file,
        },
        {
          systemId: ids.secondSubgraph,
          naturalId: 2,
          name: 'manual-cycle-second-subgraph',
          isImported: false,
          fileSystemId: ids.file,
        },
      ]);
      await manager.insert('Node', [
        {
          systemId: ids.firstNode,
          parentSystemId: null,
          type: 'module',
          fileSystemId: ids.file,
        },
        {
          systemId: ids.secondNode,
          parentSystemId: null,
          type: 'module',
          fileSystemId: ids.file,
        },
      ]);
      await manager.insert('DataPort', [
        {
          systemId: ids.firstOutputPort,
          naturalId: 1,
          name: 'first-output',
          portIoType: PORT_IO_TYPE.Output,
          isStatic: true,
          nodeSystemId: ids.firstNode,
        },
        {
          systemId: ids.firstInputPort,
          naturalId: 2,
          name: 'first-input',
          portIoType: PORT_IO_TYPE.Input,
          isStatic: true,
          nodeSystemId: ids.firstNode,
        },
        {
          systemId: ids.secondOutputPort,
          naturalId: 1,
          name: 'second-output',
          portIoType: PORT_IO_TYPE.Output,
          isStatic: true,
          nodeSystemId: ids.secondNode,
        },
        {
          systemId: ids.secondInputPort,
          naturalId: 2,
          name: 'second-input',
          portIoType: PORT_IO_TYPE.Input,
          isStatic: true,
          nodeSystemId: ids.secondNode,
        },
      ]);
      await manager.insert('DataLink', [
        {
          systemId: ids.firstLink,
          sourceNodeSystemId: ids.firstNode,
          destinationNodeSystemId: ids.secondNode,
          sourcePortSystemId: ids.firstOutputPort,
          destinationPortSystemId: ids.secondInputPort,
          linkType: DATA_LINK_TYPE.Normal,
          sourceSubgraphSystemId: ids.firstSubgraph,
          destSubgraphSystemId: ids.secondSubgraph,
          fileSystemId: ids.file,
        },
        {
          systemId: ids.secondLink,
          sourceNodeSystemId: ids.secondNode,
          destinationNodeSystemId: ids.firstNode,
          sourcePortSystemId: ids.secondOutputPort,
          destinationPortSystemId: ids.firstInputPort,
          linkType: DATA_LINK_TYPE.Normal,
          sourceSubgraphSystemId: ids.secondSubgraph,
          destSubgraphSystemId: ids.firstSubgraph,
          fileSystemId: ids.file,
        },
      ]);
    });

    return {
      projectId: String(ids.project),
      subgraphSystemIds: [
        String(ids.firstSubgraph),
        String(ids.secondSubgraph),
      ],
    };
  }

  it('rejects a nested SGKV matrix containing non-string values', async () => {
    const projectId = await uploadProject();
    await startSession(projectId, 'DESIGNER');

    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/create-manual-usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [{systemId: '1', valueSystemIds: [[1]]}],
      })
      .expect(400);
  }, 360_000);

  it('rejects a nested SGKV matrix containing objects', async () => {
    const projectId = await uploadProject();
    await startSession(projectId, 'DESIGNER');

    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/create-manual-usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [
          {systemId: '1', valueSystemIds: [[{not: 'a-system-id'}]]},
        ],
      })
      .expect(400);
  }, 360_000);

  it('allows an empty inner SGKV array and returns the rich response in a DESIGNER session', async () => {
    const projectId = await uploadProject();
    const memberSystemIds = await manualMemberSystemIds(projectId);
    expect(memberSystemIds.length).toBeGreaterThan(0);
    await startSession(projectId, 'DESIGNER');

    const response = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/create-manual-usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(requestForMembers([memberSystemIds[0]!]))
      .expect(200);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        changes: expect.any(Array),
        issues: expect.any(Array),
        groupId: expect.any(String),
      }),
    );
  }, 360_000);

  it('returns the same rich response in a DIFF_MERGE session', async () => {
    const projectId = await uploadProject();
    const memberSystemIds = await manualMemberSystemIds(projectId);
    expect(memberSystemIds.length).toBeGreaterThan(0);
    await startSession(projectId, 'DIFF_MERGE');

    const response = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/create-manual-usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(requestForMembers([memberSystemIds[0]!]))
      .expect(200);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        changes: expect.any(Array),
        issues: expect.any(Array),
        groupId: expect.any(String),
      }),
    );
  }, 360_000);

  it('returns 422 with the manual-cycle issue for a data-derived cycle', async () => {
    const {projectId, subgraphSystemIds} = await seedManualCycle();
    const dataSource = await app
      .get<DataSourceProvider>(DataSourceProvider)
      .getDataSource();
    const editActionCount = await dataSource
      .getRepository('EditAction')
      .count();

    const response = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/create-manual-usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(requestForMembers(subgraphSystemIds))
      .expect(422);

    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({code: 'ARC-ROUTING-MANUAL-CYCLE'}),
      ]),
    );
    expect(await dataSource.getRepository('EditAction').count()).toBe(
      editActionCount,
    );
  });

  it('returns 403 when no active session exists', async () => {
    const projectId = await uploadProject();

    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/create-manual-usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(requestForMembers(['1']))
      .expect(403);
  }, 360_000);
});
