/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  Container,
  BulkInsertError,
  BulkInsertResult,
  IdGenerationPort,
} from '@arc/core';
import {errBulkInsert, okBulkInsert} from '@arc/core';
import type {BulkInserter} from '../common/bulk-inserter.interface.js';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {
  ContainerSchema,
  type ContainerRow,
} from '../../../entity-schema/usecase-data/container/container.schema.js';
import type {ContainerPropertyDataRow} from '../../../entity-schema/usecase-data/container/container-property-data.js';

/**
 * Inserts Container domain entities and their ContainerPropertyData children
 * into the database using ordered bulk batch inserts.
 *
 * All insert steps are always attempted regardless of prior failures.
 *
 * Insert order (FK-safe):
 *   Container → ContainerPropertyData
 */
export class ContainerInserter implements BulkInserter<Container> {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  /**
   * Inserts all Container entities and their property data in FK-safe order.
   * Failures are grouped by Container aggregate and returned as
   * `BulkInsertError[]` — one entry per failing container.
   * @returns BulkInsertResult — ok if all inserts succeeded, err otherwise.
   */
  public async insert(containers: Container[]): Promise<BulkInsertResult> {
    if (containers.length === 0) return okBulkInsert();

    const containerBySystemId = new Map(containers.map(c => [c.systemId, c]));

    const rawFailures: RawFailure[] = [
      ...(await this.insertContainers(containers)),
      ...(await this.insertContainerPropertyData(containers)),
    ];

    if (rawFailures.length === 0) return okBulkInsert();

    // Group raw failures by Container systemId.
    const grouped = new Map<number, string[]>();
    for (const f of rawFailures) {
      if (!grouped.has(f.systemId)) grouped.set(f.systemId, []);
      grouped
        .get(f.systemId)!
        .push(
          `${f.entityLabel}: Failed to insert\n${f.failedRowJson}\nerror: ${f.dbError}`,
        );
    }

    const errors: BulkInsertError[] = [...grouped.entries()].map(
      ([systemId, lines]) => {
        const container = containerBySystemId.get(systemId)!;
        return {
          message: `Failed to insert some or all data belonging to Container {containerId=${container.containerId}, systemId=${container.systemId}}`,
          details: lines.join('\n'),
        };
      },
    );

    return errBulkInsert(errors);
  }

  // ─── Container ───────────────────────────────────────────────────────────────

  private async insertContainers(
    containers: Container[],
  ): Promise<RawFailure[]> {
    const rows: InsertRow<ContainerRow>[] = containers.map(c => ({
      systemId: c.systemId,
      containerId: c.containerId,
      type: c.type,
      fileSystemId: c.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ContainerSchema,
      rows,
    );

    return failedEntities.map(error => {
      const container = containers.find(c => c.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: container.systemId,
        entityLabel: 'Container',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── Container Property Data ─────────────────────────────────────────────────

  private async insertContainerPropertyData(
    containers: Container[],
  ): Promise<RawFailure[]> {
    // Collect all property entries with their context
    const propEntries = containers.flatMap(c =>
      [...c.properties.values()].map(prop => ({prop, container: c})),
    );

    if (propEntries.length === 0) return [];

    // Generate a unique systemId for each property data row
    const fileId = containers[0].fileSystemId;
    const rows: InsertRow<ContainerPropertyDataRow>[] = [];
    const contextBySystemId = new Map<
      number,
      {readonly container: Container}
    >();

    for (const entry of propEntries) {
      const systemId = await this.idGeneration.getNextId(fileId);
      rows.push({
        systemId,
        containerSystemId: entry.container.systemId,
        propertySystemId: entry.prop.containerPropertyDefinitionSystemId,
        payload: entry.prop.getPayloadCopy(),
      });
      contextBySystemId.set(systemId, {container: entry.container});
    }

    const {failedEntities} =
      await BatchInserter.insert<ContainerPropertyDataRow>(
        this.manager,
        'ContainerPropertyData',
        rows,
      );

    return failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.container.systemId,
        entityLabel: 'Container Property Data',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }
}
