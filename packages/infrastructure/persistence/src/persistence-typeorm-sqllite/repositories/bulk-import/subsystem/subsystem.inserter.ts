/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {Node, BulkInsertResult, DataPort, ControlPort} from '@arc/core';
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
  type SubsystemRow,
} from '../../../entity-schema/usecase-data/subsystem/subsystem.js';

export class SubsystemInserter implements BulkInserter<Node> {
  constructor(private readonly manager: EntityManager) {}

  public async insert(nodes: Node[]): Promise<BulkInsertResult> {
    if (nodes.length === 0) return okBulkInsert();

    const nodeBySystemId = new Map(nodes.map(n => [n.systemId, n]));

    const nodeStep = await this.insertNodes(nodes);
    const activeNodes = nodes.filter(
      n => !nodeStep.failedEntityIds.has(n.systemId),
    );

    const [dataPortsStep, controlPortsStep, subsystemsStep] = await Promise.all(
      [
        this.insertDataPorts(activeNodes),
        this.insertControlPorts(activeNodes),
        this.insertSubsystems(activeNodes),
      ],
    );

    const allRawFailures: RawFailure[] = [
      ...nodeStep.rawFailures,
      ...dataPortsStep.rawFailures,
      ...controlPortsStep.rawFailures,
      ...subsystemsStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      nodeBySystemId,
      n => `some or all data belonging to Subsystem {systemId=${n.systemId}}`,
    );
  }

  // ─── Node ────────────────────────────────────────────────────────────────────

  private async insertNodes(nodes: Node[]): Promise<StepResult> {
    const rows: InsertRow<NodeRow>[] = nodes.map(n => ({
      systemId: n.systemId,
      parentId: n.parentId,
      type: NODE_TYPE.Subsystem,
      fileSystemId: n.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      NodeSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const node = nodes.find(n => n.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: node.systemId,
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

  private async insertDataPorts(nodes: Node[]): Promise<StepResult> {
    const contextByPortSystemId = new Map<
      number,
      {readonly port: DataPort; readonly node: Node}
    >(
      nodes.flatMap(n =>
        n.dataPorts.map(port => [port.systemId, {port, node: n}] as const),
      ),
    );

    const rows: InsertRow<DataPortRow>[] = nodes.flatMap(n =>
      n.dataPorts.map(port => ({
        systemId: port.systemId,
        dataPortId: port.dataPortId,
        portIoType: port.portIoType,
        isStatic: port.isStatic,
        name: port.name,
        nodeSystemId: n.systemId,
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
        systemId: ctx.node.systemId,
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

  private async insertControlPorts(nodes: Node[]): Promise<StepResult> {
    const contextByPortSystemId = new Map<
      number,
      {readonly port: ControlPort; readonly node: Node}
    >(
      nodes.flatMap(n =>
        n.controlPorts.map(port => [port.systemId, {port, node: n}] as const),
      ),
    );

    const rows: InsertRow<ControlPortRow>[] = nodes.flatMap(n =>
      n.controlPorts.map(port => ({
        systemId: port.systemId,
        portId: port.portId,
        isStatic: port.isStatic,
        name: port.name,
        nodeSystemId: n.systemId,
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
        systemId: ctx.node.systemId,
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

  private async insertSubsystems(nodes: Node[]): Promise<StepResult> {
    const rows: InsertRow<SubsystemRow>[] = nodes.map(n => ({
      systemId: n.systemId,
      name: '',
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SubsystemSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const node = nodes.find(n => n.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: node.systemId,
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
}
