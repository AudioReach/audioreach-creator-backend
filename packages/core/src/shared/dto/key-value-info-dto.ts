/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

export const KeyInfoDtoSchema = z
  .object({
    naturalId: z.number().describe('Key id'),
    name: z.string().describe('Key name'),
    systemId: z.string().describe('Key system identifier'),
  })
  .meta({id: 'KeyInfoDto'});

export type KeyInfoDto = z.infer<typeof KeyInfoDtoSchema>;

export const ValueInfoDtoSchema = z
  .object({
    naturalId: z.number().describe('Value id'),
    name: z.string().describe('Value name'),
    systemId: z.string().describe('Value system identifier'),
  })
  .meta({id: 'ValueInfoDto'});

export type ValueInfoDto = z.infer<typeof ValueInfoDtoSchema>;

export const KeyValueInfoDtoSchema = z
  .object({
    key: KeyInfoDtoSchema.describe('Key information'),
    value: ValueInfoDtoSchema.describe('Value information'),
  })
  .meta({id: 'KeyValueInfoDto'});

export type KeyValueInfoDto = z.infer<typeof KeyValueInfoDtoSchema>;
