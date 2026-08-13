/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {PropertyDtoSchema} from '../../../../shared/dto/property-dto.js';
import type {SpfModuleReadModel} from '../../../ports/persistence/query-services/spf-module/spf-module-read-model.js';
import type {
  CkvReadModel,
  TkvReadModel,
  TagReadModel,
} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {DataPortReadModel} from '../../../ports/persistence/query-services/spf-module/ports/data-port-read-model.js';
import type {ControlPortReadModel} from '../../../ports/persistence/query-services/spf-module/ports/control-port-read-model.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {Result} from '../../../shared/result/result.js';

export const KeyInfoDtoSchema = z
  .object({
    keyId: z.number().describe('Key id'),
    name: z.string().describe('Key name'),
    systemId: z.string().describe('Key system identifier'),
  })
  .meta({id: 'KeyInfo'});

export type KeyInfoDto = z.infer<typeof KeyInfoDtoSchema>;

export const ValueInfoDtoSchema = z
  .object({
    valueId: z.number().describe('Value id'),
    name: z.string().describe('Value name'),
    systemId: z.string().describe('Value system identifier'),
  })
  .meta({id: 'ValueInfo'});

export type ValueInfoDto = z.infer<typeof ValueInfoDtoSchema>;

export const KeyValueInfoDtoSchema = z
  .object({
    key: KeyInfoDtoSchema.describe('Key information'),
    value: ValueInfoDtoSchema.describe('Value information'),
  })
  .meta({id: 'KeyValueInfo'});

export type KeyValueInfoDto = z.infer<typeof KeyValueInfoDtoSchema>;

export const KeyValuePairsInfoDtoSchema = z
  .object({
    keyValuePairs: z
      .array(KeyValueInfoDtoSchema)
      .describe('Collection of key-value pairs'),
    systemId: z.string().describe('The system identifier'),
  })
  .meta({id: 'KeyValuePairsInfo'});

export type KeyValuePairsInfoDto = z.infer<typeof KeyValuePairsInfoDtoSchema>;

export const SubsystemFilteredKeyValuePairsInfoDtoSchema = z
  .object({
    keyValuePairs: z
      .array(KeyValueInfoDtoSchema)
      .describe('Collection of key-value pairs'),
  })
  .meta({id: 'SubsystemFilteredKeyValuePairsInfo'});

export type SubsystemFilteredKeyValuePairsInfoDto = z.infer<
  typeof SubsystemFilteredKeyValuePairsInfoDtoSchema
>;

export const ParamInfoDtoSchema = z.object({
  paramId: z.number().describe('Parameter ID'),
  paramSystemId: z.string().describe('Parameter system ID'),
  name: z.string().describe('Parameter name'),
  description: z.string().describe('Parameter description'),
});

export type ParamInfoDto = z.infer<typeof ParamInfoDtoSchema>;

export const CkvDtoSchema = z.object({
  keyValuePairs: z
    .array(KeyValueInfoDtoSchema)
    .describe('Collection of key-value pairs'),
  systemId: z.string().describe('CKV system ID'),
  supportedParameters: z
    .array(ParamInfoDtoSchema)
    .describe('Supported parameters for this CKV'),
});

export const TkvDtoSchema = z.object({
  keyValuePairs: z
    .array(KeyValueInfoDtoSchema)
    .describe('Collection of key-value pairs'),
  systemId: z.string().describe('TKV system ID'),
  supportedParameters: z
    .array(ParamInfoDtoSchema)
    .describe('Supported parameters for this TKV'),
});

export const TagInfoDtoSchema = z.object({
  systemId: z.string().describe('Tag system ID'),
  tagId: z.number().describe('Tag ID'),
  tagName: z.string().describe('Tag name'),
  tkvs: z.array(TkvDtoSchema).describe('Tag key-values configuration'),
});

export const DataPortDtoSchema = z.object({
  systemId: z.string().describe('Port system ID'),
  id: z.number().int().describe('Port definition ID'),
  name: z.string().describe('Port name'),
  portIoType: z.enum(['Input', 'Output']).describe('Port IO type'),
  portType: z.enum(['Static', 'Dynamic']).describe('Port type'),
  totalLinksAtPort: z
    .number()
    .int()
    .describe('Number of active data links at this port'),
});

export const ControlPortDtoSchema = z.object({
  systemId: z.string().describe('Control port system ID'),
  id: z.number().int().describe('Control port definition ID'),
  name: z.string().describe('Component name'),
  portType: z.enum(['Static', 'Dynamic']).describe('Port type'),
  controlPortName: z.string().optional().describe('Control port name'),
  totalLinksAtPort: z
    .number()
    .int()
    .describe('Number of active control links at this port'),
  intents: z
    .array(
      z.object({
        id: z.number().int().describe('Intent ID'),
        name: z.string().optional().describe('Intent name'),
      }),
    )
    .describe('Control port intents'),
});

