/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {TagKeyDefLinkRow} from './tag-key-def-link.schema.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface TagDefinitionBase {
  systemId: number;
  tagId: number;
  name: string;
  description?: string;
  isVoice: boolean;
  cHeaderEnumName?: string;
  cHeaderEnumValue?: string;
  fileSystemId: number;
}

export interface TagDefinitionRow extends EntityBaseRow, TagDefinitionBase {
  // Relations
  keys?: TagKeyDefLinkRow[];
  file?: ArcDbFileRow;
}

export const TagDefinitionSchema = new EntitySchema<TagDefinitionRow>({
  name: 'TagDefinition',
  tableName: 'tag_definitions',
  columns: {
    ...BaseColumnSchemaPart,
    tagId: {
      type: 'integer',
      name: 'tag_id',
    },
    name: {
      type: 'varchar',
      length: 255,
      name: 'name',
    },
    description: {
      type: 'text',
      nullable: true,
      name: 'description',
    },
    isVoice: {
      type: 'boolean',
      name: 'is_voice',
    },
    cHeaderEnumName: {
      type: 'varchar',
      length: 255,
      nullable: true,
      name: 'c_header_enum_name',
    },
    cHeaderEnumValue: {
      type: 'varchar',
      length: 255,
      nullable: true,
      name: 'c_header_enum_value',
    },
    fileSystemId: {
      type: 'integer',
      name: 'file_system_id',
    },
  },
  relations: {
    keys: {
      type: 'one-to-many',
      target: 'TagKeyDefLink',
      inverseSide: 'tagDefinition',
      cascade: ['insert', 'update'],
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
  },
});
