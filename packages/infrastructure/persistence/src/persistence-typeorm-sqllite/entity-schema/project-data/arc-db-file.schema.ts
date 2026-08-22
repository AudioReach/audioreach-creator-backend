/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../entity-base.js';
import type {ProjectRow} from './project.schema.js';
import type {ContainerRow} from '../usecase-data/container/container.schema.js';
import type {SpfModuleRow} from '../usecase-data/module/spf-module.schema.js';
import type {SubgraphRow} from '../usecase-data/subgraph/subgraph.schema.js';
import {EntitySchema} from 'typeorm';
import type {FileOpenStatus} from '@arc/core';

export interface ArcDbFileRow extends EntityBaseRow {
  description: string;
  metadata: string;
  fileName: string;
  isTarget: boolean;
  /**
   * Reservation high-water mark for composite ID generation.
   * Initial value = files.system_id (seq = 0, no entities yet).
   * Atomically incremented by EntityIdService.reserveBlock() to claim a
   * contiguous block of IDs. persistActual() reclaims the unused tail after
   * all inserts succeed, keeping this value tight.
   */
  lastReservedId: number;
  openStatus: FileOpenStatus;
  /** JSON array of ValidationIssue[] — null when no DATA_LOSS issues exist. */
  dataLossIssues: string | null;

  // ACDB Header Information (required - all ACDB files have headers)
  headerVersion: number;
  acdbVersionMajor: number;
  acdbVersionMinor: number;
  acdbVersionRevision: number;
  acdbVersionCplInfo: number;
  codecInfos: string;
  modifiedDate: number;
  oemInfo: string;

  // UI metadata extras (opaque pass-through JSON)
  uiSwitchesJson?: string;
  uiSrsMetadataJson?: string;

  // FK to project
  projectSystemId: number;
  project?: ProjectRow;

  // optional inverses (convenience for reads)
  subgraphs?: SubgraphRow[];
  containers?: ContainerRow[];
  modules?: SpfModuleRow[];
}

export const ArcDbFileSchema = new EntitySchema<ArcDbFileRow>({
  name: 'ArcDbFile',
  tableName: 'files',
  columns: {
    ...BaseColumnSchemaPart,
    systemId: {
      name: 'system_id',
      type: 'integer',
      primary: true,
      generated: 'increment',
    },
    description: {type: 'text'},
    metadata: {type: 'text'},
    fileName: {name: 'file_name', type: 'varchar', length: 250},
    isTarget: {type: 'integer'},
    lastReservedId: {
      name: 'last_reserved_id',
      type: 'integer',
      nullable: false,
      default: 0,
    },
    openStatus: {
      name: 'open_status',
      type: 'varchar',
      length: 30,
      nullable: false,
      default: 'LOADING',
    },
    dataLossIssues: {
      name: 'data_loss_issues',
      type: 'text',
      nullable: true,
    },

    // ACDB Header columns
    headerVersion: {
      name: 'header_version',
      type: 'integer',
      nullable: false,
      default: 0,
    },
    acdbVersionMajor: {
      name: 'acdb_version_major',
      type: 'integer',
      nullable: false,
      default: 0,
    },
    acdbVersionMinor: {
      name: 'acdb_version_minor',
      type: 'integer',
      nullable: false,
      default: 0,
    },
    acdbVersionRevision: {
      name: 'acdb_version_revision',
      type: 'integer',
      nullable: false,
      default: 0,
    },
    acdbVersionCplInfo: {
      name: 'acdb_version_cpl_info',
      type: 'integer',
      nullable: false,
      default: 0,
    },
    codecInfos: {
      name: 'codec_infos',
      type: 'text',
      nullable: false,
      default: '[]',
    },
    modifiedDate: {
      name: 'modified_date',
      type: 'integer',
      nullable: false,
      default: 0,
    },
    oemInfo: {
      name: 'oem_info',
      type: 'text',
      nullable: false,
      default: '',
    },

    uiSwitchesJson: {
      name: 'ui_switches_json',
      type: 'text',
      nullable: true,
    },
    uiSrsMetadataJson: {
      name: 'ui_srs_metadata_json',
      type: 'text',
      nullable: true,
    },

    projectSystemId: {name: 'project_system_id', type: 'integer'},
  },
  relations: {
    project: {
      type: 'many-to-one',
      target: 'Project',
      joinColumn: {name: 'project_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
    subgraphs: {type: 'one-to-many', target: 'Subgraph', inverseSide: 'file'},
    containers: {type: 'one-to-many', target: 'Container', inverseSide: 'file'},
    modules: {type: 'one-to-many', target: 'SpfModule', inverseSide: 'file'},
  },
  indices: [
    {
      name: 'uk_files_project_filename',
      columns: ['projectSystemId', 'fileName'],
      unique: true,
    },
  ],
});
