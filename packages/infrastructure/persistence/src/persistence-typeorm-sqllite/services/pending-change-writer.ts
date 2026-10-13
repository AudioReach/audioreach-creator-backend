/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import type {ChangeStatus, Logger, Source} from '@arc/core';
import {In} from 'typeorm';
import type {EntityManager} from 'typeorm';
import type {EntityName} from '../entity-schema/entity-table-names.js';
import {
  EditActionSchema,
  type EditActionRow,
} from '../entity-schema/edit-session/edit-action.schema.js';
import {SessionEntityVersionSchema} from '../entity-schema/edit-session/session-entity-version.schema.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {
  editActionTargetKeyString,
  reducePendingTarget,
  type EditActionMutationIntent,
  type EditActionMutationPlan,
  type EditActionTargetKey,
} from './pending-target-reducer.js';
import type {PendingChangeCache} from './pending-change-cache.js';

export type WriteDeltaSpec = {
  targetTable: EntityName;
  targetSystemId: number;
  aggregateId: number;
  delta: Record<string, unknown>;
  /** null / omitted = accumulator mode; string = per-slot mode. */
  fieldGroup?: string;
  linkedEntityGroupId?: string;
  /** Defer the ordered intent until the owning UoW flushes. */
  cache?: boolean;
  source?: Source;
  /** Honored only when source = DIFF_TOOL. */
  changeStatus?: ChangeStatus;
};

export type WriteCreateSpec = {
  targetTable: EntityName;
  targetSystemId: number;
  aggregateId: number;
  payload: Record<string, unknown>;
  linkedEntityGroupId?: string;
  cache?: boolean;
  source?: Source;
  /** Honored only when source = DIFF_TOOL. */
  changeStatus?: ChangeStatus;
};

export type WriteDeleteSpec = {
  targetTable: EntityName;
  targetSystemId: number;
  aggregateId: number;
  linkedEntityGroupId?: string;
  cache?: boolean;
  source?: Source;
};

type EditActionInsertRow = {
  sessionId: number;
  aggregateId: number;
  targetSystemId: number;
  targetTable: EntityName;
  operation: EditActionRow['operation'];
  fieldPath: string | null;
  newValue: Record<string, unknown>;
  source: EditActionRow['source'];
  changeStatus: EditActionRow['changeStatus'];
  linkedEntityGroupId: string | null;
};

type CommittedState = {exists: boolean; version?: number};

/**
 * The persistence mutation facade. It loads one target snapshot, delegates
 * lifecycle and field-slot policy to the pure reducer, then executes its plan.
 */
export class PendingChangeWriter {
  constructor(
    private readonly queryService: EditActionsQueryService,
    private readonly pendingChangeCache: PendingChangeCache,
    private readonly logger?: Logger,
  ) {}

  async writeDelta(
    spec: WriteDeltaSpec,
    sessionId: number,
    manager: EntityManager,
  ): Promise<number | null> {
    const intent = this.deltaIntent(
      spec,
      // An empty delta is a structural marker, not an empty accumulator.
      spec.fieldGroup ?? (Object.keys(spec.delta).length === 0 ? '$' : null),
    );
    return this.acceptIntent(
      this.targetKey(spec, sessionId),
      intent,
      spec.cache === true,
      manager,
    );
  }

  async writeDeltaBatch(
    specs: WriteDeltaSpec[],
    sessionId: number,
    manager: EntityManager,
  ): Promise<void> {
    const grouped = new Map<
      string,
      {
        target: EditActionTargetKey;
        intents: EditActionMutationIntent[];
        cache: boolean;
      }
    >();

    for (const spec of specs) {
      const target = this.targetKey(spec, sessionId);
      const key = editActionTargetKeyString(target);
      const entry = grouped.get(key) ?? {target, intents: [], cache: false};
      entry.intents.push(this.deltaIntent(spec, spec.fieldGroup ?? null));
      entry.cache ||=
        spec.cache === true || this.pendingChangeCache.has(target);
      grouped.set(key, entry);
    }

    const entries = [...grouped.values()];
    entries.sort((left, right) =>
      editActionTargetKeyString(left.target).localeCompare(
        editActionTargetKeyString(right.target),
      ),
    );
    for (const entry of entries) {
      if (entry.cache) {
        for (const intent of entry.intents) {
          this.pendingChangeCache.enqueue(entry.target, intent);
        }
      } else {
        await this.applyImmediate(entry.target, entry.intents, manager);
      }
    }
  }

