/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {TagDefinitionRow} from './tag-definition.schema.js';
import type {KeyDefinitionRow} from '../key-value/key-definition.schema.js';

export interface TagKeyDefLinkRow extends EntityBaseRow {
  tagDefinitionSystemId: number;
  keyReferenceSystemId: number;
  tagEnumValue?: string;

  // Relations
  tagDefinition: TagDefinitionRow;
  keyDefinition?: KeyDefinitionRow;
}

export const TagKeyDefLinkSchema = new EntitySchema<TagKeyDefLinkRow>({
  name: 'TagKeyDefLink',
  tableName: 'tag_key_def_links',
  columns: {
    ...BaseColumnSchemaPart,
    tagDefinitionSystemId: {
      type: 'integer',
      name: 'tag_definition_system_id',
    },
    keyReferenceSystemId: {
      type: 'integer',
      name: 'key_reference_system_id',
    },
    tagEnumValue: {
      type: 'text',
      nullable: true,
      name: 'tag_enum_value',
    },
  },
  relations: {
    tagDefinition: {
      type: 'many-to-one',
      target: 'TagDefinition',
      joinColumn: {
        name: 'tag_definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    keyDefinition: {
      type: 'many-to-one',
      target: 'KeyDefinition',
      joinColumn: {
        name: 'key_reference_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'idx_tag_key_def_links_tag_def_id',
      columns: ['tagDefinitionSystemId'],
    },
  ],
});
