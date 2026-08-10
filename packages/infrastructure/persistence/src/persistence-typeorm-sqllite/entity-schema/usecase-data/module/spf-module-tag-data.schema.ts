/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {BlobBytesConverter} from './helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from './helper/bytes-transformer.js';
import type {SpfModuleRow} from './spf-module.schema.js';
import type {SpfModuleParameterDefinitionRow} from '../../definitions/module/spf/spf-module-parameter-definition.schema.js';
import type {ValueDefinitionRow} from '../../definitions/key-value/value-definition.schema.js';
import type {TagDefinitionRow} from '../../definitions/tag-key-value/tag-definition.schema.js';
import {EntitySchema} from 'typeorm';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface ModuleTagIdMapBase {
  systemId: number;
  spfModuleSystemId: number;
  tagDefinitionSystemId: number;
}

export interface ModuleTagIdMapRow extends EntityBaseRow, ModuleTagIdMapBase {
  module?: SpfModuleRow;
  tagDefinition?: TagDefinitionRow;
  tkvs?: TkvRow[];
}

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface TkvBase {
  systemId: number;
  moduleTagIdMapSystemId: number;
  uiPersistence: Uint8Array | null;
}

export interface TkvRow extends EntityBaseRow, TkvBase {
  moduleTagIdMapRow?: ModuleTagIdMapRow;
  payloadCollection: TkvParameterPayloadRow[];
  values?: TkvValuesRow[];
}

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface TkvParameterPayloadBase {
  systemId: number;
  parameterSystemId: number;
  payload: Uint8Array | null;
  tkvSystemId: number;
}

export interface TkvParameterPayloadRow
  extends EntityBaseRow, TkvParameterPayloadBase {
  tkv?: TkvRow;
  spfParameter?: SpfModuleParameterDefinitionRow;
}

/** Composite-PK join table scalars — no systemId, not overlaid. */
export interface TkvValuesBase {
  tkvSystemId: number;
  valueDefSystemId: number;
}

export interface TkvValuesRow extends TkvValuesBase {
  tkv?: TkvRow;
  valueDef?: ValueDefinitionRow;
}

export const ModuleTagIdMapSchema = new EntitySchema<ModuleTagIdMapRow>({
  name: 'ModuleTagIdMap',
  tableName: 'module_tag_id_map',
  columns: {
    ...BaseColumnSchemaPart,
    spfModuleSystemId: {name: 'spf_module_system_id', type: 'integer'},
    tagDefinitionSystemId: {name: 'tag_definition_system_id', type: 'integer'},
  },
  relations: {
    module: {
      type: 'many-to-one',
      target: 'SpfModule',
      joinColumn: {
        name: 'spf_module_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    tagDefinition: {
      type: 'many-to-one',
      target: 'TagDefinition',
      joinColumn: {
        name: 'tag_definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    tkvs: {
      type: 'one-to-many',
      target: 'Tkv',
      inverseSide: 'moduleTagIdMapRow',
    },
  },
  indices: [
    {
      name: 'ix_module_tag_definition',
      columns: ['spfModuleSystemId', 'tagDefinitionSystemId'],
      unique: true,
    },
  ],
});

export const TkvSchema = (blobConverter: BlobBytesConverter) =>
  new EntitySchema<TkvRow>({
    name: 'Tkv',
    tableName: 'tkv',
    columns: {
      ...BaseColumnSchemaPart,
      moduleTagIdMapSystemId: {
        name: 'module_tag_id_map_system_id',
        type: 'integer',
      },
      uiPersistence: {
        name: 'ui_persistence',
        type: 'blob',
        nullable: true,
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      moduleTagIdMapRow: {
        type: 'many-to-one',
        target: 'ModuleTagIdMap',
        joinColumn: {
          name: 'module_tag_id_map_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      payloadCollection: {
        type: 'one-to-many',
        target: 'TkvParameterPayload',
        inverseSide: 'tkv',
      },
      values: {
        type: 'one-to-many',
        target: 'TkvValues',
        inverseSide: 'tkv',
      },
    },
    indices: [
      {
        name: 'idx_tkv_module_tag_id_map_system_id',
        columns: ['moduleTagIdMapSystemId'],
      },
    ],
  });

export const TkvParameterPayloadSchema = (blobConverter: BlobBytesConverter) =>
  new EntitySchema<TkvParameterPayloadRow>({
    name: 'TkvParameterPayload',
    tableName: 'tkv_parameter_payload',
    columns: {
      ...BaseColumnSchemaPart,
      parameterSystemId: {name: 'parameter_system_id', type: 'integer'},
      tkvSystemId: {name: 'tkv_system_id', type: 'integer'},
      payload: {
        type: 'blob',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      tkv: {
        type: 'many-to-one',
        target: 'Tkv',
        joinColumn: {name: 'tkv_system_id', referencedColumnName: 'systemId'},
        onDelete: 'CASCADE',
      },
      spfParameter: {
        type: 'many-to-one',
        target: 'SpfModuleParameterDefinition',
        joinColumn: {
          name: 'parameter_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'ix_tkv_parameter',
        columns: ['tkvSystemId', 'parameterSystemId'],
        unique: true,
      },
      {
        name: 'idx_tkv_parameter_payload_tkv_system_id',
        columns: ['tkvSystemId'],
      },
    ],
  });

export const TkvValuesSchema = new EntitySchema<TkvValuesRow>({
  name: 'TkvValues',
  tableName: 'tkv_values',
  columns: {
    tkvSystemId: {name: 'tkv_system_id', type: 'integer', primary: true},
    valueDefSystemId: {
      name: 'value_def_system_id',
      type: 'integer',
      primary: true,
    },
  },
  relations: {
    tkv: {
      type: 'many-to-one',
      target: 'Tkv',
      joinColumn: {name: 'tkv_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
    valueDef: {
      type: 'many-to-one',
      target: 'ValueDefinition',
      joinColumn: {
        name: 'value_def_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
  },
});
