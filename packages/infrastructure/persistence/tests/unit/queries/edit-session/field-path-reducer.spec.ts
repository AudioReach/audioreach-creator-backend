/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {FieldPathReducer} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/field-path-reducer.js';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import type {EditActionRow} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';

function makeRow(
  overrides: Partial<EditActionRow> & {newValue: unknown},
): EditActionRow {
  return {
    changeId: 1,
    sessionId: 1,
    aggregateId: 10,
    targetSystemId: 100,
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
  } as EditActionRow;
}

describe('FieldPathReducer', () => {
  const reducer = new FieldPathReducer();

  describe('applyRow — scalar column path', () => {
    it('sets effective[fieldPath] = row.newValue for a simple column name', () => {
      const effective: Record<string, unknown> = {
        alias: 'original',
        instanceId: 5,
      };
      reducer.applyRow(
        effective,
        makeRow({fieldPath: 'alias', newValue: 'updated'}),
      );
      expect(effective['alias']).toBe('updated');
      expect(effective['instanceId']).toBe(5);
    });

    it('adds the field when not previously present', () => {
      const effective: Record<string, unknown> = {};
      reducer.applyRow(
        effective,
        makeRow({fieldPath: 'description', newValue: 'hello'}),
      );
      expect(effective['description']).toBe('hello');
    });
  });

  describe('applyRow — "$" whole-row path', () => {
    it('spreads all keys from newValue onto effective', () => {
      const effective: Record<string, unknown> = {alias: 'old', instanceId: 1};
      reducer.applyRow(
        effective,
        makeRow({
          fieldPath: '$',
          newValue: {alias: 'new', description: 'added'},
        }),
      );
      expect(effective['alias']).toBe('new');
      expect(effective['description']).toBe('added');
      expect(effective['instanceId']).toBe(1);
    });
  });

  describe('applyRow — null accumulator path', () => {
    it('spreads all keys from newValue, same as "$"', () => {
      const effective: Record<string, unknown> = {alias: 'old'};
      reducer.applyRow(
        effective,
        makeRow({fieldPath: null, newValue: {alias: 'merged', extra: 42}}),
      );
      expect(effective['alias']).toBe('merged');
      expect(effective['extra']).toBe(42);
    });
  });

  describe('applyRow — custom named group', () => {
    it('spreads all keys from newValue, same as "$"', () => {
      const effective: Record<string, unknown> = {alias: 'old'};
      reducer.applyRow(
        effective,
        makeRow({
          fieldPath: 'identity',
          newValue: {alias: 'from-group', tag: 'x'},
        }),
      );
      expect(effective['alias']).toBe('from-group');
      expect(effective['tag']).toBe('x');
    });
  });

  describe('applyRow — element path (deferred stub)', () => {
    it('throws with message containing the element path', () => {
      const row = makeRow({
        fieldPath: 'elements[gain]',
        newValue: {value: 3.0},
      });
      expect(() => reducer.applyRow({}, row)).toThrow(
        'Element-path fieldPath support is deferred to LLD6c',
      );
      expect(() => reducer.applyRow({}, row)).toThrow('elements[gain]');
    });

    it('throws for nested element paths', () => {
      const row = makeRow({
        fieldPath: 'elements[stereoEq].elements[left]',
        newValue: {},
      });
      expect(() => reducer.applyRow({}, row)).toThrow(
        'elements[stereoEq].elements[left]',
      );
    });
  });

  describe('deriveDiffEntries — scalar column path', () => {
    it('returns one DiffEntry with oldValue from baseRow and newValue from row', () => {
      const row = makeRow({
        changeId: 42,
        fieldPath: 'alias',
        newValue: 'updated',
        linkedEntityGroupId: 'xg-1',
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
      });
      const entries = reducer.deriveDiffEntries(row, {alias: 'original'});
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        fieldName: 'alias',
        oldValue: 'original',
        newValue: 'updated',
        changeId: 42,
        linkedEntityGroupId: 'xg-1',
      });
    });

    it('uses oldValue = null when field absent from baseRow', () => {
      const entries = reducer.deriveDiffEntries(
        makeRow({fieldPath: 'newField', newValue: 'hello'}),
        {},
      );
      expect(entries[0].oldValue).toBeNull();
    });

    it('uses oldValue = null when baseRow is null', () => {
      const entries = reducer.deriveDiffEntries(
        makeRow({fieldPath: 'alias', newValue: 'hello'}),
        null,
      );
      expect(entries[0].oldValue).toBeNull();
    });
  });

  describe('deriveDiffEntries — "$" path', () => {
    it('returns one DiffEntry per key in newValue', () => {
      const entries = reducer.deriveDiffEntries(
        makeRow({
          fieldPath: '$',
          newValue: {alias: 'new', description: 'added'},
        }),
        {alias: 'old'},
      );
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.fieldName === 'alias')?.oldValue).toBe('old');
      expect(
        entries.find(e => e.fieldName === 'description')?.oldValue,
      ).toBeNull();
    });
  });

  describe('deriveDiffEntries — null accumulator path', () => {
    it('returns one DiffEntry per key, same as "$"', () => {
      const entries = reducer.deriveDiffEntries(
        makeRow({fieldPath: null, newValue: {alias: 'merged', extra: 99}}),
        {alias: 'old'},
      );
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.fieldName === 'alias')?.oldValue).toBe('old');
      expect(entries.find(e => e.fieldName === 'extra')?.oldValue).toBeNull();
    });
  });

  describe('deriveDiffEntries — element path (deferred stub)', () => {
    it('throws for element paths', () => {
      expect(() =>
        reducer.deriveDiffEntries(
          makeRow({fieldPath: 'elements[gain]', newValue: {}}),
          null,
        ),
      ).toThrow('Element-path fieldPath support is deferred to LLD6c');
    });
  });
});
