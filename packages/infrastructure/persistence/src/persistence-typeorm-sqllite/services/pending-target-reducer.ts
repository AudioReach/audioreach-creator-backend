/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  type ChangeOperation,
  type ChangeStatus as PendingChangeStatus,
  type Source,
} from '@arc/core';
import type {EditActionRow} from '../entity-schema/edit-session/edit-action.schema.js';
import type {EntityName} from '../entity-schema/entity-table-names.js';
import {getFieldCoverage} from '../queries/edit-session/field-path-reducer.js';

/** Stable error vocabulary returned by the pure edit-action reducer. */
export const EDIT_ACTION_REDUCER_ERROR_CODE = {
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  Integrity: 'INTEGRITY',
  Unsupported: 'UNSUPPORTED',
} as const;

export type EditActionReducerErrorCode =
  (typeof EDIT_ACTION_REDUCER_ERROR_CODE)[keyof typeof EDIT_ACTION_REDUCER_ERROR_CODE];

/** The complete natural identity of one pending target. */
export type EditActionTargetKey = {
  sessionId: number;
  targetTable: EntityName;
  targetSystemId: number;
};

/** A mutation submitted by a writer before persistence planning. */
export type EditActionMutationIntent =
  | {
      kind: typeof CHANGE_OPERATION.Create;
      aggregateId: number;
      source: Source;
      changeStatus: PendingChangeStatus;
      linkedEntityGroupId: string | null;
      newValue: Record<string, unknown>;
    }
  | {
      kind: typeof CHANGE_OPERATION.Update;
      aggregateId: number;
      fieldPath: string | null;
      source: Source;
      changeStatus: PendingChangeStatus;
      linkedEntityGroupId: string | null;
      newValue: Record<string, unknown>;
    }
  | {
      kind: typeof CHANGE_OPERATION.Delete;
      aggregateId: number;
      source: Source;
      changeStatus: PendingChangeStatus;
      linkedEntityGroupId: string | null;
    };

const REDUCER_WORKING_ROW_KIND = {
  Existing: 'existing',
  Inserted: 'inserted',
} as const;

/**
 * State input for reducing one target.
 *
 * `committed.exists` answers whether the real entity exists in the committed
 * database. `existingEditActionRows` contains the current pending projection
 * for that same target. These facts are intentionally separate: a target can
 * be absent from the committed database while still having a session-created
 * pending row.
 */
export type EditActionTargetSnapshot = {
  target: EditActionTargetKey;
  committed: {exists: boolean; version?: number};
  existingEditActionRows: readonly EditActionRow[];
};

/** In-place update generated for a row with an existing stable changeId. */
export type ExistingEditActionUpdate = {
  changeId: number;
  newValue: Record<string, unknown>;
  source: Source;
};

/** Insert generated for a reducer-local row; the database supplies changeId. */
export type NewEditActionInsert = {
  aggregateId: number;
  operation: ChangeOperation;
  fieldPath: string | null;
  newValue: Record<string, unknown>;
  source: Source;
  changeStatus: PendingChangeStatus;
  linkedEntityGroupId: string | null;
};

/** All persistence actions required to move one target to its final state. */
export type EditActionMutationPlan = {
  /** Existing edit-action rows updated in place by stable changeId. */
  updatesToExistingEditActions: readonly ExistingEditActionUpdate[];
  /** New edit-action rows for which the database will generate changeId. */
  newEditActionInserts: readonly NewEditActionInsert[];
  /**
   * Persisted edit-action changeIds to remove before inserts. This can include
   * UPDATE rows for committed targets or CREATE rows for session-created
   * targets; reducer-local inserts have no changeId and are not included.
   */
  changeIdsToDelete: readonly number[];
  deleteEntireTarget: boolean;
  baselineToCapture?: {
    target: EditActionTargetKey;
    baseVersion: number;
  };
};

