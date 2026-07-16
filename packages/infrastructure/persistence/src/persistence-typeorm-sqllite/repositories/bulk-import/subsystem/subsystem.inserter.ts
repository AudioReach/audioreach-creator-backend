/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BulkInsertResult,
  DataPort,
  ControlPort,
  Subsystem,
} from '@arc/core';
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
  NodeSchema,
  NODE_TYPE,
  type NodeRow,
} from '../../../entity-schema/usecase-data/node/node.schema.js';
import {DataPortSchema} from '../../../entity-schema/usecase-data/node/data-port-info.schema.js';
import type {DataPortRow} from '../../../entity-schema/usecase-data/node/data-port-info.schema.js';
import {ControlPortSchema} from '../../../entity-schema/usecase-data/node/control-port.js';
import type {ControlPortRow} from '../../../entity-schema/usecase-data/node/control-port.js';
import {
  SubsystemSchema,
  SubsystemFilteredKeySchema,
  type SubsystemRow,
} from '../../../entity-schema/usecase-data/subsystem/subsystem.js';

export class SubsystemInserter implements BulkInserter<Subsystem> {
  constructor(private readonly manager: EntityManager) {}

  public async insert(subsystems: Subsystem[]): Promise<BulkInsertResult> {
    if (subsystems.length === 0) return okBulkInsert();

    const subsystemBySystemId = new Map(subsystems.map(s => [s.systemId, s]));

    const nodeStep = await this.insertNodes(subsystems);
    const activeSubsystems = subsystems.filter(
      s => !nodeStep.failedEntityIds.has(s.systemId),
    );

    const [dataPortsStep, controlPortsStep, subsystemsStep] = await Promise.all(
      [
        this.insertDataPorts(activeSubsystems),
        this.insertControlPorts(activeSubsystems),
        this.insertSubsystemRows(activeSubsystems),
      ],
    );

    const filteredKeysStep = await this.insertFilteredKeys(
      activeSubsystems,
      subsystemsStep.failedEntityIds,
    );

    const allRawFailures: RawFailure[] = [
      ...nodeStep.rawFailures,
      ...dataPortsStep.rawFailures,
      ...controlPortsStep.rawFailures,
      ...subsystemsStep.rawFailures,
      ...filteredKeysStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      subsystemBySystemId,
      s => `some or all data belonging to Subsystem {systemId=${s.systemId}}`,
    );
  }

  // ─── Node ────────────────────────────────────────────────────────────────────

  private async insertNodes(subsystems: Subsystem[]): Promise<StepResult> {
    const rows: InsertRow<NodeRow>[] = subsystems.map(s => ({
      systemId: s.systemId,
      parentId: s.parentId,
      type: NODE_TYPE.Subsystem,
      fileSystemId: s.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      NodeSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const subsystem = subsystems.find(s => s.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: subsystem.systemId,
        entityLabel: 'Subsystem-Node',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── DataPort ────────────────────────────────────────────────────────────────

  private async insertDataPorts(subsystems: Subsystem[]): Promise<StepResult> {
    const contextByPortSystemId = new Map<
      number,
      {readonly port: DataPort; readonly subsystem: Subsystem}
    >(
      subsystems.flatMap(s =>
        s.dataPorts.map(port => [port.systemId, {port, subsystem: s}] as const),
      ),
    );

    const rows: InsertRow<DataPortRow>[] = subsystems.flatMap(s =>
      s.dataPorts.map(port => ({
        systemId: port.systemId,
        dataPortId: port.dataPortId,
        portIoType: port.portIoType,
        isStatic: port.isStatic,
        name: port.name,
        nodeSystemId: s.systemId,
      })),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DataPortSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextByPortSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.subsystem.systemId,
        entityLabel: 'Data Port',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── ControlPort ─────────────────────────────────────────────────────────────

  private async insertControlPorts(
    subsystems: Subsystem[],
  ): Promise<StepResult> {
    const contextByPortSystemId = new Map<
      number,
      {readonly port: ControlPort; readonly subsystem: Subsystem}
    >(
      subsystems.flatMap(s =>
        s.controlPorts.map(
          port => [port.systemId, {port, subsystem: s}] as const,
        ),
      ),
    );

    const rows: InsertRow<ControlPortRow>[] = subsystems.flatMap(s =>
      s.controlPorts.map(port => ({
        systemId: port.systemId,
        portId: port.portId,
        isStatic: port.isStatic,
        name: port.name,
        nodeSystemId: s.systemId,
      })),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ControlPortSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextByPortSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.subsystem.systemId,
        entityLabel: 'Control Port',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── Subsystem ───────────────────────────────────────────────────────────────

  private async insertSubsystemRows(
    subsystems: Subsystem[],
  ): Promise<StepResult> {
    const rows: InsertRow<SubsystemRow>[] = subsystems.map(s => ({
      systemId: s.systemId,
      name: s.name,
      subsystemId: s.subsystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SubsystemSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const subsystem = subsystems.find(s => s.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: subsystem.systemId,
        entityLabel: 'Subsystem',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertFilteredKeys(
    subsystems: Subsystem[],
    failedSubsystemIds: Set<number>,
  ): Promise<StepResult> {
    const rows: {
      subsystemsSystemId: number;
      keyDefinitionSystemId: number;
    }[] = [];
    for (const s of subsystems) {
      if (failedSubsystemIds.has(s.systemId)) continue;
      for (const keySystemId of s.filteredKeySystemIds) {
        rows.push({
          subsystemsSystemId: s.systemId,
          keyDefinitionSystemId: keySystemId,
        });
      }
    }
    if (rows.length === 0) return emptyStepResult();

    try {
      await this.manager
        .createQueryBuilder()
        .insert()
        .into(SubsystemFilteredKeySchema)
        .values(rows)
        .orIgnore()
        .execute();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        rawFailures: subsystems.map(s => ({
          systemId: s.systemId,
          entityLabel: 'SubsystemFilteredKey',
          failedRowJson: JSON.stringify(
            rows.filter(r => r.subsystemsSystemId === s.systemId),
          ),
          dbError: msg,
        })),
        failedEntityIds: new Set(subsystems.map(s => s.systemId)),
      };
    }
    return emptyStepResult();
  }
}
