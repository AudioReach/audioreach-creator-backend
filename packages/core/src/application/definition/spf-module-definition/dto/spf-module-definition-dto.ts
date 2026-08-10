/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import type {SpfModuleDefinitionSummaryWithCustomData} from '../get-all/get-all-spf-module-definitions.handler.js';
import type {CustomModuleMetadataReadModel} from '../../../ports/persistence/query-services/spf-module-definition/custom-module-metadata-read-model.js';
import type {DataPortGroupReadModel} from '../../../ports/persistence/query-services/spf-module-definition/spf-module-definition-read-model.js';

// ── Data type sub-schema (mirrors DataTypeDto in API) ──────────────────────

const DataTypeDtoSchema = z.object({
  typeName: z.string().describe('Data type name'),
  sizeInBytes: z.number().int().describe('Size in bytes'),
  minValue: z.string().optional().describe('Minimum value'),
  maxValue: z.string().optional().describe('Maximum value'),
});

const DATA_TYPE_DEFINITIONS: Record<
  string,
  Omit<z.infer<typeof DataTypeDtoSchema>, 'typeName'>
> = {
  UINT8: {sizeInBytes: 1, minValue: '0', maxValue: '255'},
  UINT16: {sizeInBytes: 2, minValue: '0', maxValue: '65535'},
  UINT32: {sizeInBytes: 4, minValue: '0', maxValue: '4294967295'},
  UINT64: {sizeInBytes: 8, minValue: '0', maxValue: '18446744073709551615'},
  INT8: {sizeInBytes: 1, minValue: '-128', maxValue: '127'},
  INT16: {sizeInBytes: 2, minValue: '-32768', maxValue: '32767'},
  INT32: {sizeInBytes: 4, minValue: '-2147483648', maxValue: '2147483647'},
  INT64: {
    sizeInBytes: 8,
    minValue: '-9223372036854775808',
    maxValue: '9223372036854775807',
  },
  FLOAT: {
    sizeInBytes: 4,
    minValue: '-3.4028235e+38',
    maxValue: '3.4028235e+38',
  },
  DOUBLE: {
    sizeInBytes: 8,
    minValue: '-1.7976931348623157e+308',
    maxValue: '1.7976931348623157e+308',
  },
  STRING: {sizeInBytes: 0},
  BOOLEAN: {sizeInBytes: 1, minValue: 'false', maxValue: 'true'},
};

function createDataType(typeName: string): z.infer<typeof DataTypeDtoSchema> {
  return {typeName, ...(DATA_TYPE_DEFINITIONS[typeName] ?? {sizeInBytes: 0})};
}

// ── Sub-schemas ────────────────────────────────────────────────────────────

const NameValueDtoSchema = z.object({
  name: z.string().describe('Name field'),
  value: z.string().describe('Value field'),
  valueDataType: DataTypeDtoSchema.describe('Data type information'),
});

const SpfCustomModuleMetadataDtoSchema = z.object({
  type: NameValueDtoSchema.describe('Module type'),
  interface: z
    .object({
      type: NameValueDtoSchema.describe('Interface type'),
      version: NameValueDtoSchema.describe('Interface version'),
    })
    .describe('Selected interface'),
  fileName: z.string().describe('File name'),
  endPointFunctionTag: z.string().describe('Endpoint function tag'),
});

const ProcessorInfoDtoSchema = z
  .object({
    systemId: z.string().describe('Unique system identifier for the processor'),
    processorId: z.number().int().describe('Processor identifier'),
    name: z.string().describe('Processor name'),
  })
  .meta({id: 'ProcessorInfo'});

const ParameterDefinitionSummaryInfoDtoSchema = z
  .object({
    systemId: z.string().describe('Unique system identifier for the param'),
    paramId: z.number().int().describe('Parameter identifier'),
    name: z.string().describe('Name of the parameter'),
    description: z.string().describe('Description of the parameter'),
    isHidden: z.boolean().describe('Indicates if the parameter is hidden'),
    isReadOnly: z.boolean().describe('Indicates if the parameter is read-only'),
    deprecated: z
      .boolean()
      .optional()
      .describe('Indicates if the parameter is deprecated'),
    toolPolicy: z
      .string()
      .describe('Tool policy associated with the parameter'),
    pidType: z.string().describe('PID type of the parameter'),
  })
  .meta({id: 'ParameterDefinitionSummaryInfo'});