export const SpfModuleDtoSchema = z.object({
  systemId: z.string().describe('SPF module system ID'),
  id: z.number().int().describe('Module instance ID'),
  moduleId: z.number().int().describe('Module definition ID'),
  name: z.string().describe('Module name'),
  alias: z.string().describe('Module alias (user-defined label)'),
  parentSystemId: z
    .string()
    .optional()
    .describe('Parent subsystem system ID (for hierarchical modules)'),
  subgraphId: z.number().int().describe('Subgraph this module belongs to'),
  containerId: z.number().int().describe('Container this module belongs to'),
  maxInputPortsSupported: z.number().int().describe('Maximum input data ports'),
  maxOutputPortsSupported: z
    .number()
    .int()
    .describe('Maximum output data ports'),
  maxControlPortsSupported: z.number().int().describe('Maximum control ports'),
  dataPorts: z.array(DataPortDtoSchema).describe('Data port list'),
  controlPorts: z.array(ControlPortDtoSchema).describe('Control port list'),
  ckvs: z
    .array(CkvDtoSchema)
    .optional()
    .describe('Calibration key-values (present when include=ckvs)'),
  tags: z
    .array(TagInfoDtoSchema)
    .optional()
    .describe('Tag info (present when include=tags)'),
  properties: z
    .array(PropertyDtoSchema)
    .optional()
    .describe('Module instance properties'),
});

export type SpfModuleDto = z.infer<typeof SpfModuleDtoSchema>;
export type CkvDto = z.infer<typeof CkvDtoSchema>;
export type TkvDto = z.infer<typeof TkvDtoSchema>;
export type TagInfoDto = z.infer<typeof TagInfoDtoSchema>;
export type DataPortDto = z.infer<typeof DataPortDtoSchema>;
export type ControlPortDto = z.infer<typeof ControlPortDtoSchema>;

export function mapDataPort(p: DataPortReadModel): DataPortDto {
  return {
    systemId: String(p.systemId),
    id: p.portId,
    name: p.name ?? '',
    portIoType: p.portIoType === 'Input' ? 'Input' : 'Output',
    portType: p.isStatic ? 'Static' : 'Dynamic',
    totalLinksAtPort: p.totalLinksAtPort,
  };
}

export function mapControlPort(p: ControlPortReadModel): ControlPortDto {
  return {
    systemId: String(p.systemId),
    id: p.portId,
    name: p.name ?? '',
    portType: p.isStatic ? 'Static' : 'Dynamic',
    controlPortName: p.name ?? undefined,
    totalLinksAtPort: p.totalLinksAtPort,
    intents: p.allocatedIntents.map(i => ({id: i.intentId, name: i.name})),
  };
}

export function mapCkv(c: CkvReadModel): CkvDto {
  return {
    systemId: String(c.systemId),
    keyValuePairs: (c.keyValuePairs ?? [])
      .filter(kv => kv?.key && kv?.value)
      .map(kv => ({
        key: {
          keyId: kv.key.keyId,
          name: kv.key.name,
          systemId: String(kv.key.systemId),
        },
        value: {
          valueId: kv.value.valueId,
          name: kv.value.name,
          systemId: String(kv.value.systemId),
        },
      })),
    supportedParameters: [],
  };
}

export function mapTkv(t: TkvReadModel): TkvDto {
  return {
    systemId: String(t.systemId),
    keyValuePairs: (t.keyValuePairs ?? [])
      .filter(kv => kv?.key && kv?.value)
      .map(kv => ({
        key: {
          keyId: kv.key.keyId,
          name: kv.key.name,
          systemId: String(kv.key.systemId),
        },
        value: {
          valueId: kv.value.valueId,
          name: kv.value.name,
          systemId: String(kv.value.systemId),
        },
      })),
    supportedParameters: [],
  };
}

export function mapTagInfo(t: TagReadModel): TagInfoDto {
  return {
    systemId: String(t.systemId),
    tagId: t.tagId,
    tagName: t.tagName,
    tkvs: t.tkvs.map(tkv => mapTkv(tkv)),
  };
}

export function mapSpfModule(
  m: SpfModuleReadModel,
  ckvsResult?: Result<CkvReadModel[]>,
  tagsResult?: Result<TagReadModel[]>,
): SpfModuleDto {
  return {
    systemId: String(m.systemId),
    id: m.instanceId,
    moduleId: m.moduleId,
    name: m.name,
    alias: m.alias,
    parentSystemId: m.parentId != null ? String(m.parentId) : undefined,
    subgraphId: m.subgraphId,
    containerId: m.containerId,
    maxInputPortsSupported: m.maxInputPortsSupported,
    maxOutputPortsSupported: m.maxOutputPortsSupported,
    maxControlPortsSupported: m.maxControlPortsSupported,
    dataPorts: m.dataPorts.map(p => mapDataPort(p)),
    controlPorts: m.controlPorts.map(p => mapControlPort(p)),
    ...(ckvsResult?.kind === RESULT_KIND.Ok
      ? {ckvs: ckvsResult.data.map(c => mapCkv(c))}
      : {}),
    ...(tagsResult?.kind === RESULT_KIND.Ok
      ? {tags: tagsResult.data.map(t => mapTagInfo(t))}
      : {}),
  };
}
