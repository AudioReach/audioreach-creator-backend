/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  Node,
  BulkInsertError,
  BulkInsertResult,
  DataPort,
  ControlPort,
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
  NodeSchema,
  NODE_TYPE,
  type NodeRow,
} from '../../../entity-schema/usecase-data/node/node.schema.js';
import {DataPortSchema} from '../../../entity-schema/usecase-data/node/data-port-info.schema.js';
import type {DataPortRow} from '../../../entity-schema/usecase-data/node/data-port-info.schema.js';
import {
  ControlPortSchema,
  IntentSchema,
} from '../../../entity-schema/usecase-data/node/control-port.js';
import type {
  ControlPortRow,
  IntentRow,
} from '../../../entity-schema/usecase-data/node/control-port.js';
import {
  SubsystemSchema,
  type SubsystemRow,
} from '../../../entity-schema/usecase-data/subsystem/subsystem.js';

/**
 * Inserts Subsystem Node entities and their children into the database
 * using ordered bulk batch inserts.
 *
 * A Subsystem shares its PK with Node (same pattern as SpfModule).
 * All insert steps are always attempted regardless of prior failures.
 *
 * Insert order (FK-safe):
 *   Node → DataPort → ControlPort → Intent → Subsystem
 */
export class SubsystemInserter implements BulkInserter<Node> {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  /**
   * Inserts all Subsystem Node entities and their children in FK-safe order.
   * Failures are grouped by Node aggregate and returned as
   * `BulkInsertError[]` — one entry per failing subsystem.
   * @returns BulkInsertResult — ok if all inserts succeeded, err otherwise.
   */
  public async insert(nodes: Node[]): Promise<BulkInsertResult> {
    if (nodes.length === 0) return okBulkInsert();

    const nodeBySystemId = new Map(nodes.map(n => [n.systemId, n]));

    const rawFailures: RawFailure[] = [
      ...(await this.insertNodes(nodes)),
      ...(await this.insertDataPorts(nodes)),
      ...(await this.insertControlPorts(nodes)),
      ...(await this.insertSubsystems(nodes)),
    ];

    if (rawFailures.length === 0) return okBulkInsert();

    // Group raw failures by Node systemId.
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
        const node = nodeBySystemId.get(systemId)!;
        return {
          message: `Failed to insert some or all data belonging to Subsystem {systemId=${node.systemId}}`,
          details: lines.join('\n'),
        };
      },
    );

    return errBulkInsert(errors);
  }

  // ─── Node ────────────────────────────────────────────────────────────────────

  private async insertNodes(nodes: Node[]): Promise<RawFailure[]> {
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

    return failedEntities.map(error => {
      const node = nodes.find(n => n.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: node.systemId,
        entityLabel: 'Subsystem-Node',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── DataPort ────────────────────────────────────────────────────────────────

  private async insertDataPorts(nodes: Node[]): Promise<RawFailure[]> {
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

    if (rows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DataPortSchema,
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextByPortSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.node.systemId,
        entityLabel: 'Data Port',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── ControlPort ─────────────────────────────────────────────────────────────

  private async insertControlPorts(nodes: Node[]): Promise<RawFailure[]> {
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

    if (rows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ControlPortSchema,
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextByPortSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.node.systemId,
        entityLabel: 'Control Port',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── Subsystem ───────────────────────────────────────────────────────────────

  private async insertSubsystems(nodes: Node[]): Promise<RawFailure[]> {
    const rows: InsertRow<SubsystemRow>[] = nodes.map(n => ({
      systemId: n.systemId,
      name: '',
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SubsystemSchema,
      rows,
    );

    return failedEntities.map(error => {
      const node = nodes.find(n => n.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: node.systemId,
        entityLabel: 'Subsystem',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }
}
