/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  VcpmQueryService,
  VcpmInstanceReadModel,
  VcpmCkvReadModel,
  VcpmParameterPayloadReadModel,
  VcpmParameterDefinitionReadModel,
  KeyValueDefQueryService,
  ISessionRepository,
  KeyDefinitionSummaryReadModel,
  ValueDefinitionSummaryReadModel,
  Issue,
} from '@arc/core';
import {RESULT_KIND} from '@arc/core';
import type {VcpmOverlayFetcher} from '../../fetchers/vcpm-overlay-fetcher.js';
import type {
  VcpmCkvBase,
  VcpmParameterPayloadBase,
} from '../../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';

export class DbVcpmQueryService implements VcpmQueryService {
  constructor(
    private readonly vcpmOverlayFetcher: VcpmOverlayFetcher,
    private readonly keyValueDefQueryService: KeyValueDefQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {}

  private async resolveSessionId(fileSystemId: number): Promise<number | null> {
    const session =
      await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
    return session?.sessionId ?? null;
  }

  async getVcpmInstanceBySubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmInstanceReadModel | null> {
    const sessionId = await this.resolveSessionId(fileSystemId);
    const row = await this.vcpmOverlayFetcher.fetchInstanceBySubgraph(
      subgraphSystemId,
      sessionId,
    );
    if (!row) return null;
    return {systemId: row.systemId, subgraphSystemId: row.subgraphSystemId};
  }

  async getVcpmCkvsByInstance(
    vcpmInstanceSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmCkvReadModel[]> {
    const sessionId = await this.resolveSessionId(fileSystemId);
    const rows = await this.vcpmOverlayFetcher.fetchCkvsByInstance(
      vcpmInstanceSystemId,
      subgraphSystemId,
      sessionId,
    );
    return this.toCkvReadModels(rows, fileSystemId);
  }

  async getVcpmCkv(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmCkvReadModel | null> {
    const sessionId = await this.resolveSessionId(fileSystemId);
    const row = await this.vcpmOverlayFetcher.fetchCkv(
      ckvSystemId,
      subgraphSystemId,
      sessionId,
    );
    if (!row) return null;
    const results = await this.toCkvReadModels([row], fileSystemId);
    return results[0];
  }

  async getVcpmParameterPayloads(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    paramSystemIds?: number[],
  ): Promise<VcpmParameterPayloadReadModel[]> {
    const sessionId = await this.resolveSessionId(fileSystemId);
    const rows = await this.vcpmOverlayFetcher.fetchParameterPayloads(
      ckvSystemId,
      subgraphSystemId,
      sessionId,
      paramSystemIds,
    );
    return rows.map(r => this.toPayloadReadModel(r));
  }

  async getVcpmParameterPayloadsByInstance(
    vcpmInstanceSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmParameterPayloadReadModel[]> {
    const sessionId = await this.resolveSessionId(fileSystemId);
    const rows = await this.vcpmOverlayFetcher.fetchParameterPayloadsByInstance(
      vcpmInstanceSystemId,
      subgraphSystemId,
      sessionId,
    );
    return rows.map(r => this.toPayloadReadModel(r));
  }

  async getVcpmParameterDefinitions(
    paramSystemIds: number[],
  ): Promise<VcpmParameterDefinitionReadModel[]> {
    const rows =
      await this.vcpmOverlayFetcher.fetchParameterDefinitions(paramSystemIds);
    return rows.map(r => ({
      systemId: r.systemId,
      paramId: r.paramId,
      name: r.name ?? '',
      isReadOnly: r.isReadOnly,
      elementsStructure: r.elementsStructure ?? '',
    }));
  }

  // Resolves all value IDs across all CKV rows in a single DB call, then
  // distributes the resolved key-value pairs back to each row.
  private async toCkvReadModels(
    rows: VcpmCkvBase[],
    fileSystemId: number,
  ): Promise<VcpmCkvReadModel[]> {
    if (rows.length === 0) return [];

    const allValueDefIds = [
      ...new Set(rows.flatMap(r => r.values.map(v => v.valueDefSystemId))),
    ];
    const pairsResult =
      await this.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
        allValueDefIds,
        fileSystemId,
      );
    if (pairsResult.kind === RESULT_KIND.Fail) {
      const ckvIds = rows.map(r => r.systemId).join(', ');
      throw new Error(
        `Failed to resolve key-value pairs for CKVs [${ckvIds}] (fileSystemId: ${fileSystemId}, valueDefIds: [${allValueDefIds.join(', ')}]): ${pairsResult.issues.map((e: Issue) => e.message).join(', ')}`,
      );
    }

    const pairByValueDefId = new Map(
      pairsResult.data.map(
        (kv: {
          key: KeyDefinitionSummaryReadModel;
          value: ValueDefinitionSummaryReadModel;
        }) => [
          kv.value.systemId,
          {
            key: {
              keyId: kv.key.keyId,
              name: kv.key.name,
              systemId: String(kv.key.systemId),
            },
            value: {
              valueId: kv.value.valueId,
              name: kv.value.name,
              systemId: String(kv.value.systemId),
            },
          },
        ],
      ),
    );

    return rows.map(row => {
      const values = row.values.map(v => {
        const kv = pairByValueDefId.get(v.valueDefSystemId);
        if (kv === undefined) {
          throw new Error(
            `Data integrity error: valueDefSystemId ${v.valueDefSystemId} on CKV ${row.systemId} (fileSystemId: ${fileSystemId}) could not be resolved`,
          );
        }
        return kv;
      });
      return {systemId: row.systemId, values};
    });
  }

  private toPayloadReadModel(
    row: VcpmParameterPayloadBase,
  ): VcpmParameterPayloadReadModel {
    return {
      systemId: row.systemId,
      vcpmParameterSystemId: row.vcpmParameterSystemId,
      vcpmCkvSystemId: row.vcpmCkvSystemId,
      payload: row.payload ? new Uint8Array(row.payload) : null,
    };
  }
}
