/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  SpfModuleDtoSchema,
  mapDataPort,
  mapControlPort,
} from '../../spf-module/query/spf-module-dto.js';
import type {ComponentsReadModel} from '../../../ports/persistence/query-services/usecase/query-models/components-read-model.js';
import type {SpfModuleReadModel} from '../../../ports/persistence/query-services/spf-module/spf-module-read-model.js';
import type {DataLinkReadModel} from '../../../ports/persistence/query-services/link/data-link-read-model.js';
import type {ControlLinkReadModel} from '../../../ports/persistence/query-services/link/control-link-read-model.js';
import type {
  ComponentsWithSubsystemsReadModel,
  SubsystemNodeReadModel,
} from '../get-component-with-subsystem/components-with-subsystems-read-model.js';

export const DataLinkDtoSchema = z.object({
  systemId: z.string().describe('Data link system ID'),
  id: z.number().int().describe('Data link ID'),
  sourceId: z.number().int().describe('Source component system ID'),
  sourcePortId: z.number().int().describe('Source port system ID'),
  destinationId: z.number().int().describe('Destination component system ID'),
  destinationPortId: z.number().int().describe('Destination port system ID'),
  isDangling: z.boolean().describe('Whether the link is dangling'),
  connectionType: z.string().describe('Connection type (MODULE_MODULE)'),
  parentId: z.number().int().optional().describe('Parent component system ID'),
});

export const ControlLinkDtoSchema = z.object({
  systemId: z.string().describe('Control link system ID'),
  id: z.number().int().describe('Control link ID'),
  sourceId: z.number().int().describe('Source (peer A) component system ID'),
  sourcePortId: z.number().int().describe('Source (peer A) port system ID'),
  destinationId: z
    .number()
    .int()
    .describe('Destination (peer B) component system ID'),
  destinationPortId: z
    .number()
    .int()
    .describe('Destination (peer B) port system ID'),
  isDangling: z.boolean().describe('Whether the link is dangling'),
  connectionType: z.string().describe('Connection type (MODULE_MODULE)'),
  parentId: z.number().int().optional().describe('Parent component system ID'),
});

export type DataLinkDto = z.infer<typeof DataLinkDtoSchema>;
export type ControlLinkDto = z.infer<typeof ControlLinkDtoSchema>;

export const ComponentCollectionDtoSchema = z.object({
  spfModules: z
    .array(SpfModuleDtoSchema.omit({properties: true}))
    .describe('SPF modules in the collection'),
  dataLinks: z.array(DataLinkDtoSchema).describe('Data links'),
  controlLinks: z.array(ControlLinkDtoSchema).describe('Control links'),
});

export type ComponentCollectionDto = z.infer<
  typeof ComponentCollectionDtoSchema
>;

// ── Subsystem tree schema ────────────────────────────────────────────────────

const FilteredKeyDtoSchema = z.object({
  systemId: z.string().describe('Key system ID'),
  keyId: z.number().int().describe('Key definition ID'),
  name: z.string().describe('Key name'),
  description: z.string().optional().describe('Key description'),
});

// Forward-declared type for mutual recursion in the subsystem tree
export type SubsystemNodeDto = {
  systemId: number;
  name: string;
  filteredKeys: z.infer<typeof FilteredKeyDtoSchema>[];
  children: ComponentCollectionWithSubsystemsDto;
};

export type ComponentCollectionWithSubsystemsDto = ComponentCollectionDto & {
  subsystems: SubsystemNodeDto[];
};

export const SubsystemNodeDtoSchema: z.ZodType<SubsystemNodeDto> = z.lazy(() =>
  z.object({
    systemId: z.number().int().describe('Subsystem system ID'),
    name: z.string().describe('Subsystem name'),
    filteredKeys: z
      .array(FilteredKeyDtoSchema)
      .describe('Keys filtered by this subsystem'),
    children: ComponentCollectionWithSubsystemsDtoSchema,
  }),
);

export const ComponentCollectionWithSubsystemsDtoSchema: z.ZodType<ComponentCollectionWithSubsystemsDto> =
  z.lazy(() =>
    ComponentCollectionDtoSchema.extend({
      subsystems: z
        .array(SubsystemNodeDtoSchema)
        .describe('Subsystem hierarchy'),
    }),
  );

// ── Mappers ──────────────────────────────────────────────────────────────────

const CONN_CTRL_TYPE_MODULE_MODULE = 'MODULE_MODULE';

export function mapSpfModuleForCollection(
  m: SpfModuleReadModel,
): Omit<z.infer<typeof SpfModuleDtoSchema>, 'properties'> {
  return {
    systemId: String(m.systemId),
    id: m.instanceId,
    moduleId: m.definitionSystemId,
    name: m.name,
    alias: m.alias,
    parentId: m.parentId,
    subgraphId: m.subgraphId,
    containerId: m.containerId,
    maxInputPortsSupported: m.maxInputPortsSupported,
    maxOutputPortsSupported: m.maxOutputPortsSupported,
    maxControlPortsSupported: m.maxControlPortsSupported,
    dataPorts: m.dataPorts.map(p => mapDataPort(p)),
    controlPorts: m.controlPorts.map(p => mapControlPort(p)),
  };
}

export function mapDataLink(
  l: DataLinkReadModel,
): z.infer<typeof DataLinkDtoSchema> {
  return {
    systemId: String(l.systemId),
    id: l.systemId,
    sourceId: l.sourceNodeSystemId,
    sourcePortId: l.sourcePortSystemId,
    destinationId: l.destinationNodeSystemId,
    destinationPortId: l.destinationPortSystemId,
    isDangling: false,
    connectionType: CONN_CTRL_TYPE_MODULE_MODULE,
    parentId: undefined,
  };
}

export function mapControlLink(
  l: ControlLinkReadModel,
): z.infer<typeof ControlLinkDtoSchema> {
  return {
    systemId: String(l.systemId),
    id: l.systemId,
    sourceId: l.peerNodeASystemId,
    sourcePortId: l.nodeAPortSystemId,
    destinationId: l.peerNodeBSystemId,
    destinationPortId: l.nodeBPortSystemId,
    isDangling: false,
    connectionType: CONN_CTRL_TYPE_MODULE_MODULE,
    parentId: undefined,
  };
}

export function mapComponentCollection(
  c: ComponentsReadModel,
): ComponentCollectionDto {
  return {
    spfModules: c.modules.map(m => mapSpfModuleForCollection(m)),
    dataLinks: c.dataLinks.map(l => mapDataLink(l)),
    controlLinks: c.controlLinks.map(l => mapControlLink(l)),
  };
}

function mapSubsystemNode(sub: SubsystemNodeReadModel): SubsystemNodeDto {
  return {
    systemId: sub.systemId,
    name: sub.name,
    filteredKeys: sub.filteredKeys.map(k => ({
      systemId: String(k.systemId),
      keyId: k.keyId,
      name: k.name,
      description: k.description,
    })),
    children: mapComponentCollectionWithSubsystems(sub.children),
  };
}

export function mapComponentCollectionWithSubsystems(
  c: ComponentsWithSubsystemsReadModel,
): ComponentCollectionWithSubsystemsDto {
  return {
    ...mapComponentCollection(c),
    subsystems: c.subsystems.map(sub => mapSubsystemNode(sub)),
  };
}
