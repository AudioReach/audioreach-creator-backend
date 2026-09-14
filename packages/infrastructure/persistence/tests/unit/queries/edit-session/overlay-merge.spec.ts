/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {OverlayMergeImpl} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/overlay-merge.js';
import {FieldPathReducer} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/field-path-reducer.js';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import type {EditActionRow} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';

type TestRow = {systemId: number; alias: string; instanceId: number};

function makeRow(
  overrides: Partial<EditActionRow> & {
    targetSystemId: number;
    newValue: unknown;
  },
): EditActionRow {
  return {
    changeId: 1,
    sessionId: 1,
    aggregateId: 10,
    targetSystemId: overrides.targetSystemId,
    targetTable: 'SpfModule',
    operation: CHANGE_OPERATION.Update,
    fieldPath: null,
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    linkedEntityGroupId: null,
    groupId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    validUntil: null,
    ...overrides,
  } as unknown as EditActionRow;
}

describe('OverlayMergeImpl', () => {
  let overlay: OverlayMergeImpl;

  beforeEach(() => {
    overlay = new OverlayMergeImpl(new FieldPathReducer());
  });

  describe('applyToSingle — single UPDATE', () => {
    it('merges pending field, records old value in diffEntries, pendingChangeStatus = STAGED', () => {
      const base: TestRow = {systemId: 100, alias: 'original', instanceId: 5};
      const row = makeRow({
        changeId: 42,
        targetSystemId: 100,
        fieldPath: 'alias',
        newValue: 'updated',
        linkedEntityGroupId: null,
      });

      const result = overlay.applyToSingle<TestRow>(base, [row]);

      expect(result).not.toBeNull();
      expect(result!.effective.alias).toBe('updated');
      expect(result!.effective.instanceId).toBe(5);
      expect(result!.diffEntries).toHaveLength(1);
      expect(result!.diffEntries[0].fieldName).toBe('alias');
      expect(result!.diffEntries[0].oldValue).toBe('original');
      expect(result!.diffEntries[0].newValue).toBe('updated');
      expect(result!.pendingChangeStatus).toBe('STAGED');
      expect(result!.operation).toBe('UPDATE');
    });
  });

  describe('applyToSingle — multi-field accumulation', () => {
    it('two successive rows on same entity → both fields in effective, two diffEntries', () => {
      const base: TestRow = {systemId: 100, alias: 'original', instanceId: 1};
      const row1 = makeRow({
        changeId: 1,
        targetSystemId: 100,
        fieldPath: 'alias',
        newValue: 'first-update',
        createdAt: new Date('2026-01-01T00:00:01Z'),
      });
      const row2 = makeRow({
        changeId: 2,
        targetSystemId: 100,
        fieldPath: 'instanceId',
        newValue: 99,
        createdAt: new Date('2026-01-01T00:00:02Z'),
      });

      const result = overlay.applyToSingle<TestRow>(base, [row1, row2]);

      expect(result).not.toBeNull();
      expect(result!.effective.alias).toBe('first-update');
      expect(result!.effective.instanceId).toBe(99);
      expect(result!.diffEntries).toHaveLength(2);
      expect(result!.diffEntries.map(e => e.fieldName)).toContain('alias');
      expect(result!.diffEntries.map(e => e.fieldName)).toContain('instanceId');
    });
  });

  describe('applyToSingle — CREATE with null base', () => {
    it('effective row exists, operation = CREATE', () => {
      const row = makeRow({
        changeId: 10,
        targetSystemId: 200,
        fieldPath: '$',
        operation: CHANGE_OPERATION.Create,
        newValue: {systemId: 200, alias: 'new-entity', instanceId: 7},
        changeStatus: CHANGE_STATUS.Staged,
      });

      const result = overlay.applyToSingle<TestRow>(null, [row]);

      expect(result).not.toBeNull();
      expect(result!.effective.systemId).toBe(200);
      expect(result!.effective.alias).toBe('new-entity');
      expect(result!.operation).toBe('CREATE');
      expect(result!.pendingChangeStatus).toBe('STAGED');
    });
  });

  describe('applyToSingle — DELETE', () => {
    it('base exists, DELETE row → returns null (tombstone)', () => {
      const base: TestRow = {systemId: 100, alias: 'to-delete', instanceId: 3};
      const row = makeRow({
        changeId: 20,
        targetSystemId: 100,
        fieldPath: null,
        operation: CHANGE_OPERATION.Delete,
        newValue: null,
      });

      expect(overlay.applyToSingle<TestRow>(base, [row])).toBeNull();
    });
  });

  describe('applyToSingle — CREATE then DELETE', () => {
    it('returns null when CREATE row is followed by DELETE row', () => {
      const createRow = makeRow({
        changeId: 1,
        targetSystemId: 300,
        fieldPath: '$',
        operation: CHANGE_OPERATION.Create,
        newValue: {systemId: 300, alias: 'transient', instanceId: 0},
        createdAt: new Date('2026-01-01T00:00:01Z'),
      });
      const deleteRow = makeRow({
        changeId: 2,
        targetSystemId: 300,
        fieldPath: null,
        operation: CHANGE_OPERATION.Delete,
        newValue: null,
        createdAt: new Date('2026-01-01T00:00:02Z'),
      });

      expect(
        overlay.applyToSingle<TestRow>(null, [createRow, deleteRow]),
      ).toBeNull();
    });
  });

  describe('applyToSingle — effective collection invariants', () => {
    it('returns null for an absent baseline with UPDATE-only actions', () => {
      expect(
        overlay.applyToSingle<TestRow>(null, [
          makeRow({
            targetSystemId: 40,
            fieldPath: 'alias',
            newValue: 'orphan',
          }),
        ]),
      ).toBeNull();
    });

    it('rejects an action-only CREATE outside immutable scope', () => {
      const result = overlay.applyToSingle<TestRow>(
        null,
        [
          makeRow({
            targetSystemId: 41,
            operation: CHANGE_OPERATION.Create,
            fieldPath: '$',
            newValue: {fileSystemId: 8, alias: 'wrong-file', instanceId: 1},
          }),
        ],
        {matchesEffective: row => row.fileSystemId === 7},
      );

      expect(result).toBeNull();
    });

    it('evaluates the final predicate after applying an UPDATE', () => {
      const result = overlay.applyToSingle<TestRow>(
        {systemId: 42, alias: 'before', instanceId: 1},
        [
          makeRow({
            targetSystemId: 42,
            fieldPath: 'alias',
            newValue: 'after',
          }),
        ],
        {matchesEffective: row => row.alias === 'after'},
      );

      expect(result?.effective.alias).toBe('after');
    });

    it('returns null when the final predicate rejects an effective row', () => {
      expect(
        overlay.applyToSingle<TestRow>(
          {systemId: 43, alias: 'before', instanceId: 1},
          [],
          {matchesEffective: row => row.alias === 'after'},
        ),
      ).toBeNull();
    });
  });

  describe('applyToSingle — pendingChangeStatus', () => {
    it('mix of STAGED + UNSTAGED rows → PARTIAL', () => {
      const base: TestRow = {systemId: 100, alias: 'base', instanceId: 1};
      const staged = makeRow({
        changeId: 1,
        targetSystemId: 100,
        fieldPath: 'alias',
        newValue: 'staged',
        changeStatus: CHANGE_STATUS.Staged,
        createdAt: new Date('2026-01-01T00:00:01Z'),
      });
      const unstaged = makeRow({
        changeId: 2,
        targetSystemId: 100,
        fieldPath: 'instanceId',
        newValue: 42,
        changeStatus: CHANGE_STATUS.Unstaged,
        createdAt: new Date('2026-01-01T00:00:02Z'),
      });

      expect(
        overlay.applyToSingle<TestRow>(base, [staged, unstaged])!
          .pendingChangeStatus,
      ).toBe('PARTIAL');
    });

    it('all UNSTAGED rows → UNSTAGED', () => {
      const base: TestRow = {systemId: 100, alias: 'base', instanceId: 1};
      const row = makeRow({
        changeId: 1,
        targetSystemId: 100,
        fieldPath: 'alias',
        newValue: 'unstaged',
        changeStatus: CHANGE_STATUS.Unstaged,
      });

      expect(
        overlay.applyToSingle<TestRow>(base, [row])!.pendingChangeStatus,
      ).toBe('UNSTAGED');
    });
  });

  describe('applyToSingle — fold order', () => {
    it('later createdAt wins on same field even when passed in reverse order', () => {
      const base: TestRow = {systemId: 100, alias: 'original', instanceId: 1};
      const laterRow = makeRow({
        changeId: 2,
        targetSystemId: 100,
        fieldPath: 'alias',
        newValue: 'later-value',
        createdAt: new Date('2026-01-01T00:00:02Z'),
      });
      const earlierRow = makeRow({
        changeId: 1,
        targetSystemId: 100,
        fieldPath: 'alias',
        newValue: 'earlier-value',
        createdAt: new Date('2026-01-01T00:00:01Z'),
      });

      const result = overlay.applyToSingle<TestRow>(base, [
        laterRow,
        earlierRow,
      ]);

      expect(result!.effective.alias).toBe('later-value');
    });
  });

  describe('applyToCollection', () => {
    it('excludes a committed row when its effective row does not match', () => {
      const results = overlay.applyToCollection<TestRow>(
        [{systemId: 10, alias: 'hidden', instanceId: 1}],
        [],
        {matchesEffective: row => row.alias === 'visible'},
      );

      expect(results).toEqual([]);
    });

    it('filters a committed UPDATE using the completed effective row', () => {
      const results = overlay.applyToCollection<TestRow>(
        [{systemId: 10, alias: 'before', instanceId: 1}],
        [
          makeRow({
            targetSystemId: 10,
            fieldPath: 'alias',
            newValue: 'after',
          }),
        ],
        {matchesEffective: row => row.alias === 'after'},
      );

      expect(results.map(row => row.effective)).toEqual([
        {systemId: 10, alias: 'after', instanceId: 1},
      ]);
    });

    it('includes only an in-scope CREATE whose effective row matches', () => {
      const create = makeRow({
        targetSystemId: 20,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {fileSystemId: 7, alias: 'created', instanceId: 1},
      });

      const results = overlay.applyToCollection<TestRow>([], [create], {
        matchesEffective: row =>
          row.fileSystemId === 7 && row.alias === 'created',
      });

      expect(results.map(row => row.effective)).toEqual([
        {fileSystemId: 7, alias: 'created', instanceId: 1, systemId: 20},
      ]);
    });

    it('evaluates an action-only CREATE after subsequent UPDATEs are folded', () => {
      const create = makeRow({
        changeId: 1,
        targetSystemId: 22,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {fileSystemId: 7, alias: 'before', instanceId: 1},
        createdAt: new Date('2026-01-01T00:00:01Z'),
      });
      const update = makeRow({
        changeId: 2,
        targetSystemId: 22,
        fieldPath: 'alias',
        newValue: 'after',
        createdAt: new Date('2026-01-01T00:00:02Z'),
      });

      const results = overlay.applyToCollection<TestRow>([], [create, update], {
        matchesEffective: row =>
          row.fileSystemId === 7 && row.alias === 'after',
      });

      expect(results.map(row => row.effective)).toEqual([
        {fileSystemId: 7, alias: 'after', instanceId: 1, systemId: 22},
      ]);
    });

    it('excludes an action-only CREATE outside immutable scope', () => {
      const create = makeRow({
        targetSystemId: 21,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {fileSystemId: 8, alias: 'wrong-file', instanceId: 1},
      });

      expect(
        overlay.applyToCollection<TestRow>([], [create], {
          matchesEffective: row => row.fileSystemId === 7,
        }),
      ).toEqual([]);
    });

    it('ignores an action-only UPDATE without a CREATE', () => {
      const update = makeRow({
        targetSystemId: 30,
        fieldPath: 'alias',
        newValue: 'orphan',
      });

      expect(overlay.applyToCollection<TestRow>([], [update])).toEqual([]);
    });

    it('two entities, one with pending rows → both returned, only the pending one is modified', () => {
      const base1: TestRow = {
        systemId: 100,
        alias: 'entity-one',
        instanceId: 1,
      };
      const base2: TestRow = {
        systemId: 200,
        alias: 'entity-two',
        instanceId: 2,
      };
      const pendingRow = makeRow({
        changeId: 1,
        targetSystemId: 100,
        fieldPath: 'alias',
        newValue: 'entity-one-updated',
      });

      const results = overlay.applyToCollection<TestRow>(
        [base1, base2],
        [pendingRow],
      );

      expect(results).toHaveLength(2);
      const r1 = results.find(r => r.effective.systemId === 100)!;
      const r2 = results.find(r => r.effective.systemId === 200)!;
      expect(r1.effective.alias).toBe('entity-one-updated');
      expect(r1.diffEntries).toHaveLength(1);
      expect(r2.effective.alias).toBe('entity-two');
      expect(r2.diffEntries).toHaveLength(0);
    });

    it('DELETE row → entity excluded from output', () => {
      const base1: TestRow = {systemId: 100, alias: 'keep', instanceId: 1};
      const base2: TestRow = {systemId: 200, alias: 'delete-me', instanceId: 2};
      const deleteRow = makeRow({
        changeId: 1,
        targetSystemId: 200,
        operation: CHANGE_OPERATION.Delete,
        fieldPath: null,
        newValue: null,
      });

      const results = overlay.applyToCollection<TestRow>(
        [base1, base2],
        [deleteRow],
      );

      expect(results).toHaveLength(1);
      expect(results[0].effective.systemId).toBe(100);
    });

    it('CREATE row for entity absent from baseRows → virtual row appended to output', () => {
      const base1: TestRow = {systemId: 100, alias: 'existing', instanceId: 1};
      const createRow = makeRow({
        changeId: 5,
        targetSystemId: 999,
        fieldPath: '$',
        operation: CHANGE_OPERATION.Create,
        newValue: {systemId: 999, alias: 'brand-new', instanceId: 7},
      });

      const results = overlay.applyToCollection<TestRow>([base1], [createRow]);

      expect(results).toHaveLength(2);
      const newEntity = results.find(r => r.effective.systemId === 999)!;
      expect(newEntity.effective.alias).toBe('brand-new');
      expect(newEntity.operation).toBe('CREATE');
    });

    it('empty pending rows → base rows returned with empty diffEntries and no pendingChangeStatus', () => {
      const base1: TestRow = {systemId: 100, alias: 'entity', instanceId: 1};
      const results = overlay.applyToCollection<TestRow>([base1], []);
      expect(results).toHaveLength(1);
      expect(results[0].diffEntries).toHaveLength(0);
      expect(results[0].operation).toBe(CHANGE_OPERATION.None);
      expect(results[0].pendingChangeStatus).toBeUndefined();
    });
  });
});
