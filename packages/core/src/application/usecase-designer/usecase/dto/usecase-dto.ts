/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import type {UseCaseReadModel} from '../../../ports/persistence/query-services/usecase/query-models/usecase-read-model.js';
import type {KeyValuePairReadModel} from '../../../ports/persistence/query-services/usecase/query-models/key-vector-read-model.js';

const KeyInfoDtoSchema = z.object({
  keyId: z.number().int().describe('Key id'),
  name: z.string().describe('Key name'),
  systemId: z.string().describe('Key system identifier'),
});

const ValueInfoDtoSchema = z.object({
  valueId: z.number().int().describe('Value id'),
  name: z.string().describe('Value name'),
  systemId: z.string().describe('Value system identifier'),
});

export const KeyValueInfoDtoSchema = z.object({
  key: KeyInfoDtoSchema.describe('Key information'),
  value: ValueInfoDtoSchema.describe('Value information'),
});

export const UseCaseDtoSchema = z.object({
  systemId: z.string().describe('System identifier of the usecase'),
  usecaseType: z.string().describe('Type of the usecase'),
  keyValuePairs: z
    .array(KeyValueInfoDtoSchema)
    .describe('Collection of key-value pairs'),
  usecaseAliasId: z
    .number()
    .int()
    .optional()
    .describe('Optional alias identifier for the usecase'),
  usecaseAliasName: z
    .string()
    .optional()
    .describe('Alias name for the usecase'),
  usecaseCategory: z.string().optional().describe('Category of the usecase'),
});

export type UseCaseDto = z.infer<typeof UseCaseDtoSchema>;

export const UsecaseIdentifierWithChangeInfoDtoSchema = UseCaseDtoSchema.extend(
  {
    changeId: z.string().describe('The changeId for this usecase'),
  },
);

export type UsecaseIdentifierWithChangeInfoDto = z.infer<
  typeof UsecaseIdentifierWithChangeInfoDtoSchema
>;

export const CreateUsecasesResponseDtoSchema = z.object({
  created: z
    .array(UsecaseIdentifierWithChangeInfoDtoSchema)
    .describe('Usecases created during reconciliation'),
  updated: z
    .array(UsecaseIdentifierWithChangeInfoDtoSchema)
    .describe('Usecases updated during reconciliation'),
  deleted: z
    .array(UsecaseIdentifierWithChangeInfoDtoSchema)
    .describe('Usecases deleted during reconciliation'),
});

export type CreateUsecasesResponseDto = z.infer<
  typeof CreateUsecasesResponseDtoSchema
>;

export const CreateManualUsecasesResponseDtoSchema = z.object({
  added: z
    .array(UsecaseIdentifierWithChangeInfoDtoSchema)
    .describe('Usecases added'),
});

export type CreateManualUsecasesResponseDto = z.infer<
  typeof CreateManualUsecasesResponseDtoSchema
>;

export function mapKeyValuePair(
  kv: KeyValuePairReadModel,
): z.infer<typeof KeyValueInfoDtoSchema> {
  return {
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
  };
}

export function mapUseCase(uc: UseCaseReadModel): UseCaseDto {
  return {
    systemId: String(uc.systemId),
    usecaseType: 'LINKED',
    keyValuePairs: uc.gkv.map(kv => mapKeyValuePair(kv)),
    usecaseAliasId: uc.aliasId,
    usecaseAliasName: uc.alias,
    usecaseCategory: uc.categories?.join(','),
  };
}
