/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {ProjectSessionRow} from './project-session.schema.js';
import type {EntityName} from '../entity-table-names.js';

export interface SessionEntityVersionRow {
  sessionId: number;
  targetTable: EntityName;
  targetSystemId: number;
  baseVersion: number;
  session?: ProjectSessionRow;
}

export const SessionEntityVersionSchema =
  new EntitySchema<SessionEntityVersionRow>({
    name: 'SessionEntityVersion',
    tableName: 'session_entity_versions',
    columns: {
      sessionId: {
        name: 'session_id',
        type: 'integer',
        primary: true,
      },
      targetTable: {
        name: 'target_table',
        type: 'varchar',
        length: 100,
        primary: true,
      },
      targetSystemId: {
        name: 'target_system_id',
        type: 'integer',
        primary: true,
      },
      baseVersion: {
        name: 'base_version',
        type: 'integer',
        nullable: false,
      },
    },
    relations: {
      session: {
        type: 'many-to-one',
        target: 'ProjectSession',
        joinColumn: {name: 'session_id'},
        onDelete: 'CASCADE',
      },
    },
  });
