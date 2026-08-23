/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {PropertyDtoSchema} from '../../../../shared/dto/property-dto.js';
import type {PropertyDto} from '../../../../shared/dto/property-dto.js';

// Suppress unused-import warning for PropertyDtoSchema — kept for backwards-compat re-exports
void PropertyDtoSchema;
void (undefined as unknown as PropertyDto);

const IntentItemSchema = z.object({
  id: z.number().int().describe('Intent numeric ID'),
  name: z.string().describe('Intent name'),
});

export const ControlLinkPropertiesDtoSchema = z.object({
  AllocatedIntents: z.object({
    propId: z.number().int().describe('Property ID (0x08001062)'),
    propName: z.string().describe('Property name'),
    intents: z.array(IntentItemSchema).describe('Allocated intent IDs on the port'),
  }).describe('Allocated intents on the link’s ports'),
  SupportedIntents: z.object({
    propId: z.number().int().describe('Property ID (0x08001062)'),
    propName: z.string().describe('Property name'),
    intents: z.array(IntentItemSchema).describe('Union of supported intents from all module endpoints in chain'),
  }).optional().describe('Supported intents — present only when at least one module endpoint exists in the path'),
  HeapId: z.object({
    propId: z.number().int().describe('Property ID (0x0800136f)'),
    propName: z.string().describe('Property name'),
    heapId: z.number().int().describe('Current heap ID value'),
  }).describe('Heap ID property'),
}).describe('Control link property data');

export type ControlLinkPropertiesDto = z.infer<typeof ControlLinkPropertiesDtoSchema>;
