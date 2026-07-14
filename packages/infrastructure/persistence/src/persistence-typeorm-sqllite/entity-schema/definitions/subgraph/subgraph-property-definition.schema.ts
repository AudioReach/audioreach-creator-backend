/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';
import {PROPERTY_TYPE, type PropertyType} from '@arc/core';

export interface SubgraphPropertyRow extends EntityBaseRow {
  fileSystemId: number;
  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  propertyType: PropertyType;
  elementsStructure: string; // JSON
  isVoice: boolean;

  // Relations
}

export const SubgraphPropertyDefinitionSchema =
  new EntitySchema<SubgraphPropertyRow>({
    name: 'SubgraphProperty',
    tableName: 'subgraph_property_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      fileSystemId: {
        type: 'integer',
        name: 'file_system_id',
      },
      propertyId: {
        type: 'integer',
        name: 'property_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'name',
      },
      description: {
        type: 'text',
        nullable: true,
        name: 'description',
      },
      maxSize: {
        type: 'integer',
        name: 'max_size',
      },
      propertyType: {
        type: 'simple-enum',
        enum: Object.values(PROPERTY_TYPE),
        name: 'property_type',
      },
      elementsStructure: {
        type: 'text',
        name: 'elements_structure',
        nullable: true,
      },
      isVoice: {
        type: 'boolean',
        name: 'is_voice',
      },
    },
  });
