/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {CHANGE_OPERATION, SOURCE} from '../../../shared/change-vocabulary.js';
import type {
  UsecaseChangeDetails,
  UsecaseChangeSnapshot,
} from '../../../ports/persistence/query-services/usecase/query-models/usecase-change-details-read-model.js';
import {
  ControlLinkDtoSchema,
  DataLinkDtoSchema,
  mapControlLink,
  mapDataLink,
} from './component-collection-dto.js';
import {KeyValueInfoDtoSchema, mapKeyValuePair} from './usecase-dto.js';

export const UsecaseChangeSnapshotDtoSchema = z.object({
  isEc: z.boolean().describe('Whether the usecase is an EC usecase'),
  gkv: z.array(KeyValueInfoDtoSchema).describe('Usecase graph key vector'),
  alias: z.string().nullable().describe('Usecase alias'),
  aliasId: z.number().int().nullable().describe('Usecase alias identifier'),
  categories: z.array(z.string()).describe('Usecase categories'),
  subgraphSystemIds: z
    .array(z.string())
    .describe('System identifiers of subgraphs in the usecase'),
  dataLinks: z.array(DataLinkDtoSchema).describe('Supporting data links'),
  controlLinks: z
    .array(ControlLinkDtoSchema)
    .describe('Supporting control links'),
});

export const UsecaseChangeDetailsDtoSchema = z.object({
  systemId: z.string().describe('Usecase system identifier'),
  changeId: z.string().describe('Canonical edit-action change identifier'),
  operation: z.enum([
    CHANGE_OPERATION.Create,
    CHANGE_OPERATION.Update,
    CHANGE_OPERATION.Delete,
  ]),
  source: z.enum([SOURCE.Manual, SOURCE.DiffTool, SOURCE.AutoRouting]),
  before: UsecaseChangeSnapshotDtoSchema.nullable(),
  after: UsecaseChangeSnapshotDtoSchema.nullable(),
});

export type UsecaseChangeSnapshotDto = z.infer<
  typeof UsecaseChangeSnapshotDtoSchema
>;
export type UsecaseChangeDetailsDto = z.infer<
  typeof UsecaseChangeDetailsDtoSchema
>;

function mapSnapshot(
  snapshot: UsecaseChangeSnapshot | null,
): UsecaseChangeSnapshotDto | null {
  if (snapshot === null) return null;
  return {
    isEc: snapshot.isEc,
    gkv: snapshot.gkv.map(pair => mapKeyValuePair(pair)),
    alias: snapshot.alias,
    aliasId: snapshot.aliasId,
    categories: [...snapshot.categories],
    subgraphSystemIds: snapshot.subgraphSystemIds.map(String),
    dataLinks: snapshot.dataLinks.map(link => mapDataLink(link)),
    controlLinks: snapshot.controlLinks.map(link => mapControlLink(link)),
  };
}

export function mapUsecaseChangeDetails(
  change: UsecaseChangeDetails,
): UsecaseChangeDetailsDto {
  return {
    systemId: String(change.systemId),
    changeId: String(change.changeId),
    operation: change.operation,
    source: change.source,
    before: mapSnapshot(change.before),
    after: mapSnapshot(change.after),
  };
}