  async writeCreate(
    spec: WriteCreateSpec,
    sessionId: number,
    manager: EntityManager,
  ): Promise<number | null> {
    const source = spec.source ?? SOURCE.Manual;
    return this.acceptIntent(
      this.targetKey(spec, sessionId),
      {
        kind: CHANGE_OPERATION.Create,
        aggregateId: spec.aggregateId,
        source,
        changeStatus: this.resolveChangeStatus(source, spec.changeStatus),
        linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
        newValue: spec.payload,
      },
      spec.cache === true,
      manager,
    );
  }

  async writeDelete(
    spec: WriteDeleteSpec,
    sessionId: number,
    manager: EntityManager,
  ): Promise<number | null> {
    const source = spec.source ?? SOURCE.Manual;
    return this.acceptIntent(
      this.targetKey(spec, sessionId),
      {
        kind: CHANGE_OPERATION.Delete,
        aggregateId: spec.aggregateId,
        source,
        changeStatus: this.resolveChangeStatus(source),
        linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
      },
      spec.cache === true,
      manager,
    );
  }

  async flushCachedActions(manager: EntityManager): Promise<void> {
    const entries = this.pendingChangeCache.entries();
    if (entries.length === 0) return;

    const targets = entries.map(entry => entry.target);
    const rowsByTarget = await this.queryService.getAllByTargetKeys(
      targets,
      manager,
    );
    const committedByTarget = await this.loadCommittedStates(targets, manager);
    const sortedEntries = [...entries];
    sortedEntries.sort((left, right) =>
      editActionTargetKeyString(left.target).localeCompare(
        editActionTargetKeyString(right.target),
      ),
    );
    const plans = sortedEntries.map(entry => ({
      target: entry.target,
      plan: reducePendingTarget(
        {
          target: entry.target,
          existingEditActionRows:
            rowsByTarget.get(editActionTargetKeyString(entry.target)) ?? [],
          committed: committedByTarget.get(
            editActionTargetKeyString(entry.target),
          ) ?? {exists: false},
        },
        entry.intents,
      ),
    }));

    for (const {target, plan} of plans) {
      await this.executePlan(target, plan, manager);
    }
    this.pendingChangeCache.clear();
  }

  async wipeUnstagedForSession(
    sessionId: number,
    manager: EntityManager,
  ): Promise<number> {
    const result = await manager.delete(EditActionSchema, {
      sessionId,
      changeStatus: CHANGE_STATUS.Unstaged,
    });
    await manager.delete(SessionEntityVersionSchema, {sessionId});
    return result.affected ?? 0;
  }

  async deleteBySource(
    sessionId: number,
    source: Source,
    manager: EntityManager,
  ): Promise<number> {
    const result = await manager.delete(EditActionSchema, {sessionId, source});
    return result.affected ?? 0;
  }

  private async acceptIntent(
    target: EditActionTargetKey,
    intent: EditActionMutationIntent,
    requestedCache: boolean,
    manager: EntityManager,
  ): Promise<number | null> {
    if (requestedCache || this.pendingChangeCache.has(target)) {
      this.pendingChangeCache.enqueue(target, intent);
      return null;
    }
    return this.applyImmediate(target, [intent], manager);
  }