/** Typed failures produced while validating or reducing pending state. */
export class EditActionReducerError extends Error {
  constructor(
    readonly code: EditActionReducerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EditActionReducerError';
  }
}

/** Formats the same target identity used by the cache and target queries. */
export function editActionTargetKeyString(target: EditActionTargetKey): string {
  return `${target.sessionId}|${target.targetTable}|${target.targetSystemId}`;
}

/**
 * Temporary reducer row while ordered intents are replayed. Existing rows
 * retain a database changeId; inserted rows receive one only when persisted.
 */
type ReducerWorkingRow =
  | {kind: typeof REDUCER_WORKING_ROW_KIND.Existing; row: EditActionRow}
  | {
      kind: typeof REDUCER_WORKING_ROW_KIND.Inserted;
      row: NewEditActionInsert;
    };

type ExistingWorkingRow = Extract<
  ReducerWorkingRow,
  {kind: typeof REDUCER_WORKING_ROW_KIND.Existing}
>;

type InsertedWorkingRow = Extract<
  ReducerWorkingRow,
  {kind: typeof REDUCER_WORKING_ROW_KIND.Inserted}
>;

type ReplayState = {
  deleteEntireTarget: boolean;
  committedTargetChanged: boolean;
};

/** Field coverage attached to a temporary reducer row for matching and overlap checks. */
type ReducerWorkingRowCoverage = {
  working: ReducerWorkingRow;
  wholeRow: boolean;
  fields: ReadonlySet<string>;
};

/**
 * Replays ordered mutation intents into a pure current-state projection.
 *
 * Existing rows are never mutated. The working projection carries clones of
 * existing rows and reducer-local inserts, then diffs that projection against
 * the original snapshot to preserve stable change IDs.
 */
export function reducePendingTarget(
  snapshot: EditActionTargetSnapshot,
  /**
   * Ordered mutations for the target in `snapshot`. Immediate writes normally
   * provide one intent; cached and batched writes may provide several intents
   * for the same target so they can be replayed by one reducer path.
   */
  intents: readonly EditActionMutationIntent[],
): EditActionMutationPlan {
  validateSnapshot(snapshot);

  const originalRows = snapshot.existingEditActionRows.map(row =>
    cloneRow(row),
  );
  const working: ReducerWorkingRow[] = originalRows.map(row => ({
    kind: REDUCER_WORKING_ROW_KIND.Existing,
    row: cloneRow(row),
  }));
  const replayState = replayIntents(snapshot, intents, working);

  validateWorkingState(snapshot.committed.exists, working);

  const originalById = new Map(originalRows.map(row => [row.changeId, row]));
  const existingRows = working.filter(
    (current): current is ExistingWorkingRow => isExistingWorkingRow(current),
  );
  const finalExistingIds = new Set(
    existingRows.map(current => current.row.changeId),
  );

  const updates = existingRows
    .filter(current => {
      const original = originalById.get(current.row.changeId);
      return (
        original !== undefined &&
        (!samePayload(original.newValue, current.row.newValue) ||
          original.source !== current.row.source)
      );
    })
    .sort((left, right) => left.row.changeId - right.row.changeId)
    .map(current => ({
      changeId: current.row.changeId,
      newValue: clonePayload(asPayload(current.row.newValue)),
      // CREATE rows preserve their original source; UPDATE rows use the
      // source of the latest writer that changed their storage slot.
      source: current.row.source,
    }));

  const changeIdsToDelete = originalRows
    .filter(row => !finalExistingIds.has(row.changeId))
    .map(row => row.changeId)
    .sort((left, right) => left - right);

  const inserts = working
    .filter((current): current is InsertedWorkingRow =>
      isInsertedWorkingRow(current),
    )
    .map(current => ({
      ...current.row,
      newValue: clonePayload(current.row.newValue),
    }));

  return {
    updatesToExistingEditActions: updates,
    newEditActionInserts: inserts,
    changeIdsToDelete,
    deleteEntireTarget: replayState.deleteEntireTarget,
    ...(replayState.committedTargetChanged &&
    snapshot.committed.version !== undefined
      ? {
          baselineToCapture: {
            target: snapshot.target,
            baseVersion: snapshot.committed.version,
          },
        }
      : {}),
  };
}

