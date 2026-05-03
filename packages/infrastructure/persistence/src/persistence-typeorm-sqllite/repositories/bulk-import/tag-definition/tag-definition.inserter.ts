/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BulkInsertResult,
  IdGenerationPort,
  TagDefinition,
} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import type {StepResult} from '../common/step-result.js';
import {
  TagDefinitionSchema,
  type TagDefinitionRow,
} from '../../../entity-schema/definitions/tag-key-value/tag-definition.schema.js';
import {
  TagKeyDefLinkSchema,
  type TagKeyDefLinkRow,
} from '../../../entity-schema/definitions/tag-key-value/tag-key-def-link.schema.js';

export class TagDefinitionInserter {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async insert(items: TagDefinition[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const tagBySystemId = new Map(items.map(t => [t.systemId, t]));

    const rootStep = await this.insertTagDefinitions(items);
    const activeItems = items.filter(
      t => !rootStep.failedEntityIds.has(t.systemId),
    );

    const linksResult = await this.insertTagKeyDefLinks(activeItems);

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...linksResult.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      tagBySystemId,
      tag =>
        `TagDefinition (tagId=${BinaryUtils.toHexString(tag.tagId)}, name='${tag.name}')`,
    );
  }

  private async insertTagDefinitions(
    items: TagDefinition[],
  ): Promise<StepResult> {
    const rows: InsertRow<TagDefinitionRow>[] = items.map(tag => ({
      systemId: tag.systemId,
      tagId: tag.tagId,
      fileSystemId: tag.fileSystemId,
      name: tag.name,
      description: tag.description,
      isVoice: tag.isVoice,
      cHeaderEnumName: tag.cHeaderEnumName,
      cHeaderEnumValue: tag.cHEaderEnumValue,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      TagDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const tag = items.find(t => t.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: tag.systemId,
        entityLabel: 'TagDefinition',
        failedRowJson: `(tagId=${BinaryUtils.toHexString(tag.tagId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertTagKeyDefLinks(
    items: TagDefinition[],
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {tag: TagDefinition; keyReferenceSystemId: number}
    >();

    const rows: InsertRow<TagKeyDefLinkRow>[] = [];

    for (const tag of items) {
      for (const link of tag.keysAllowed) {
        const systemId = await this.idGeneration.getNextId(tag.fileSystemId);
        contextBySystemId.set(systemId, {
          tag,
          keyReferenceSystemId: link.keyReferenceSystemId,
        });
        rows.push({
          systemId,
          tagDefinitionSystemId: tag.systemId,
          keyReferenceSystemId: link.keyReferenceSystemId,
          tagEnumValue: link.tagEnumValue,
          tagDefinition:
            undefined as unknown as TagKeyDefLinkRow['tagDefinition'],
        });
      }
    }

    if (rows.length === 0) {
      return {rawFailures: [], failedEntityIds: new Set()};
    }

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      TagKeyDefLinkSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.tag.systemId,
        entityLabel: 'TagKeyDefLink',
        failedRowJson: `(tagId=${BinaryUtils.toHexString(ctx.tag.tagId)}, keyRef=${BinaryUtils.toHexString(ctx.keyReferenceSystemId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