  private async applyImmediate(
    target: EditActionTargetKey,
    intents: readonly EditActionMutationIntent[],
    manager: EntityManager,
  ): Promise<number | null> {
    const rows = await this.queryService.getAllByTargetKey(target, manager);
    const committedByTarget = await this.loadCommittedStates([target], manager);
    const committed = committedByTarget.get(
      editActionTargetKeyString(target),
    ) ?? {exists: false};
    const plan = reducePendingTarget(
      {target, committed, existingEditActionRows: rows},
      intents,
    );
    return this.executePlan(target, plan, manager);
  }

  private async executePlan(
    target: EditActionTargetKey,
    plan: EditActionMutationPlan,
    manager: EntityManager,
  ): Promise<number | null> {
    if (plan.baselineToCapture !== undefined) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(SessionEntityVersionSchema)
        .values({
          sessionId: plan.baselineToCapture.target.sessionId,
          targetTable: plan.baselineToCapture.target.targetTable,
          targetSystemId: plan.baselineToCapture.target.targetSystemId,
          baseVersion: plan.baselineToCapture.baseVersion,
        })
        .orIgnore()
        .execute();
    }

    for (const update of plan.updatesToExistingEditActions) {
      await manager.update(EditActionSchema, update.changeId, {
        newValue: update.newValue,
        source: update.source,
      });
    }

    if (plan.deleteEntireTarget) {
      await manager.delete(EditActionSchema, {
        sessionId: target.sessionId,
        targetTable: target.targetTable,
        targetSystemId: target.targetSystemId,
      });
    } else if (plan.changeIdsToDelete.length > 0) {
      await manager.delete(EditActionSchema, {
        changeId: In(plan.changeIdsToDelete),
      });
    }

    let firstInsertedChangeId: number | null = null;
    for (const insert of plan.newEditActionInserts) {
      const changeId = await this.insertRow(
        {
          sessionId: target.sessionId,
          aggregateId: insert.aggregateId,
          targetSystemId: target.targetSystemId,
          targetTable: target.targetTable,
          operation: insert.operation,
          fieldPath: insert.fieldPath,
          newValue: insert.newValue,
          source: insert.source,
          changeStatus: insert.changeStatus,
          linkedEntityGroupId: insert.linkedEntityGroupId,
        },
        manager,
      );
      firstInsertedChangeId ??= changeId;
    }

