/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {NaturalIdEntriesLoader, NaturalIdEntry} from '@arc/core';
import {NaturalIdType} from '@arc/core';
import type {EntityManager} from 'typeorm';

type NaturalIdRow = {naturalId: number | null};

/** Loads database natural IDs used to seed the file-scoped allocator. */
export class TypeOrmNaturalIdEntriesLoader implements NaturalIdEntriesLoader {
  constructor(private readonly manager: EntityManager) {}

  async load(fileSystemId: number): Promise<NaturalIdEntry[]> {
    const [subgraphs, containers, modules, subsystems] = await Promise.all([
      this.read('subgraphs', 'subgraph_id', fileSystemId),
      this.read('containers', 'container_id', fileSystemId),
      this.read('spf_modules', 'instance_id', fileSystemId),
      this.readSubsystems(fileSystemId),
    ]);

    return [
      ...this.toEntries(NaturalIdType.SUBGRAPH, subgraphs),
      ...this.toEntries(NaturalIdType.CONTAINER, containers),
      ...this.toEntries(NaturalIdType.MODINSTANCE, modules),
      ...this.toEntries(NaturalIdType.SUBSYSTEM, subsystems),
    ];
  }

  private async read(
    table: string,
    column: string,
    fileSystemId: number,
  ): Promise<NaturalIdRow[]> {
    return this.manager
      .createQueryBuilder()
      .select(`${table}.${column}`, 'naturalId')
      .from(table, table)
      .where(`${table}.file_system_id = :fileSystemId`, {fileSystemId})
      .getRawMany<NaturalIdRow>();
  }

  private async readSubsystems(fileSystemId: number): Promise<NaturalIdRow[]> {
    return this.manager
      .createQueryBuilder()
      .select('subsystem.subsystem_id', 'naturalId')
      .from('subsystems', 'subsystem')
      .innerJoin('nodes', 'node', 'node.system_id = subsystem.system_id')
      .where('node.file_system_id = :fileSystemId', {fileSystemId})
      .getRawMany<NaturalIdRow>();
  }

  private toEntries(
    type: NaturalIdType,
    rows: NaturalIdRow[],
  ): NaturalIdEntry[] {
    return rows
      .filter(row => row.naturalId != null)
      .map(row => ({type, naturalId: Number(row.naturalId)}));
  }
}
