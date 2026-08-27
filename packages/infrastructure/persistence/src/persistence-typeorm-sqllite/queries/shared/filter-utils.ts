/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Brackets} from 'typeorm';
import type {WhereExpressionBuilder} from 'typeorm';

/**
 * Appends optional column-level filter conditions to a TypeORM QueryBuilder.
 *
 * - Scalar value → alias.key = :key           (number, string, or boolean)
 * - Array value  → alias.key IN (:...key)     (matches any value in the array)
 * - undefined    → skipped (no constraint on that field)
 * - $or          → array of sub-filters; at least one must match.
 *                  Wrapped in Brackets and ANDed with the rest.
 *
 * All top-level fields are ANDed together.
 *
 * Accepts WhereExpressionBuilder so it can be called both at the top level
 * (SelectQueryBuilder) and recursively inside Brackets callbacks.
 *
 * @param qb      TypeORM WhereExpressionBuilder (or SelectQueryBuilder) to append to
 * @param alias   Entity alias used in the QueryBuilder (e.g. 'dl')
 * @param filters Filter object whose keys are entity property names
 *
 * @example
 * // Links from subgraph 5 to subgraph 10
 * applyEntityFilters(qb, 'dl', { sourceSubgraphSystemId: 5, destSubgraphSystemId: 10 })
 *
 * @example
 * // Links involving either side of a port set (OR semantics)
 * applyEntityFilters(qb, 'dl', {
 *   $or: [
 *     { sourcePortSystemId: portIds },
 *     { destinationPortSystemId: portIds },
 *   ],
 * })
 */
export function applyEntityFilters(
  qb: WhereExpressionBuilder,
  alias: string,
  filters: Record<string, unknown>,
  _paramSuffix = '',
): void {
  for (const [key, val] of Object.entries(filters)) {
    if (key === '$or' || val === undefined) continue;
    // Use a suffixed parameter name so that two $or branches using the same
    // column name don't overwrite each other in TypeORM's shared parameter map.
    const p = `${key}${_paramSuffix}`;
    if (Array.isArray(val)) {
      qb.andWhere(`${alias}.${key} IN (:...${p})`, {[p]: val});
    } else {
      qb.andWhere(`${alias}.${key} = :${p}`, {[p]: val});
    }
  }

  const orClauses = (filters as {$or?: Record<string, unknown>[]}).$or;
  if (orClauses && orClauses.length > 0) {
    qb.andWhere(
      new Brackets(orQb => {
        for (const [i, clause] of orClauses.entries()) {
          orQb.orWhere(
            new Brackets(innerQb =>
              applyEntityFilters(
                innerQb,
                alias,
                clause,
                `${_paramSuffix}_or${i}`,
              ),
            ),
          );
        }
      }),
    );
  }
}

/**
 * In-memory equivalent of applyEntityFilters.
 *
 * Used as the createFilter callback in OverlayMergeImpl.applyToCollection so
 * session-created rows (built from edit_actions CREATE payloads) are subject
 * to the same filter criteria as the baseline SQL query.
 *
 * @param row     Plain object built from a CREATE action's newValue payload
 * @param filters The same filter object passed to applyEntityFilters
 * @returns true if all defined filter conditions are satisfied
 */
export function matchesEntityFilters(
  row: Record<string, unknown>,
  filters: Record<string, unknown>,
): boolean {
  for (const [key, val] of Object.entries(filters)) {
    if (key === '$or' || val === undefined) continue;
    const rowVal = row[key];
    if (Array.isArray(val)) {
      if (!(val as unknown[]).includes(rowVal)) return false;
    } else {
      if (rowVal !== val) return false;
    }
  }

  const orClauses = (filters as {$or?: Record<string, unknown>[]}).$or;
  if (orClauses && orClauses.length > 0) {
    return orClauses.some(clause => matchesEntityFilters(row, clause));
  }

  return true;
}