function isExistingWorkingRow(
  current: ReducerWorkingRow,
): current is ExistingWorkingRow {
  return current.kind === REDUCER_WORKING_ROW_KIND.Existing;
}

function isInsertedWorkingRow(
  current: ReducerWorkingRow,
): current is InsertedWorkingRow {
  return current.kind === REDUCER_WORKING_ROW_KIND.Inserted;
}

function replayIntents(
  snapshot: EditActionTargetSnapshot,
  intents: readonly EditActionMutationIntent[],
  working: ReducerWorkingRow[],
): ReplayState {
  const state: ReplayState = {
    deleteEntireTarget: false,
    committedTargetChanged: false,
  };

  for (const intent of intents) {
    if (intent.kind === CHANGE_OPERATION.Create) {
      applyCreateIntent(snapshot, working, intent);
    } else if (intent.kind === CHANGE_OPERATION.Update) {
      applyPendingUpdate(snapshot, working, intent, state);
    } else {
      applyPendingDelete(snapshot, working, intent, state);
    }
  }

  return state;
}

function applyCreateIntent(
  snapshot: EditActionTargetSnapshot,
  working: ReducerWorkingRow[],
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Create}
  >,
): void {
  if (snapshot.committed.exists || working.length > 0) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Conflict,
      'Cannot CREATE a target that already exists or has pending state.',
    );
  }

  working.push({
    kind: REDUCER_WORKING_ROW_KIND.Inserted,
    row: {
      aggregateId: intent.aggregateId,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: clonePayload(intent.newValue),
      source: intent.source,
      changeStatus: intent.changeStatus,
      linkedEntityGroupId: intent.linkedEntityGroupId,
    },
  });
}

function applyPendingUpdate(
  snapshot: EditActionTargetSnapshot,
  working: ReducerWorkingRow[],
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
  state: ReplayState,
): void {
  if (!snapshot.committed.exists && working.length === 0) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.NotFound,
      'Cannot UPDATE a target that is absent from the committed and pending state.',
    );
  }
  if (hasPendingDelete(working)) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Conflict,
      'Cannot UPDATE a target with a pending DELETE.',
    );
  }
  if (isSessionCreated(working)) {
    absorbUpdateIntoCreate(working, intent);
    return;
  }

  state.committedTargetChanged ||= snapshot.committed.exists;
  applyUpdateIntent(working, intent);
}

function absorbUpdateIntoCreate(
  working: ReducerWorkingRow[],
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
): void {
  const create = working[0];
  if (create.row.operation !== CHANGE_OPERATION.Create) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Integrity,
      'Session-created target did not retain its CREATE row.',
    );
  }
  create.row.newValue = {
    ...asPayload(create.row.newValue),
    ...clonePayload(intent.newValue),
  };
}

function applyPendingDelete(
  snapshot: EditActionTargetSnapshot,
  working: ReducerWorkingRow[],
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Delete}
  >,
  state: ReplayState,
): void {
  if (!snapshot.committed.exists && isSessionCreated(working)) {
    removeSessionCreate(working);
    return;
  }
  if (!snapshot.committed.exists) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.NotFound,
      'Cannot DELETE a target that is absent from the committed and pending state.',
    );
  }
  if (hasPendingDelete(working)) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Conflict,
      'Cannot apply another mutation to a target with a pending DELETE.',
    );
  }

  state.committedTargetChanged = true;
  state.deleteEntireTarget = true;
  working.length = 0;
  working.push({
    kind: REDUCER_WORKING_ROW_KIND.Inserted,
    row: {
      aggregateId: intent.aggregateId,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: null,
      newValue: {},
      source: intent.source,
      changeStatus: intent.changeStatus,
      linkedEntityGroupId: intent.linkedEntityGroupId,
    },
  });
}

