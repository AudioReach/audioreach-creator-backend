/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import type {ContainerPropertyDataRow} from '../../usecase-data/container/container-property-data.js';
import {EntitySchema} from 'typeorm';

export interface ContainerPropertyRow extends EntityBaseRow {
  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  propertyStructure: string; // JSON

  // Relations
  containerPropertyData?: ContainerPropertyDataRow[];
}

export const ContainerPropertyDefinitionSchema =
  new EntitySchema<ContainerPropertyRow>({
    name: 'ContainerProperty',
    tableName: 'container_property_definitions',
    columns: {
      ...BaseColumnSchemaPart,
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
      propertyStructure: {
        type: 'text',
        name: 'property_structure',
      },
    },
    relations: {
      containerPropertyData: {
        type: 'one-to-many',
        target: 'ContainerPropertyData',
        inverseSide: 'containerProperty',
      },
    },
  });
