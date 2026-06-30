/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {SubsystemControlLinkSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/subsystem-control-link.schema.js';

type RelationOpts = {
  target: string;
  onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION' | 'DEFAULT';
  joinColumn?: {name?: string; referencedColumnName?: string};
};

describe('SubsystemControlLinkSchema (spec §11.3)', () => {
  const opts = SubsystemControlLinkSchema.options;
  const relations = opts.relations as Record<string, RelationOpts>;

  it('uses the entity name and table name from the spec', () => {
    expect(opts.name).toBe('SubsystemControlLink');
    expect(opts.tableName).toBe('subsystem_control_links');
  });

  it('declares all seven FK columns with the spec-required snake_case names', () => {
    const columns = opts.columns as Record<
      string,
      {name?: string; nullable?: boolean}
    >;
    expect(columns.peerNodeASystemId.name).toBe('peer_nodeA_system_id');
    expect(columns.peerNodeBSystemId.name).toBe('peer_nodeB_system_id');
    expect(columns.nodeAPortSystemId.name).toBe('nodeA_port_system_id');
    expect(columns.nodeBPortSystemId.name).toBe('nodeB_port_system_id');
    expect(columns.controlLinkSystemId.name).toBe('control_link_system_id');
    expect(columns.fileSystemId.name).toBe('file_system_id');
    expect(columns.version.name).toBe('version');
    expect(columns.version.nullable).not.toBe(true);
  });

  it('applies CASCADE on file, control-link and both peer-node FKs', () => {
    expect(relations.file.target).toBe('ArcDbFile');
    expect(relations.file.onDelete).toBe('CASCADE');
    expect(relations.controlLink.target).toBe('ControlLink');
    expect(relations.controlLink.onDelete).toBe('CASCADE');
    expect(relations.peerNodeA.target).toBe('Node');
    expect(relations.peerNodeA.onDelete).toBe('CASCADE');
    expect(relations.peerNodeB.target).toBe('Node');
    expect(relations.peerNodeB.onDelete).toBe('CASCADE');
  });

  it('applies RESTRICT on both control-port FKs (orphan cleanup §11.9 must delete SCL first)', () => {
    expect(relations.nodeAPort.target).toBe('ControlPort');
    expect(relations.nodeAPort.onDelete).toBe('RESTRICT');
    expect(relations.nodeBPort.target).toBe('ControlPort');
    expect(relations.nodeBPort.onDelete).toBe('RESTRICT');
  });

  it('declares all four indices required by the spec', () => {
    const indexNames = (opts.indices ?? []).map(i => i.name).sort();
    expect(indexNames).toEqual([
      'idx_scl_control_link',
      'idx_scl_file',
      'idx_scl_nodeA_port_file',
      'idx_scl_nodeB_port_file',
    ]);
  });
});