function removeSessionCreate(working: ReducerWorkingRow[]): void {
  const create = working[0];
  if (create.row.operation !== CHANGE_OPERATION.Create) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Integrity,
      'Session-created target did not retain its reducer-local CREATE row.',
    );
  }
  working.splice(0, 1);
}

function validateSnapshot(snapshot: EditActionTargetSnapshot): void {
  for (const row of snapshot.existingEditActionRows) {
    if (
      row.sessionId !== snapshot.target.sessionId ||
      row.targetTable !== snapshot.target.targetTable ||
      row.targetSystemId !== snapshot.target.targetSystemId
    ) {
      throw reducerError(
        EDIT_ACTION_REDUCER_ERROR_CODE.Integrity,
        'Pending row does not belong to the requested target.',
      );
    }
  }

  const creates = snapshot.existingEditActionRows.filter(
    row => row.operation === CHANGE_OPERATION.Create,
  );
  const updates = snapshot.existingEditActionRows.filter(
    row => row.operation === CHANGE_OPERATION.Update,
  );
  const deletes = snapshot.existingEditActionRows.filter(
    row => row.operation === CHANGE_OPERATION.Delete,
  );

  if (!snapshot.committed.exists) {
    if (
      snapshot.existingEditActionRows.length === 0 ||
      (creates.length === 1 &&
        snapshot.existingEditActionRows.length === 1 &&
        creates[0].fieldPath === '$')
    ) {
      return;
    }
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Integrity,
      'Absent target has an invalid pending lifecycle shape.',
    );
  }

  if (snapshot.existingEditActionRows.length === 0) return;
  if (deletes.length === 1 && snapshot.existingEditActionRows.length === 1) {
    return;
  }
  if (updates.length === snapshot.existingEditActionRows.length) {
    validateDisjointCoverage(snapshot.existingEditActionRows);
    return;
  }

  throw reducerError(
    EDIT_ACTION_REDUCER_ERROR_CODE.Integrity,
    'Committed target has an invalid pending lifecycle shape.',
  );
}

function validateWorkingState(
  committedExists: boolean,
  working: readonly ReducerWorkingRow[],
): void {
  const rows = working.map(current => current.row);
  const creates = rows.filter(row => row.operation === CHANGE_OPERATION.Create);
  const updates = rows.filter(row => row.operation === CHANGE_OPERATION.Update);
  const deletes = rows.filter(row => row.operation === CHANGE_OPERATION.Delete);

  if (!committedExists) {
    if (
      rows.length === 0 ||
      (creates.length === 1 &&
        rows.length === 1 &&
        creates[0].fieldPath === '$')
    ) {
      return;
    }
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Integrity,
      'Absent target reduced to an invalid pending lifecycle shape.',
    );
  }

  if (rows.length === 0) return;
  if (deletes.length === 1 && rows.length === 1) return;
  if (updates.length === rows.length) {
    validateDisjointCoverage(rows);
    return;
  }

  throw reducerError(
    EDIT_ACTION_REDUCER_ERROR_CODE.Integrity,
    'Committed target reduced to an invalid pending lifecycle shape.',
  );
}

function validateDisjointCoverage(
  rows: readonly (EditActionRow | NewEditActionInsert)[],
): void {
  let wholeRow = false;
  const covered = new Set<string>();

  for (const row of rows) {
    const coverage = coverageForRow(row);
    if (wholeRow || (coverage.wholeRow && covered.size > 0)) {
      throw reducerError(
        EDIT_ACTION_REDUCER_ERROR_CODE.Integrity,
        'Pending UPDATE rows contain overlapping whole-row coverage.',
      );
    }
    wholeRow ||= coverage.wholeRow;
    for (const field of coverage.fields) {
      if (covered.has(field)) {
        throw reducerError(
          EDIT_ACTION_REDUCER_ERROR_CODE.Integrity,
          `Pending UPDATE rows overlap on field '${field}'.`,
        );
      }
      covered.add(field);
    }
  }
}

