/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {WhereExpressionBuilder} from 'typeorm';
import {Brackets} from 'typeorm';
import type {FilterExpression, FilterValue} from '@arc/core';

/**
 * Describes one filterable field — how to validate it, apply it to a
 * TypeORM QueryBuilder, and evaluate it in-memory.
 *
 * Example for 'subgraphId':
 *   name:         'subgraphId'
 *   valueType:    'number'
 *   addCondition: adds EXISTS subquery checking use_case_subgraphs
 *   evaluate:     checks uc.subgraphs?.some(s => s.systemId === value)
 */
export interface ParamFilterField<TEntity = unknown> {
  /** Field name as it appears in the filter string, e.g. 'subgraphId' */
  name: string;
  /** Expected value type — validated at the controller before the query runs */
  valueType: 'number' | 'string' | 'boolean';
  /**
   * Adds a TypeORM WHERE condition for this field.
   * Called by ParamFilter.apply() once per condition node in the expression tree.
   * @param qb       WhereExpressionBuilder — works for both SelectQueryBuilder and Brackets
   * @param value    Parsed value from the filter expression
   * @param paramKey Unique parameter name (p0, p1, ...) — prevents TypeORM param collisions
   * @param alias    Main entity alias in the QueryBuilder (e.g. 'uc')
   */
  addCondition: (
    qb: WhereExpressionBuilder,
    value: FilterValue,
    paramKey: string,
    alias: string,
  ) => void;
  /**
   * In-memory evaluation — used when the query result needs further filtering.
   * Returns true if the entity matches the field condition for the given value.
   */
  evaluate: (entity: TEntity, value: FilterValue) => boolean;
}

/**
 * Holds a registry of ParamFilterField definitions and applies a parsed
 * FilterExpression tree to a TypeORM QueryBuilder.
 *
 * Usage:
 *   1. Build once at module level — register all fields.
 *   2. Controller calls validate() to catch unknown fields / type mismatches → 400.
 *   3. Service calls apply(qb, expression, alias) to add WHERE clauses before getMany().
 *
 * Parameter uniqueness:
 *   apply() uses a private {n:number} counter shared across the entire recursive tree walk.
 *   Each condition gets a unique key (p0, p1, p2...) so TypeORM never overwrites
 *   parameters when the same field appears more than once (e.g. subgraphId:X OR subgraphId:Y).
 */
export class ParamFilter<TEntity = unknown> {
  private readonly fields = new Map<string, ParamFilterField<TEntity>>();

  /** Register a new filterable field. Returns `this` for chaining. */
  register(field: ParamFilterField<TEntity>): this {
    this.fields.set(field.name, field);
    return this;
  }

  /** Names of all registered fields — used by the controller to validate the expression. */
  get fieldNames(): ReadonlySet<string> {
    return new Set(this.fields.keys());
  }

  /**
   * Validates every condition node in the expression tree.
   * Throws if: field is not registered, or value type does not match field.valueType.
   * Called by the controller — failures become HTTP 400.
   */
  validate(expression: FilterExpression): void {
    this.walkValidate(expression);
  }

  /**
   * Walks the FilterExpression tree and adds TypeORM WHERE clauses to qb.
   *   AND node → Brackets with both children AND-ed
   *   OR  node → Brackets with left AND-ed, right OR-ed
   *   condition → field.addCondition() with a unique paramKey
   */
  apply(
    qb: WhereExpressionBuilder,
    expression: FilterExpression,
    alias: string,
  ): void {
    const counter = {n: 0}; // shared counter — ensures unique p0, p1, p2... across tree
    this.walkApply(qb, expression, alias, counter);
  }

  /** In-memory evaluation of the expression tree against a single entity. */
  evaluate(entity: TEntity, expression: FilterExpression): boolean {
    return this.walkEvaluate(entity, expression);
  }

  // ── private walk helpers ────────────────────────────────────────────────────

  private walkValidate(node: FilterExpression): void {
    if (node.type === 'condition') {
      const field = this.fields.get(node.field);
      if (!field) {
        throw new Error(`Unknown filter field: '${node.field}'`);
      }
      const actualType = typeof node.value;
      if (actualType !== field.valueType) {
        throw new Error(
          `Field '${node.field}' expects ${field.valueType} but got ${actualType}`,
        );
      }
      return;
    }
    // AND / OR — validate both branches
    this.walkValidate(node.left);
    this.walkValidate(node.right);
  }

  private walkApply(
    qb: WhereExpressionBuilder,
    node: FilterExpression,
    alias: string,
    counter: {n: number}, // mutable reference — incremented by each condition leaf
  ): void {
    if (node.type === 'condition') {
      const field = this.fields.get(node.field)!;
      const paramKey = `p${counter.n++}`; // read then increment — e.g. p0, then n=1
      field.addCondition(qb, node.value, paramKey, alias);
      return;
    }

    if (node.type === 'AND') {
      // Both children must be true — wrap in Brackets, add each with andWhere
      qb.andWhere(
        new Brackets(inner => {
          this.walkApply(inner, node.left, alias, counter);
          this.walkApply(inner, node.right, alias, counter);
        }),
      );
      return;
    }

    // OR — left added with andWhere, right added with orWhere inside a Brackets
    qb.andWhere(
      new Brackets(inner => {
        this.walkApply(inner, node.left, alias, counter);
        inner.orWhere(
          new Brackets(b => this.walkApply(b, node.right, alias, counter)),
        );
      }),
    );
  }

  private walkEvaluate(entity: TEntity, node: FilterExpression): boolean {
    if (node.type === 'condition') {
      return this.fields.get(node.field)?.evaluate(entity, node.value) ?? false;
    }
    if (node.type === 'AND') {
      return (
        this.walkEvaluate(entity, node.left) &&
        this.walkEvaluate(entity, node.right)
      );
    }
    // OR
    return (
      this.walkEvaluate(entity, node.left) ||
      this.walkEvaluate(entity, node.right)
    );
  }
}