const IntentInfoDtoSchema = z
  .object({
    systemId: z.string().describe('Unique system identifier for the intent'),
    intentId: z.number().int().describe('Identifier of the intent'),
    name: z.string().describe('Name of the intent'),
    maxPorts: z
      .number()
      .int()
      .describe('Maximum number of ports for the intent'),
  })
  .meta({id: 'IntentInfo'});

const PortInfoDtoSchema = z
  .object({
    portId: z.number().int().describe('Unique identifier for the port'),
    portName: z.string().describe('Name of the port'),
  })
  .meta({id: 'PortInfo'});

const DataPortInfoDtoSchema = z
  .object({
    systemId: z.string().describe('Unique system identifier for the data port'),
    maxPorts: z.number().int().describe('Maximum number of ports'),
    ports: z.array(PortInfoDtoSchema).describe('Array of port information'),
  })
  .meta({id: 'DataPortInfo'});

const StaticCtrlPortInfoDtoSchema = z
  .object({
    systemId: z.string().describe('Unique system identifier for the ctrl port'),
    portId: z.number().int().describe('Unique identifier for the port'),
    portName: z.string().describe('Name of the port'),
    portIntents: z
      .array(IntentInfoDtoSchema)
      .describe('List of intent information for the port'),
  })
  .meta({id: 'StaticCtrlPortInfo'});

const ContainerTypeInfoDtoSchema = z
  .object({
    name: z.string().describe('Name'),
    value: z.string().describe('Value'),
  })
  .meta({id: 'ContainerTypeInfo'});

const ModuleInfoDtoSchema = z
  .object({
    pidFramework: z.number().int().describe('Framework PID'),
    stackSize: z.number().int().optional().describe('Optional stack size'),
    containerTypeInfo: z
      .array(ContainerTypeInfoDtoSchema)
      .describe('List of container type information'),
    inputDataPortInfo: DataPortInfoDtoSchema.describe(
      'Input data port information',
    ),
    outputDataPortInfo: DataPortInfoDtoSchema.describe(
      'Output data port information',
    ),
    staticCtrlPorts: z
      .array(StaticCtrlPortInfoDtoSchema)
      .describe('Static control ports'),
    dynamicIntents: z.array(IntentInfoDtoSchema).describe('Dynamic intents'),
  })
  .meta({id: 'ModuleInfo'});

// ── Main schema ─────────────────────────────────────────────────────────────

export const SpfModuleDefinitionDtoSchema = z
  .object({
    systemId: z.string().describe('Unique system identifier for the module'),
    moduleId: z.number().int().describe('Module identifier'),
    name: z.string().describe('Module name'),
    displayName: z.string().describe('Display name of the module'),
    description: z.string().describe('Description of the module'),
    paramDefinitionsSummaryInfo: z
      .array(ParameterDefinitionSummaryInfoDtoSchema)
      .describe('Array of parameter definitions'),
    deprecated: z.boolean().optional().describe('Deprecation flag'),
    processorInfo: ProcessorInfoDtoSchema.describe('Processor information'),
    modSearchKeys: z.string().describe('Search keys for the module'),
    isOffloadable: z
      .boolean()
      .optional()
      .describe('Indicates if the module is offloadable'),
    builtIn: z.boolean().describe('Indicates if the module is built-in'),
    vocoderModuleType: z.string().optional().describe('Vocoder module type'),
    moduleDirectionType: z
      .string()
      .optional()
      .describe('Direction type of the module'),
    moduleInfo: ModuleInfoDtoSchema.describe('Module information'),
    isLoadedAtBootup: z
      .boolean()
      .describe('Indicates if the module is loaded at bootup'),
    isCustomModule: z
      .boolean()
      .describe('Indicates if the module is a custom module'),
    customModuleData: SpfCustomModuleMetadataDtoSchema.optional()
      .nullable()
      .describe('Custom module data'),
  })
  .describe('SPF module definition');