function applyUpdateIntent(
  working: ReducerWorkingRow[],
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
): void {
  const incomingCoverage = coverageForIntent(intent);
  if (incomingCoverage.wholeRow) {
    applyWholeRowUpdate(working, intent, incomingCoverage.fields);
    return;
  }

  applyFieldUpdate(working, intent, incomingCoverage.fields);
}

function applyWholeRowUpdate(
  working: ReducerWorkingRow[],
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
  fields: ReadonlySet<string>,
): void {
  if (working.length === 0) {
    working.push({
      kind: REDUCER_WORKING_ROW_KIND.Inserted,
      row: newUpdateRow(intent),
    });
    return;
  }

  if (
    working.length === 1 &&
    working[0].row.operation === CHANGE_OPERATION.Update &&
    working[0].row.fieldPath === '$'
  ) {
    updateExistingRow(working[0], intent, fields);
    return;
  }
  throw reducerError(
    EDIT_ACTION_REDUCER_ERROR_CODE.Conflict,
    'Whole-row UPDATE overlaps existing pending field storage.',
  );
}

function applyFieldUpdate(
  working: ReducerWorkingRow[],
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
  incomingFields: ReadonlySet<string>,
): void {
  const {rowsByField, unrepresented} = resolveFieldStorage(
    working,
    incomingFields,
  );
  const declaredNamedGroup = isNamedGroupIntent(intent, incomingFields);
  if (declaredNamedGroup && unrepresented.size > 0 && rowsByField.size > 0) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Conflict,
      'Named-group UPDATE would overlap existing storage and regroup an unrepresented field.',
    );
  }

  updateRepresentedFields(rowsByField, intent);
  appendUnrepresentedFields(
    working,
    intent,
    rowsByField,
    unrepresented,
    declaredNamedGroup,
  );
}

function resolveFieldStorage(
  working: readonly ReducerWorkingRow[],
  incomingFields: ReadonlySet<string>,
): {
  rowsByField: Map<string, ReducerWorkingRow>;
  unrepresented: Set<string>;
} {
  const existingCoverage = working.map(current =>
    coverageForWorkingRow(current),
  );
  const rowsByField = new Map<string, ReducerWorkingRow>();
  const unrepresented = new Set<string>();

  for (const field of incomingFields) {
    const matches = existingCoverage.filter(coverage =>
      coverage.fields.has(field),
    );
    if (matches.length > 1) {
      throw reducerError(
        EDIT_ACTION_REDUCER_ERROR_CODE.Conflict,
        `Field '${field}' has ambiguous pending storage coverage.`,
      );
    }
    if (matches.length === 0) {
      unrepresented.add(field);
    } else {
      rowsByField.set(field, matches[0].working);
    }
  }

  return {rowsByField, unrepresented};
}

function updateRepresentedFields(
  rowsByField: ReadonlyMap<string, ReducerWorkingRow>,
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
): void {
  const groupedFields = new Map<ReducerWorkingRow, string[]>();
  for (const [field, row] of rowsByField) {
    const fields = groupedFields.get(row) ?? [];
    fields.push(field);
    groupedFields.set(row, fields);
  }

  for (const [row, fields] of groupedFields) {
    // A null accumulator is intentionally expandable when a normal
    // accumulator intent introduces fields it did not previously contain.
    updateExistingRow(row, intent, fields);
  }
}

