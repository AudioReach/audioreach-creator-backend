/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import type {
  TagDefinitionReadModel,
  TagKeyDefinitionReadModel,
} from '../../../ports/persistence/query-services/tag-definition/tag-definition-read-model.js';
import type {ValueDefinitionReadModel} from '../../../ports/persistence/query-services/key-value/key-value-definition-read-model.js';

export const TagValueDefinitionDtoSchema = z.object({
  systemId: z.string().describe('Unique system identifier for the value'),
  naturalId: z.number().int().describe('Value identifier'),
  name: z.string().describe('Value name'),
  description: z.string().optional().describe('Value description'),
});

export const TagKeyDefinitionDtoSchema = z.object({
  systemId: z.string().describe('Unique system identifier for the key'),
  naturalId: z.number().int().describe('Key identifier'),
  name: z.string().describe('Key name'),
  description: z.string().optional().describe('Key description'),
  cHeaderEnumValue: z
    .string()
    .describe('Tag key enum value for .c header file'),
  values: z
    .array(TagValueDefinitionDtoSchema)
    .describe('Value definitions for this key'),
});

export const TagDefinitionDtoSchema = z.object({
  systemId: z.string().describe('Unique system identifier for the tag'),
  naturalId: z.number().int().describe('Tag identifier'),
  name: z.string().describe('Tag name'),
  enumMember: z
    .string()
    .optional()
    .describe('Tag enum member for pseudo header file'),
  enumName: z
    .string()
    .optional()
    .describe('Tag enum name for pseudo header file'),
  keyDefinitions: z
    .array(TagKeyDefinitionDtoSchema)
    .optional()
    .describe('Key definitions for this tag'),
});

export type TagDefinitionDto = z.infer<typeof TagDefinitionDtoSchema>;

export function mapTagValue(
  v: ValueDefinitionReadModel,
): z.infer<typeof TagValueDefinitionDtoSchema> {
  return {
    systemId: String(v.systemId),
    naturalId: v.naturalId,
    name: v.name,
    description: v.description,
  };
}

export function mapTagKey(
  k: TagKeyDefinitionReadModel,
): z.infer<typeof TagKeyDefinitionDtoSchema> {
  return {
    systemId: String(k.keyDefinition.systemId),
    naturalId: k.keyDefinition.naturalId,
    name: k.keyDefinition.name,
    description: k.keyDefinition.description,
    cHeaderEnumValue: k.cHeaderTagEnumMemberName ?? '',
    values: k.keyDefinition.values.map(v => mapTagValue(v)),
  };
}

export function mapTagDefinition(t: TagDefinitionReadModel): TagDefinitionDto {
  return {
    systemId: String(t.systemId),
    naturalId: t.naturalId,
    name: t.name,
    enumMember: t.cHeaderEnumMember,
    enumName: t.cHeaderEnumName,
    keyDefinitions: t.keys.map(k => mapTagKey(k)),
  };
}
