/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {Container, BulkInsertResult, IdGenerationPort} from '@arc/core';
import {okBulkInsert} from '@arc/core';
import type {BulkInserter} from '../common/bulk-inserter.interface.js';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import {emptyStepResult} from '../common/step-result.js';
import type {StepResult} from '../common/step-result.js';
import {
  ContainerSchema,
  type ContainerRow,
} from '../../../entity-schema/usecase-data/container/container.schema.js';
import type {ContainerPropertyDataRow} from '../../../entity-schema/usecase-data/container/container-property-data.js';

export class ContainerInserter implements BulkInserter<Container> {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  public async insert(containers: Container[]): Promise<BulkInsertResult> {
    if (containers.length === 0) return okBulkInsert();

    const containerBySystemId = new Map(containers.map(c => [c.systemId, c]));

    const containerStep = await this.insertContainers(containers);
    const activeContainers = containers.filter(
      c => !containerStep.failedEntityIds.has(c.systemId),
    );

    const propertyDataStep =
      await this.insertContainerPropertyData(activeContainers);

    const allRawFailures: RawFailure[] = [
      ...containerStep.rawFailures,
      ...propertyDataStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      containerBySystemId,
      c =>
        `some or all data belonging to Container {containerId=${c.containerId}, systemId=${c.systemId}}`,
    );
  }

  // ─── Container ───────────────────────────────────────────────────────────────

  private async insertContainers(containers: Container[]): Promise<StepResult> {
    const rows: InsertRow<ContainerRow>[] = containers.map(c => ({
      systemId: c.systemId,
      containerId: c.containerId,
      containerTypeSystemId: c.containerTypeSystemId,
      fileSystemId: c.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ContainerSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const container = containers.find(c => c.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: container.systemId,
        entityLabel: 'Container',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── Container Property Data ─────────────────────────────────────────────────

  private async insertContainerPropertyData(
    containers: Container[],
  ): Promise<StepResult> {
    const propEntries = containers.flatMap(c =>
      [...c.properties.values()].map(prop => ({prop, container: c})),
    );

    if (propEntries.length === 0) return emptyStepResult();

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

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.container.systemId,
        entityLabel: 'Container Property Data',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