function appendUnrepresentedFields(
  working: ReducerWorkingRow[],
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
  rowsByField: ReadonlyMap<string, ReducerWorkingRow>,
  unrepresented: ReadonlySet<string>,
  declaredNamedGroup: boolean,
): void {
  if (unrepresented.size === 0) return;

  const unrepresentedPayload = pickFields(intent.newValue, unrepresented);
  const accumulator =
    intent.fieldPath === null
      ? working.find(
          current =>
            current.row.operation === CHANGE_OPERATION.Update &&
            current.row.fieldPath === null,
        )
      : undefined;

  if (accumulator !== undefined) {
    updateExistingRow(accumulator, intent, [...unrepresented]);
    return;
  }

  if (declaredNamedGroup && rowsByField.size > 0) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Conflict,
      'Named-group UPDATE cannot implicitly expand across storage slots.',
    );
  }

  working.push({
    kind: REDUCER_WORKING_ROW_KIND.Inserted,
    row: {
      ...newUpdateRow(intent),
      newValue: unrepresentedPayload,
    },
  });
}

function updateExistingRow(
  working: ReducerWorkingRow,
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
  fields: Iterable<string>,
): void {
  const payload = pickFields(intent.newValue, fields);
  working.row.newValue =
    intent.fieldPath === '$'
      ? clonePayload(intent.newValue)
      : {
          ...asPayload(working.row.newValue),
          ...payload,
        };

  // CREATE metadata represents the entity's origin and is deliberately
  // preserved. UPDATE metadata keeps its slot identity/status/group while the
  // latest writer becomes the source for that slot.
  if (working.row.operation === CHANGE_OPERATION.Update) {
    working.row.source = intent.source;
  }
}

function newUpdateRow(
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
): NewEditActionInsert {
  return {
    aggregateId: intent.aggregateId,
    operation: CHANGE_OPERATION.Update,
    fieldPath: intent.fieldPath,
    newValue: clonePayload(intent.newValue),
    source: intent.source,
    changeStatus: intent.changeStatus,
    linkedEntityGroupId: intent.linkedEntityGroupId,
  };
}

function coverageForIntent(
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
): FieldCoverageResult {
  try {
    return getFieldCoverage(intent.fieldPath, intent.newValue);
  } catch (error) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Unsupported,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function coverageForWorkingRow(
  working: ReducerWorkingRow,
): ReducerWorkingRowCoverage {
  return {
    working,
    ...coverageForRow(working.row),
  };
}

type FieldCoverageResult = ReturnType<typeof getFieldCoverage>;

function coverageForRow(
  row: EditActionRow | NewEditActionInsert,
): FieldCoverageResult {
  try {
    return getFieldCoverage(row.fieldPath, row.newValue);
  } catch (error) {
    throw reducerError(
      EDIT_ACTION_REDUCER_ERROR_CODE.Unsupported,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function isNamedGroupIntent(
  intent: Extract<
    EditActionMutationIntent,
    {kind: typeof CHANGE_OPERATION.Update}
  >,
  fields: ReadonlySet<string>,
): boolean {
  if (intent.fieldPath === null || intent.fieldPath === '$') return false;
  return fields.size !== 1 || !fields.has(intent.fieldPath);
}

function hasPendingDelete(working: readonly ReducerWorkingRow[]): boolean {
  return working.some(
    current => current.row.operation === CHANGE_OPERATION.Delete,
  );
}

function isSessionCreated(working: readonly ReducerWorkingRow[]): boolean {
  return (
    working.length === 1 &&
    working[0].row.operation === CHANGE_OPERATION.Create &&
    working[0].row.fieldPath === '$'
  );
}

function pickFields(
  payload: Record<string, unknown>,
  fields: Iterable<string>,
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      selected[field] = payload[field];
    }
  }
  return selected;
}

function asPayload(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function clonePayload(value: Record<string, unknown>): Record<string, unknown> {
  return {...value};
}

function cloneRow(row: EditActionRow): EditActionRow {
  return {
    ...row,
    newValue:
      typeof row.newValue === 'object' &&
      row.newValue !== null &&
      !Array.isArray(row.newValue)
        ? clonePayload(row.newValue as Record<string, unknown>)
        : row.newValue,
  };
}

function samePayload(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function reducerError(
  code: EditActionReducerError['code'],
  message: string,
): EditActionReducerError {
  return new EditActionReducerError(code, message);
}