export type SpfModuleDefinitionDto = z.infer<
  typeof SpfModuleDefinitionDtoSchema
>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFirstToolPolicy(stored: string): string {
  const parsed: unknown = stored ? JSON.parse(stored) : [];
  const first: unknown = Array.isArray(parsed)
    ? (parsed as unknown[])[0]
    : undefined;
  return typeof first === 'string' ? first : 'Calibration';
}

function mapDataPortGroup(
  group: DataPortGroupReadModel | null,
): z.infer<typeof DataPortInfoDtoSchema> {
  return {
    systemId: group ? String(group.systemId) : '',
    maxPorts: group?.maxAllowedPortCount ?? 0,
    ports: (group?.ports ?? []).map(p => ({
      portId: p.dataPortId,
      portName: p.name,
    })),
  };
}

function mapCustomModuleMetadata(
  m: CustomModuleMetadataReadModel,
): z.infer<typeof SpfCustomModuleMetadataDtoSchema> {
  return {
    type: {
      name: m.type.name,
      value: m.type.value,
      valueDataType: createDataType('UINT32'),
    },
    interface: {
      type: {
        name: m.interface.type.name,
        value: m.interface.type.value,
        valueDataType: createDataType('UINT16'),
      },
      version: {
        name: m.interface.version.name,
        value: m.interface.version.value,
        valueDataType: createDataType('UINT16'),
      },
    },
    fileName: m.fileName,
    endPointFunctionTag: m.endPointFunctionTag,
  };
}

// ── Main mapper ──────────────────────────────────────────────────────────────

export function mapSpfModuleDefinition(
  row: SpfModuleDefinitionSummaryWithCustomData,
): SpfModuleDefinitionDto {
  return {
    systemId: String(row.systemId),
    moduleId: row.moduleId,
    name: row.name,
    displayName: row.displayName ?? '',
    description: row.description ?? '',
    paramDefinitionsSummaryInfo: row.parameterDefinitions.map(p => ({
      systemId: String(p.systemId),
      paramId: p.paramId,
      name: p.name ?? '',
      description: p.description ?? '',
      isHidden: p.isHidden,
      isReadOnly: p.isReadOnly ?? false,
      deprecated: p.deprecated,
      toolPolicy: parseFirstToolPolicy(p.toolPolicies),
      pidType: p.pidType ?? '',
    })),
    deprecated: row.deprecated,
    processorInfo: {
      systemId: String(row.processorInfo.systemId),
      processorId: row.processorInfo.processorId,
      name: row.processorInfo.name,
    },
    modSearchKeys: row.modSearchKeys ?? '',
    isOffloadable: row.isOffloadable,
    builtIn: row.builtIn ?? false,
    vocoderModuleType: row.vocoderModuleType,
    moduleDirectionType: row.moduleDirectionType,
    moduleInfo: {
      pidFramework: row.moduleInfo.pidFramework,
      stackSize: row.moduleInfo.stackSize,
      containerTypeInfo: row.moduleInfo.containerTypeInfo.map(ct => ({
        name: ct.name,
        value: ct.value,
      })),
      inputDataPortInfo: mapDataPortGroup(row.moduleInfo.inputDataPortInfo),
      outputDataPortInfo: mapDataPortGroup(row.moduleInfo.outputDataPortInfo),
      staticCtrlPorts: row.moduleInfo.staticCtrlPorts.map(p => ({
        systemId: String(p.systemId),
        portId: p.portId,
        portName: p.portName,
        portIntents: (p.staticIntents ?? []).map(i => ({
          systemId: String(i.systemId),
          intentId: i.intentId,
          name: i.name,
          maxPorts: 0,
        })),
      })),
      dynamicIntents: row.moduleInfo.dynamicIntents.map(d => ({
        systemId: String(d.systemId),
        intentId: d.intentId,
        name: d.name,
        maxPorts: d.maxPort,
      })),
    },
    isLoadedAtBootup: row.isLoadedAtBootup,
    isCustomModule: row.isCustomModule,
    customModuleData: row.customModuleData
      ? mapCustomModuleMetadata(row.customModuleData)
      : undefined,
  };
}
