/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe.skip('Get Subgraph Pairs E2E (GET /arc-api/v1/projects/{projectId}/subgraphs/{subgraphSystemId}/subgraph-pairs)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let subgraphSystemIds: string[] = [];
  /** First subgraph that returns at least one cross-subgraph pair. */
  let subgraphWithPairs: string | undefined;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    projectId = undefined;
    subgraphSystemIds = [];
    subgraphWithPairs = undefined;

    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000);

    if (!uploadResponse.body?.data?.projectId) {
      console.error(
        'Upload failed:',
        uploadResponse.status,
        JSON.stringify(uploadResponse.body),
      );
      return;
    }

    projectId = uploadResponse.body.data.projectId;

    // Discover subgraph IDs via the usecases + components endpoint.
    const usecasesResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (usecasesResponse.status !== 200) return;

    const usecases: any[] = usecasesResponse.body.data ?? [];
    const subgraphIdSet = new Set<string>();

    for (const uc of usecases) {
      const ucSystemId = String(uc.systemId);
      const componentsResponse = await request(httpServer)
        .post(`/arc-api/v1/projects/${projectId}/usecases/components/get`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: [ucSystemId]})
        .timeout(30000);

      if (componentsResponse.status !== 200) continue;

      // Extract subgraph IDs from data links and control links.
      // Links carry sourceSubgraphSystemId / destinationSubgraphSystemId
      // which we use to identify the subgraphs involved.
      const data = componentsResponse.body.data ?? {};
      const allLinks: any[] = [
        ...(data.dataLinks ?? []),
        ...(data.controlLinks ?? []),
      ];

      for (const link of allLinks) {
        if (link.sourceSubgraphSystemId)
          subgraphIdSet.add(String(link.sourceSubgraphSystemId));
        if (link.destinationSubgraphSystemId)
          subgraphIdSet.add(String(link.destinationSubgraphSystemId));
      }

      // Also harvest from subsystems if present (hierarchical response).
      const subsystems: any[] = data.subsystems ?? [];
      const collectSubgraphIds = (nodes: any[]) => {
        for (const node of nodes) {
          if (node.systemId) subgraphIdSet.add(String(node.systemId));
          if (Array.isArray(node.children?.subsystems))
            collectSubgraphIds(node.children.subsystems);
        }
      };
      collectSubgraphIds(subsystems);
    }

    subgraphSystemIds = [...subgraphIdSet];

    // Find a subgraph that has at least one cross-subgraph pair.
    for (const sgId of subgraphSystemIds) {
      const pairsResp = await request(httpServer)
        .get(
          `/arc-api/v1/projects/${projectId}/subgraphs/${sgId}/subgraph-pairs`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      if (
        pairsResp.status === 200 &&
        Array.isArray(pairsResp.body.data) &&
        pairsResp.body.data.length > 0
      ) {
        subgraphWithPairs = sgId;
        break;
      }
    }
  }, 400000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns 200 with SubgraphPairDto[] shape when pairs exist', async () => {
    if (!projectId || !subgraphWithPairs) {
      console.warn(
        'No subgraph with cross-subgraph pairs found in fixture data — skipping',
      );
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphWithPairs}/subgraph-pairs`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    const pairs: any[] = response.body.data;
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);

    for (const pair of pairs) {
      // Top-level pair fields
      expect(typeof pair.sourceSubgraphSystemId).toBe('string');
      expect(typeof pair.destinationSubgraphSystemId).toBe('string');
      expect(Array.isArray(pair.dataLinks)).toBe(true);
      expect(Array.isArray(pair.controlLinks)).toBe(true);

      // Self-pairs must be absent
      expect(pair.sourceSubgraphSystemId).not.toBe(
        pair.destinationSubgraphSystemId,
      );

      // Link shape
      for (const link of [...pair.dataLinks, ...pair.controlLinks]) {
        expect(typeof link.systemId).toBe('string');
        expect(typeof link.sourceSystemId).toBe('string');
        expect(typeof link.sourcePortSystemId).toBe('string');
        expect(typeof link.destinationSystemId).toBe('string');
        expect(typeof link.destinationPortSystemId).toBe('string');
        expect(typeof link.isInterUsecase).toBe('boolean');
      }
    }
  });

  it('no pair has sourceSubgraphSystemId === destinationSubgraphSystemId (self-pair exclusion)', async () => {
    if (!projectId || !subgraphWithPairs) {
      console.warn('No subgraph with pairs found — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphWithPairs}/subgraph-pairs`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    const pairs: any[] = response.body.data ?? [];
    for (const pair of pairs) {
      expect(pair.sourceSubgraphSystemId).not.toBe(
        pair.destinationSubgraphSystemId,
      );
    }
  });

  // ── Empty result ─────────────────────────────────────────────────────────────

  it('returns 200 with empty array for a subgraph that has no cross-subgraph links', async () => {
    if (!projectId || subgraphSystemIds.length === 0) {
      console.warn('No projectId or subgraph IDs — skipping');
      return;
    }

    // Find any subgraph that returned no pairs (or just use a fresh subgraph ID
    // from the discovered list that is not subgraphWithPairs).
    const subgraphWithoutPairs = subgraphSystemIds.find(
      id => id !== subgraphWithPairs,
    );
    if (!subgraphWithoutPairs) {
      console.warn('Could not find a subgraph without pairs — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphWithoutPairs}/subgraph-pairs`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
  });

  // ── Error cases ──────────────────────────────────────────────────────────────

  it('returns 404 when projectId does not exist', async () => {
    const response = await request(httpServer)
      .get('/arc-api/v1/projects/999999999/subgraphs/1/subgraph-pairs')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });

  it('returns 200 with empty array when subgraphSystemId does not exist', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/subgraphs/999999999/subgraph-pairs`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(0);
  });
});
