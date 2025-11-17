import {EntityManager, EntityTarget, ObjectLiteral} from 'typeorm';
import {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';

export interface BatchInsertResult<TRow> {
  succeeded: TRow[];
  failed: Array<{row: TRow; error: Error}>;
}

export class BatchInserter {
  static async insert<TEntity extends ObjectLiteral>(
    manager: EntityManager,
    target: EntityTarget<TEntity>,
    rows: QueryDeepPartialEntity<TEntity>[],
    batchSize = 100,
  ): Promise<BatchInsertResult<QueryDeepPartialEntity<TEntity>>> {
    const succeeded: QueryDeepPartialEntity<TEntity>[] = [];
    const failed: Array<{row: QueryDeepPartialEntity<TEntity>; error: Error}> =
      [];

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      try {
        await manager.insert<TEntity>(target, batch);
        succeeded.push(...batch);
      } catch (batchError) {
        for (const row of batch) {
          try {
            await manager.insert<TEntity>(target, row);
            succeeded.push(row);
          } catch (rowError) {
            failed.push({row, error: rowError as Error});
          }
        }
      }
    }

    return {succeeded, failed};
  }
}