    return (
      plan.updatesToExistingEditActions[0]?.changeId ?? firstInsertedChangeId
    );
  }

  private async loadCommittedStates(
    targets: readonly EditActionTargetKey[],
    manager: EntityManager,
  ): Promise<Map<string, CommittedState>> {
    const result = new Map<string, CommittedState>();
    for (const target of targets) {
      result.set(editActionTargetKeyString(target), {exists: false});
    }

    const byTable = new Map<EntityName, EditActionTargetKey[]>();
    for (const target of targets) {
      const group = byTable.get(target.targetTable) ?? [];
      group.push(target);
      byTable.set(target.targetTable, group);
    }

    await Promise.all(
      [...byTable.values()].map(async group => {
        const first = group[0];
        const targetSystemIds = [
          ...new Set(group.map(target => target.targetSystemId)),
        ];
        const repository = manager.getRepository(first.targetTable);
        const hasSystemId = repository.metadata.columns.some(
          column => column.propertyName === 'systemId',
        );
        if (!hasSystemId) {
          return;
        }
        const query = repository
          .createQueryBuilder('e')
          .select('e.systemId', 'systemId')
          .where('e.systemId IN (:...targetSystemIds)', {targetSystemIds});
        const hasVersion = repository.metadata.columns.some(
          column => column.propertyName === 'version',
        );
        if (hasVersion) {
          query.addSelect('e.version', 'version');
        }
        const rows = await query.getRawMany<{
          systemId: number;
          version?: number;
        }>();
        this.setCommittedRows(result, group, rows);
      }),
    );
    return result;
  }

  private setCommittedRows(
    result: Map<string, CommittedState>,
    targets: readonly EditActionTargetKey[],
    rows: readonly {systemId: number; version?: number}[],
  ): void {
    const byId = new Map(rows.map(row => [Number(row.systemId), row]));
    for (const target of targets) {
      const row = byId.get(target.targetSystemId);
      if (row !== undefined) {
        result.set(editActionTargetKeyString(target), {
          exists: true,
          ...(typeof row.version === 'number' ? {version: row.version} : {}),
        });
      }
    }
  }

  private resolveChangeStatus(
    source: Source,
    override?: ChangeStatus,
  ): ChangeStatus {
    if (source === SOURCE.Manual) {
      if (override !== undefined)
        throw new Error(
          'MANUAL source does not accept an explicit changeStatus. MANUAL writes are always STAGED.',
        );
      return CHANGE_STATUS.Staged;
    }
    if (source === SOURCE.AutoRouting) {
      if (override !== undefined)
        throw new Error(
          'AUTO_ROUTING source does not accept an explicit changeStatus. AUTO_ROUTING writes are always UNSTAGED.',
        );
      return CHANGE_STATUS.Unstaged;
    }
    return override ?? CHANGE_STATUS.Unstaged;
  }

  private targetKey(
    spec: Pick<WriteDeltaSpec, 'targetTable' | 'targetSystemId'>,
    sessionId: number,
  ): EditActionTargetKey {
    return {
      sessionId,
      targetTable: spec.targetTable,
      targetSystemId: spec.targetSystemId,
    };
  }

  private deltaIntent(
    spec: WriteDeltaSpec,
    fieldPath: string | null,
  ): Extract<EditActionMutationIntent, {kind: typeof CHANGE_OPERATION.Update}> {
    const source = spec.source ?? SOURCE.Manual;
    return {
      kind: CHANGE_OPERATION.Update,
      aggregateId: spec.aggregateId,
      fieldPath,
      source,
      changeStatus: this.resolveChangeStatus(source, spec.changeStatus),
      linkedEntityGroupId: spec.linkedEntityGroupId ?? null,
      newValue: spec.delta,
    };
  }

  private async insertRow(
    row: EditActionInsertRow,
    manager: EntityManager,
  ): Promise<number> {
    this.logger?.logDebug({
      msg: 'insertingAction',
      description: `edit_actions key session=${row.sessionId}, table=${row.targetTable}, target=${row.targetSystemId}, fieldPath=${row.fieldPath ?? '<null>'}, operation=${row.operation}`,
      component: 'PendingChangeWriter',
      tag: 'edit-actions',
    });

    let generatedChangeId: number | undefined;
    try {
      const result = await manager.insert(EditActionSchema, row);
      generatedChangeId = getGeneratedChangeId(result.identifiers[0]);
    } catch (error) {
      this.logger?.logError({
        msg: 'insertActionFailed',
        description: `Failed to insert edit_actions key session=${row.sessionId}, table=${row.targetTable}, target=${row.targetSystemId}, fieldPath=${row.fieldPath ?? '<null>'}, operation=${row.operation}`,
        component: 'PendingChangeWriter',
        tag: 'edit-actions',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
    if (generatedChangeId !== undefined) return generatedChangeId;

    // SQLite tracks this per connection, so the transaction-scoped manager
    // returns the ID of the insert immediately above when TypeORM omits it.
    const fallback = await manager
      .createQueryBuilder()
      .select('last_insert_rowid()', 'changeId')
      .getRawOne<unknown>();
    const fallbackChangeId = getGeneratedChangeId(fallback);
    if (fallbackChangeId === undefined) {
      throw new Error('Failed to obtain the generated edit action change ID.');
    }
    return fallbackChangeId;
  }
}

function getGeneratedChangeId(result: unknown): number | undefined {
  if (typeof result !== 'object' || result === null) return undefined;
  const changeId = (result as Record<string, unknown>)['changeId'];
  return typeof changeId === 'number' ? changeId : undefined;
}
