/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import type {BaseModuleDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/shared/module-definition-summary-read-model.js';

const DriverParameterSummaryInfoDtoSchema = z.object({
  systemId: z.string().describe('Unique system identifier for the param'),
  paramId: z.number().int().describe('Parameter identifier'),
  name: z.string().describe('Name of the parameter'),
  description: z.string().describe('Description of the parameter'),
  isReadOnly: z.boolean().describe('Indicates if the parameter is read-only'),
  toolPolicy: z.string().describe('Tool policy associated with the parameter'),
  pidType: z.string().describe('PID type of the parameter'),
});

export const DriverModuleDefinitionDtoSchema = z
  .object({
    systemId: z.string().describe('Unique system identifier for the module'),
    moduleId: z.number().int().describe('Module identifier'),
    name: z.string().describe('Module name'),
    displayName: z.string().describe('Display name of the module'),
    description: z.string().describe('Description of the module'),
    paramDefinitionsSummaryInfo: z
      .array(DriverParameterSummaryInfoDtoSchema)
      .describe('Array of parameter definitions'),
    deprecated: z.boolean().optional().describe('Deprecation flag'),
  })
  .describe('Driver module definition');

export type DriverModuleDefinitionDto = z.infer<
  typeof DriverModuleDefinitionDtoSchema
>;

function parseFirstToolPolicy(stored: string): string {
  const parsed: unknown = stored ? JSON.parse(stored) : [];
  const first: unknown = Array.isArray(parsed)
    ? (parsed as unknown[])[0]
    : undefined;
  return typeof first === 'string' ? first : 'Calibration';
}

export function mapDriverModuleDefinition(
  row: BaseModuleDefinitionSummaryReadModel,
): DriverModuleDefinitionDto {
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
      isReadOnly: p.isReadOnly ?? false,
      toolPolicy: parseFirstToolPolicy(p.toolPolicies ?? ''),
      pidType: p.pidType ?? '',
    })),
    deprecated: row.deprecated,
  };
}
