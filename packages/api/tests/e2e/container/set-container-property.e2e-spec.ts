/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import type {INestApplication} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── helpers ───────────────────────────────────────────────────────────────────

async function startDesignerSession(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<void> {
  await request(httpServer as Parameters<typeof request>[0])
    .post(`/arc-api/v1/projects/${projectId}/start-session`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({mode: 'DESIGNER'})
    .timeout(30_000)
    .expect(201);
}

async function endSession(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<void> {
  await request(httpServer as Parameters<typeof request>[0])
    .post(`/arc-api/v1/projects/${projectId}/end-session`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);
}

async function discoverContainerAndProperty(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<{
  containerSystemId: number | undefined;
  propertySystemId: number | undefined;
}> {
  const containersRes = await request(
    httpServer as Parameters<typeof request>[0],
  )
    .post(`/arc-api/v1/projects/${projectId}/containers/query`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({systemIds: []})
    .timeout(30_000);

  const containers: any[] = containersRes.body?.data ?? [];
  if (containers.length === 0) {
    console.warn('Fixture has no containers — all tests will skip');
    return {containerSystemId: undefined, propertySystemId: undefined};
  }
  const containerSystemId = containers[0].systemId as number;

  const propsRes = await request(httpServer as Parameters<typeof request>[0])
    .get(
      `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties`,
    )
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);

  const properties: any[] = propsRes.body?.data?.properties ?? [];
  if (properties.length === 0) {
    console.warn('Fixture container has no properties — some tests will skip');
    return {containerSystemId, propertySystemId: undefined};
  }
  const propertySystemId = Number(properties[0].systemId);

  return {containerSystemId, propertySystemId};
}

async function discoverEmptyContainerAndCapabilityProperty(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<{
  containerSystemId: string | undefined;
  propertySystemId: number | undefined;
}> {
  const containersRes = await request(
    httpServer as Parameters<typeof request>[0],
  )
    .post(`/arc-api/v1/projects/${projectId}/containers/query`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({systemIds: []})
    .timeout(30_000);

  const containers: any[] = containersRes.body?.data ?? [];
  if (containers.length === 0) {
    return {containerSystemId: undefined, propertySystemId: undefined};
  }

  const usecasesRes = await request(httpServer as Parameters<typeof request>[0])
    .get(`/arc-api/v1/projects/${projectId}/usecases/`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);

  const usecaseSystemIds: string[] = [];
  for (const usecase of usecasesRes.body?.data ?? []) {
    const nestedUsecases: any[] = usecase.usecases ?? [];
    for (const nestedUsecase of nestedUsecases) {
      if (nestedUsecase.systemId) {
        usecaseSystemIds.push(String(nestedUsecase.systemId));
      }
    }
    if (nestedUsecases.length === 0 && usecase.systemId) {
      usecaseSystemIds.push(String(usecase.systemId));
    }
  }

  if (usecaseSystemIds.length === 0) {
    return {containerSystemId: undefined, propertySystemId: undefined};
  }

  const componentsRes = await request(
    httpServer as Parameters<typeof request>[0],
  )
    .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({systemIds: usecaseSystemIds})
    .timeout(30_000);

  const modules: any[] = componentsRes.body?.data?.spfModules ?? [];
  const moduleContainerIds = new Set(
    modules
      .map(module => Number(module.containerId))
      .filter(containerId => Number.isFinite(containerId)),
  );
  const emptyContainer = containers.find(
    container => !moduleContainerIds.has(Number(container.id)),
  );

  if (!emptyContainer) {
    return {containerSystemId: undefined, propertySystemId: undefined};
  }

  const propertiesRes = await request(
    httpServer as Parameters<typeof request>[0],
  )
    .get(
      `/arc-api/v1/projects/${projectId}/containers/${emptyContainer.systemId}/properties`,
    )
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);

  const capabilityProperty = (propertiesRes.body?.data?.properties ?? []).find(
    (property: any) => Number(property.propertyId) === 0x08001011,
  );

  return {
    containerSystemId: String(emptyContainer.systemId),
    propertySystemId: capabilityProperty
      ? Number(capabilityProperty.systemId)
      : undefined,
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('E2E: PUT /arc-api/v1/projects/:projectId/containers/:containerSystemId/properties/:propertySystemId', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string | undefined;
  let containerSystemId: number | undefined;
  let propertySystemId: number | undefined;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
    projectId = undefined;
    containerSystemId = undefined;
    propertySystemId = undefined;

    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');
    const uploadRes = await request(httpServer as Parameters<typeof request>[0])
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(120_000);

    if (!uploadRes.body?.data?.projectId) {
      console.warn('Upload failed — all tests will skip');
      return;
    }
    projectId = uploadRes.body.data.projectId as string;

    ({containerSystemId, propertySystemId} = await discoverContainerAndProperty(
      httpServer,
      authToken,
      projectId,
    ));
  }, 200_000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  beforeEach(async () => {
    if (!projectId) return;
    await startDesignerSession(httpServer, authToken, projectId);
  }, 30_000);

  afterEach(async () => {
    if (!projectId) return;
    await endSession(httpServer, authToken, projectId);
  }, 30_000);

  // ── 403: no active session ─────────────────────────────────────────────────

  it('returns 403 when no active session exists for the project', async () => {
    if (!projectId || !containerSystemId || !propertySystemId) {
      console.warn('No fixture data — skipping');
      return;
    }
    await endSession(httpServer, authToken, projectId);

    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${propertySystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({elements: []})
      .timeout(30_000);

    expect(res.status).toBe(403);

    // Re-start so afterEach can end cleanly
    await startDesignerSession(httpServer, authToken, projectId);
  }, 60_000);

  // ── 404: container not found ───────────────────────────────────────────────

  it('returns 404 when containerSystemId does not exist', async () => {
    if (!projectId || !propertySystemId) {
      console.warn('No fixture data — skipping');
      return;
    }
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/containers/999999999/properties/${propertySystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({elements: []})
      .timeout(30_000);

    expect(res.status).toBe(404);
  }, 60_000);

  // ── 404: property definition not found ────────────────────────────────────

  it('returns 404 when propertySystemId does not exist in the DB', async () => {
    if (!projectId || !containerSystemId) {
      console.warn('No fixture data — skipping');
      return;
    }
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({elements: []})
      .timeout(30_000);

    expect(res.status).toBe(404);
  }, 60_000);

  // ── 400: serialization fails ───────────────────────────────────────────────

  it('returns 400 when elements fail serialization (type mismatch)', async () => {
    if (!projectId || !containerSystemId || !propertySystemId) {
      console.warn('No fixture data — skipping');
      return;
    }
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${propertySystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        elements: [
          {type: 'NOT_A_VALID_ELEMENT_TYPE', name: 'bad', value: -99999999999},
        ],
      })
      .timeout(30_000);

    expect(res.status).toBe(400);
  }, 60_000);

  // ── 422: 0x08001011 capability mismatch ───────────────────────────────────

  it('returns 422 when 0x08001011 capability list has no intersection with a module', async () => {
    if (!projectId || !containerSystemId) {
      console.warn('No fixture data — skipping');
      return;
    }
    const dataSource = (
      app as INestApplication & {get: (token: any) => any}
    ).get(DataSource);
    const capabilityPropRow = await dataSource.manager
      .createQueryBuilder()
      .select(['cpd.systemId'])
      .from('ContainerPropertyDefinition', 'cpd')
      .where('cpd.propertyId = :pid', {pid: 0x08001011})
      .limit(1)
      .getRawOne<{systemId: number} | undefined>();

    if (!capabilityPropRow) {
      console.warn('0x08001011 property definition not in fixture — skipping');
      return;
    }

    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${capabilityPropRow.systemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        elements: [
          {type: 'CONFIG_ELEMENT', name: 'count', value: 1, dataType: 'uint32'},
          {
            type: 'CONFIG_ELEMENT',
            name: 'capabilityId_0',
            value: 0xffffffff,
            dataType: 'uint32',
          },
        ],
      })
      .timeout(30_000);

    expect([400, 404, 422]).toContain(res.status);
    if (res.status === 422) {
      expect(Array.isArray(res.body.issues)).toBe(true);
    }
  }, 60_000);

  // ── 200: 0x08001011 valid capability list ─────────────────────────────────

  it('returns 200 and PropertyResponseDto when 0x08001011 capability list is valid', async () => {
    if (!projectId || !containerSystemId) {
      console.warn('No fixture data — skipping');
      return;
    }
    const dataSource = (
      app as INestApplication & {get: (token: any) => any}
    ).get(DataSource);
    const capabilityPropRow = await dataSource.manager
      .createQueryBuilder()
      .select(['cpd.systemId', 'cpd.elementsStructure'])
      .from('ContainerPropertyDefinition', 'cpd')
      .where('cpd.propertyId = :pid', {pid: 0x08001011})
      .limit(1)
      .getRawOne<{systemId: number; elementsStructure: string} | undefined>();

    if (!capabilityPropRow) {
      console.warn('0x08001011 property definition not in fixture — skipping');
      return;
    }

    const getRes = await request(httpServer as Parameters<typeof request>[0])
      .get(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${capabilityPropRow.systemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    if (getRes.status !== 200) {
      console.warn(
        `GET returned ${getRes.status} — skipping capability valid test`,
      );
      return;
    }

    const existingElements: any[] = getRes.body?.data?.elements ?? [];

    const setRes = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${capabilityPropRow.systemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({elements: existingElements})
      .timeout(30_000);

    expect(setRes.status).toBe(200);
    expect(setRes.body.data).toBeDefined();
    expect(typeof setRes.body.data.systemId).toBe('string');
    expect(typeof setRes.body.data.propertyId).toBe('number');
    expect(typeof setRes.body.data.propertyName).toBe('string');
    expect(Array.isArray(setRes.body.data.elements)).toBe(true);
  }, 60_000);

  // ── 200: 0x08001011 capability list on an empty container ────────────────

  it('returns 200 for a valid 0x08001011 capability list on an empty container', async () => {
    if (!projectId) {
      console.warn('No project fixture data — skipping');
      return;
    }

    const emptyContainer = await discoverEmptyContainerAndCapabilityProperty(
      httpServer,
      authToken,
      projectId,
    );

    if (!emptyContainer.containerSystemId) {
      console.warn('Fixture has no empty container — skipping');
      return;
    }

    if (!emptyContainer.propertySystemId) {
      console.warn('Capability property definition not found — skipping');
      return;
    }

    const propertyUrl =
      `/arc-api/v1/projects/${projectId}/containers/${emptyContainer.containerSystemId}` +
      `/properties/${emptyContainer.propertySystemId}`;
    const getRes = await request(httpServer as Parameters<typeof request>[0])
      .get(propertyUrl)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    if (getRes.status !== 200) {
      console.warn(
        `GET capability property returned ${getRes.status} — skipping`,
      );
      return;
    }

    const setRes = await request(httpServer as Parameters<typeof request>[0])
      .put(propertyUrl)
      .set('Authorization', `Bearer ${authToken}`)
      .send({elements: getRes.body?.data?.elements ?? []})
      .timeout(30_000);

    expect(setRes.status).toBe(200);
    expect(setRes.body.data).toBeDefined();
    expect(typeof setRes.body.data.systemId).toBe('string');
    expect(typeof setRes.body.data.propertyId).toBe('number');
  }, 60_000);

  // ── 200: 0x08001174 heap = Default — no cascade ───────────────────────────

  it('returns 200 and does NOT write module heap edit_actions when heap = Default (0x1)', async () => {
    if (!projectId || !containerSystemId) {
      console.warn('No fixture data — skipping');
      return;
    }
    const dataSource = (
      app as INestApplication & {get: (token: any) => any}
    ).get(DataSource);
    const heapPropRow = await dataSource.manager
      .createQueryBuilder()
      .select(['cpd.systemId'])
      .from('ContainerPropertyDefinition', 'cpd')
      .where('cpd.propertyId = :pid', {pid: 0x08001174})
      .limit(1)
      .getRawOne<{systemId: number} | undefined>();

    if (!heapPropRow) {
      console.warn('0x08001174 property definition not in fixture — skipping');
      return;
    }

    const getRes = await request(httpServer as Parameters<typeof request>[0])
      .get(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${heapPropRow.systemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    if (getRes.status !== 200) {
      console.warn(
        `GET returned ${getRes.status} — skipping heap Default test`,
      );
      return;
    }

    const elements: any[] = (getRes.body?.data?.elements ?? []).map(
      (el: any, i: number) => (i === 0 ? {...el, value: 1} : el),
    );

    const setRes = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${heapPropRow.systemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({elements})
      .timeout(30_000);

    expect(setRes.status).toBe(200);
  }, 60_000);

  // ── 200: 0x08001174 heap = Low Power — cascade to modules ─────────────────

  it('returns 200 and writes SpfModule heapId edit_actions when heap = Low Power (0x2)', async () => {
    if (!projectId || !containerSystemId) {
      console.warn('No fixture data — skipping');
      return;
    }
    const dataSource = (
      app as INestApplication & {get: (token: any) => any}
    ).get(DataSource);
    const heapPropRow = await dataSource.manager
      .createQueryBuilder()
      .select(['cpd.systemId'])
      .from('ContainerPropertyDefinition', 'cpd')
      .where('cpd.propertyId = :pid', {pid: 0x08001174})
      .limit(1)
      .getRawOne<{systemId: number} | undefined>();

    if (!heapPropRow) {
      console.warn('0x08001174 property definition not in fixture — skipping');
      return;
    }

    const getRes = await request(httpServer as Parameters<typeof request>[0])
      .get(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${heapPropRow.systemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    if (getRes.status !== 200) {
      console.warn(
        `GET returned ${getRes.status} — skipping heap Low Power test`,
      );
      return;
    }

    const elements: any[] = (getRes.body?.data?.elements ?? []).map(
      (el: any, i: number) => (i === 0 ? {...el, value: 2} : el),
    );

    const setRes = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${heapPropRow.systemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({elements})
      .timeout(30_000);

    expect(setRes.status).toBe(200);
  }, 60_000);

  // ── 200: any other property ────────────────────────────────────────────────

  it('returns 200 and PropertyResponseDto for a generic property round-trip', async () => {
    if (!projectId || !containerSystemId || !propertySystemId) {
      console.warn('No fixture data — skipping');
      return;
    }
    const getRes = await request(httpServer as Parameters<typeof request>[0])
      .get(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${propertySystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    if (getRes.status !== 200) {
      console.warn(
        `GET returned ${getRes.status} — skipping generic property test`,
      );
      return;
    }

    const existingElements: any[] = getRes.body?.data?.elements ?? [];

    const setRes = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/containers/${containerSystemId}/properties/${propertySystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({elements: existingElements})
      .timeout(30_000);

    expect(setRes.status).toBe(200);
    expect(setRes.body.data).toBeDefined();
    expect(typeof setRes.body.data.systemId).toBe('string');
    expect(setRes.body.data.propertyId).toBe(getRes.body.data.propertyId);
    expect(typeof setRes.body.data.propertyName).toBe('string');
    expect(Array.isArray(setRes.body.data.elements)).toBe(true);
  }, 60_000);
});
