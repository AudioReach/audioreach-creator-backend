/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, KeyDefinition} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import type {StepResult} from '../common/step-result.js';
import {
  KeyDefinitionSchema,
  type KeyDefinitionRow,
} from '../../../entity-schema/definitions/key-value/key-definition.schema.js';
import {
  ValueDefinitionSchema,
  type ValueDefinitionRow,
} from '../../../entity-schema/definitions/key-value/value-definition.schema.js';

function emptyStepResult(): StepResult {
  return {rawFailures: [], failedEntityIds: new Set()};
}

export class KeyDefinitionInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: KeyDefinition[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const keyBySystemId = new Map(items.map(k => [k.systemId, k]));

    const rootStep = await this.insertKeyDefinitions(items);
    const activeItems = items.filter(
      k => !rootStep.failedEntityIds.has(k.systemId),
    );

    const valuesStep = await this.insertValueDefinitions(activeItems);

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...valuesStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      keyBySystemId,
      key =>
        `KeyDefinition (keyId=${BinaryUtils.toHexString(key.keyId)}, name='${key.name}')`,
    );
  }

  private async insertKeyDefinitions(
    items: KeyDefinition[],
  ): Promise<StepResult> {
    const rows: InsertRow<KeyDefinitionRow>[] = items.map(key => ({
      systemId: key.systemId,
      keyId: key.keyId,
      fileSystemId: key.fileSystemId,
      name: key.name,
      description: key.description,
      isVoice: key.isVoice,
      isDynamic: key.isDynamic,
      isCalibrationKey: key.isCalibrationKey,
      isGraphKey: key.isGraphKey,
      specialityKeyValue:
        key.specialityKeyValue === undefined
          ? undefined
          : JSON.stringify(key.specialityKeyValue),
      cEnumMemberName: key.cHeaderAttributes?.keyEnumName,
      cEnumName: key.cHeaderAttributes?.keyEnumValue,
      calibrationEnumValue: key.cHeaderAttributes?.calibrationEnumValue,
      graphEnumValue: key.cHeaderAttributes?.graphEnumValue,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      KeyDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const key = items.find(k => k.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: key.systemId,
        entityLabel: 'KeyDefinition',
        failedRowJson: `(keyId=${BinaryUtils.toHexString(key.keyId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertValueDefinitions(
    items: KeyDefinition[],
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {key: KeyDefinition; valueId: number}
    >();

    const rows: InsertRow<ValueDefinitionRow>[] = items.flatMap(key =>
      key.values.map(vd => {
        const row: InsertRow<ValueDefinitionRow> = {
          systemId: vd.systemId,
          valueId: vd.valueId,
          name: vd.name,
          description: vd.description,
          enumValue: vd.enumValue,
          specialValue: vd.specialValue,
          keySystemId: key.systemId,
        };
        contextBySystemId.set(vd.systemId, {key, valueId: vd.valueId});
        return row;
      }),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ValueDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.key.systemId,
        entityLabel: 'ValueDefinition',
        failedRowJson: `(keyId=${BinaryUtils.toHexString(ctx.key.keyId)}, valueId=${BinaryUtils.toHexString(ctx.valueId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
