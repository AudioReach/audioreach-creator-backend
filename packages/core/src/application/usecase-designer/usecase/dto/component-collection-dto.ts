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
  sourceSystemId: z.string().describe('Source component system ID'),
  sourcePortSystemId: z.string().describe('Source port system ID'),
  destinationSystemId: z.string().describe('Destination component system ID'),
  destinationPortSystemId: z.string().describe('Destination port system ID'),
  isInterUsecase: z.boolean().describe('Whether the link is inter-usecase'),
});

export const ControlLinkDtoSchema = z.object({
  systemId: z.string().describe('Control link system ID'),
  sourceSystemId: z.string().describe('Source (peer A) component system ID'),
  sourcePortSystemId: z.string().describe('Source (peer A) port system ID'),
  destinationSystemId: z
    .string()
    .describe('Destination (peer B) component system ID'),
  destinationPortSystemId: z
    .string()
    .describe('Destination (peer B) port system ID'),
  isInterUsecase: z.boolean().describe('Whether the link is inter-usecase'),
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
  systemId: string;
  name: string;
  filteredKeys: z.infer<typeof FilteredKeyDtoSchema>[];
  children: ComponentCollectionWithSubsystemsDto;
};

export type ComponentCollectionWithSubsystemsDto = ComponentCollectionDto & {
  subsystems: SubsystemNodeDto[];
};

export const SubsystemNodeDtoSchema: z.ZodType<SubsystemNodeDto> = z.lazy(() =>
  z.object({
    systemId: z.string().describe('Subsystem system ID'),
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

export function mapSpfModuleForCollection(
  m: SpfModuleReadModel,
): Omit<z.infer<typeof SpfModuleDtoSchema>, 'properties'> {
  return {
    systemId: String(m.systemId),
    id: m.instanceId,
    moduleId: m.definitionSystemId,
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
  };
}

export function mapDataLink(
  l: DataLinkReadModel,
): z.infer<typeof DataLinkDtoSchema> {
  return {
    systemId: String(l.systemId),
    sourceSystemId: String(l.sourceNodeSystemId),
    sourcePortSystemId: String(l.sourcePortSystemId),
    destinationSystemId: String(l.destinationNodeSystemId),
    destinationPortSystemId: String(l.destinationPortSystemId),
    isInterUsecase: false,
  };
}

export function mapControlLink(
  l: ControlLinkReadModel,
): z.infer<typeof ControlLinkDtoSchema> {
  return {
    systemId: String(l.systemId),
    sourceSystemId: String(l.peerNodeASystemId),
    sourcePortSystemId: String(l.nodeAPortSystemId),
    destinationSystemId: String(l.peerNodeBSystemId),
    destinationPortSystemId: String(l.nodeBPortSystemId),
    isInterUsecase: false,
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
    systemId: String(sub.systemId),
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
