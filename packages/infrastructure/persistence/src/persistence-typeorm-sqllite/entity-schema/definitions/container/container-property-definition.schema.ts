/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import type {ContainerPropertyDataRow} from '../../usecase-data/container/container-property-data.js';
import {EntitySchema} from 'typeorm';
import {PROPERTY_TYPE, type PropertyType} from '@arc/core';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface ContainerPropertyBase {
  systemId: number;
  fileSystemId: number;
  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  propertyType: PropertyType;
  elementsStructure: string; // JSON
}

export interface ContainerPropertyRow
  extends EntityBaseRow, ContainerPropertyBase {
  // Relations
  containerPropertyData?: ContainerPropertyDataRow[];
}

export const ContainerPropertyDefinitionSchema =
  new EntitySchema<ContainerPropertyRow>({
    name: 'ContainerProperty',
    tableName: 'container_property_definitions',
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
    },
    relations: {
      containerPropertyData: {
        type: 'one-to-many',
        target: 'ContainerPropertyData',
        inverseSide: 'containerProperty',
      },
    },
  });
