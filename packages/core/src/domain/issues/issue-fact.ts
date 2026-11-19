/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * The shape of an issue fact: the object a producer builds when it finds a
 * problem, before any text is written.
 *
 * An issue fact has two kinds of fields:
 * - Fields every issue has: `code`, `severity`, `impactedEntity`, ...
 * - Fields that depend on the code: `relatedEntities` and `params`, looked
 *   up in the code's row of `IssueContextMap`.
 *
 * Choosing a `code` therefore makes the compiler require exactly that code's
 * data. The types are built bottom-up:
 *
 * ```text
 * ContextFields     relatedEntities / params, optional when nothing is required
 * FixOptionFactOf   one fix option of one kind
 * FixOptionFact     a fix option of any kind of a code
 * IssueFactOf       one issue of one code
 * IssueFact         an issue of any code
 * ```
 *
 * All of these are compile-time types; none of them exists at runtime.
 */

import type {EntityRef} from '../identity/entity-identity.js';
import type {ClientInputSpec} from '../../shared/issues/fix-option.js';
import type {
  IssueCategory,
  IssueSeverity,
} from '../../shared/issues/severity.js';
import type {
  IssueContextMap,
  IssueFactCode,
  NoContext,
} from './issue-context-map.js';

/**
 * `relatedEntities` and `params` of a context. A field whose type has no
 * required entries may be left out; the renderer treats it as empty.
 *
 * `X` is a context: a row of `IssueContextMap`, or one fix-option kind.
 *
 * How it decides: `NoContext extends T ? ... : ...` is a conditional type.
 * It asks "is an empty object `{}` a valid `T`?" If yes, `T` has nothing
 * required, so the field is optional. If no, the field is required. The two
 * halves, one per field, are joined with `&`.
 *
 * @example
 * ```ts
 * // ENTITY_NOT_FOUND: no related entities, no params; both may be left out.
 * ContextFields<IssueContextMap[typeof ISSUE_CODE.ENTITY_NOT_FOUND]>
 * // → {readonly relatedEntities?: {}} & {readonly params?: {}}
 *
 * // ROUTING_EC_MULTIPLE_LINKS: both have required entries.
 * ContextFields<IssueContextMap[typeof ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS]>
 * // → {readonly relatedEntities: {ecDataLinks: DataLinks}}
 * //   & {readonly params: {pairCount: number}}
 * ```
 */
export type ContextFields<X extends {relatedEntities: object; params: object}> =
  (NoContext extends X['relatedEntities']
    ? {readonly relatedEntities?: X['relatedEntities']}
    : {readonly relatedEntities: X['relatedEntities']}) &
    (NoContext extends X['params']
      ? {readonly params?: X['params']}
      : {readonly params: X['params']});

/**
 * The fix-option kinds of code `C`, by kind name: the third slot of the
 * code's `CodeContext`. It is `NoContext` (no kinds) for a code without fix
 * options.
 *
 * @example
 * ```ts
 * FixOptionKinds<typeof ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED>
 * // → {SELECT_CANDIDATE: Context<...>; KEEP_EXISTING: Context<...>;
 * //    MERGE_ALL: Context<...>}
 * ```
 */
type FixOptionKinds<C extends IssueFactCode> = IssueContextMap[C]['fixOptions'];

/**
 * The context of fix-option kind `K` of code `C`.
 *
 * `K extends keyof FixOptionKinds<C>` limits `K` to the kind names of `C`,
 * such as `'KEEP_EXISTING'`.
 *
 * For a concrete code and kind, `Extract` returns the kind's `Context`
 * unchanged. It is there for the compiler: while `C` and `K` are still type
 * parameters, the compiler cannot see that the lookup has `relatedEntities`
 * and `params`, which `ContextFields` requires. `Extract` states it.
 */
export type FixOptionContext<
  C extends IssueFactCode,
  K extends keyof FixOptionKinds<C>,
> = Extract<FixOptionKinds<C>[K], {relatedEntities: object; params: object}>;

/**
 * One fix option of code `C` and kind `K`, before rendering: the fields
 * every option has, joined (`&`) with the kind's context fields.
 *
 * @example `KEEP_EXISTING` of `ROUTING_SAME_GKV_CHOICE_REQUIRED`, expanded:
 * ```ts
 * {
 *   readonly id: string;
 *   readonly kind: 'KEEP_EXISTING';
 *   readonly commandType: string;
 *   readonly commandPayload: Readonly<Record<string, unknown>>;
 *   readonly requiredClientInputs: readonly ClientInputSpec[];
 *   // Required: the kind's related entities have required entries.
 *   readonly relatedEntities: {
 *     usecase: EntityRef<'UseCase'>;
 *     subgraphs: Subgraphs;
 *   };
 *   // Optional: the kind has no params.
 *   readonly params?: {};
 * }
 * ```
 */
type FixOptionFactOf<
  C extends IssueFactCode,
  K extends keyof FixOptionKinds<C>,
> = {
  /** Stable option ID, e.g. "delete-duplicate-link"; not an entity ID. */
  readonly id: string;
  /**
   * Selects the template that writes the option's description. Its type is
   * the kind name itself, so checking `kind` narrows the option to its kind.
   */
  readonly kind: K;
  readonly commandType: string;
  /** Sent back unchanged by the client; never rendered. */
  readonly commandPayload: Readonly<Record<string, unknown>>;
  readonly requiredClientInputs: readonly ClientInputSpec[];
} & ContextFields<FixOptionContext<C, K>>;

/**
 * A fix option of code `C`, before rendering: one variant per kind.
 *
 * An option is exactly one kind, never a mix, so this is a union with one
 * member per kind. It is built with a common trick: build an object with
 * one property per name, then index it with all its names at once. Indexing
 * with a union of keys gives the union of the values.
 *
 * ```ts
 * // Inner layer, for one code: one property per kind ...
 * {
 *   SELECT_CANDIDATE: FixOptionFactOf<Code, 'SELECT_CANDIDATE'>;
 *   KEEP_EXISTING: FixOptionFactOf<Code, 'KEEP_EXISTING'>;
 *   MERGE_ALL: FixOptionFactOf<Code, 'MERGE_ALL'>;
 * }['SELECT_CANDIDATE' | 'KEEP_EXISTING' | 'MERGE_ALL']
 * // ... indexed by every kind:
 * // → FixOptionFactOf<Code, 'SELECT_CANDIDATE'>
 * //   | FixOptionFactOf<Code, 'KEEP_EXISTING'>
 * //   | FixOptionFactOf<Code, 'MERGE_ALL'>
 * ```
 *
 * The outer layer (`[Code in C] ... [C]`) does the same over codes, so with
 * several codes the result is a union over codes too.
 *
 * A code without fix options has no kinds: `keyof` gives `never`, and the
 * result is `never`, which no value fits. Its `fixOptions` can then only be
 * left out or empty.
 */
export type FixOptionFact<C extends IssueFactCode = IssueFactCode> = {
  [Code in C]: {
    [K in keyof FixOptionKinds<Code>]: FixOptionFactOf<Code, K>;
  }[keyof FixOptionKinds<Code>];
}[C];

/**
 * An issue of code `C`, before rendering: the fields every issue has, joined
 * (`&`) with the code's context fields. Every `C` is the same code, so
 * `code`, `fixOptions`, and the context fields all come from one row of
 * `IssueContextMap`.
 *
 * @example `ROUTING_EC_MULTIPLE_LINKS`, expanded:
 * ```ts
 * {
 *   readonly code: 'ARC-ROUTING-EC-MULTIPLE-LINKS';
 *   readonly severity: IssueSeverity;
 *   readonly category?: IssueCategory;
 *   readonly impactedEntity?: EntityRef;
 *   readonly impactedUsecases?: readonly EntityRef<'UseCase'>[];
 *   readonly fixOptions?: readonly never[]; // the code has no fix options
 *   readonly relatedEntities: {ecDataLinks: DataLinks}; // required
 *   readonly params: {pairCount: number}; // required
 * }
 * ```
 */
type IssueFactOf<C extends IssueFactCode> = {
  /** The issue code; it selects the context and the message template. */
  readonly code: C;
  readonly severity: IssueSeverity;
  readonly category?: IssueCategory;
  /** The entity the issue is about, when there is one. */
  readonly impactedEntity?: EntityRef;
  /** The use cases the issue affects. */
  readonly impactedUsecases?: readonly EntityRef<'UseCase'>[];
  /** Ways the user could fix the issue; only for codes with fix options. */
  readonly fixOptions?: readonly FixOptionFact<C>[];
} & ContextFields<IssueContextMap[C]>;

/**
 * An issue as its producer states it: a code, the entities it concerns, and
 * machine context, but no text. `IssueRenderer` turns it into an `Issue`.
 *
 * A producer sets `EntityRef.identity` when it already holds the identity,
 * and must set it for an entity that cannot be read later. The default is
 * the union of every code, so `code` narrows the context.
 *
 * It uses the same object-then-index trick as `FixOptionFact`, giving one
 * member per code:
 * ```ts
 * IssueFact
 * // → IssueFactOf<'ENTITY_NOT_FOUND'>
 * //   | IssueFactOf<'ARC-ROUTING-EC-MULTIPLE-LINKS'>
 * //   | ... one member per code
 * ```
 *
 * A union, rather than `IssueFactOf<IssueFactCode>`, keeps each code with its
 * own context. A single object whose `code` could be any code would mix every
 * code's context, and checking `code` could not tell them apart.
 *
 * @example A producer's fact; leaving out `pairCount`, or putting a subgraph
 * in `ecDataLinks`, does not compile:
 * ```ts
 * const fact: IssueFact<typeof ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS> = {
 *   code: ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS,
 *   severity: IssueSeverity.Error,
 *   impactedEntity: {entityType: 'UseCase', systemId: 3},
 *   relatedEntities: {
 *     ecDataLinks: [{entityType: 'DataLink', systemId: 0x20}],
 *   },
 *   params: {pairCount: 2},
 * };
 * ```
 *
 * @example Narrowing a fact of any code:
 * ```ts
 * function pairCountOf(fact: IssueFact): number | undefined {
 *   if (fact.code === ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS) {
 *     return fact.params.pairCount; // known to exist after the check
 *   }
 *   return undefined;
 * }
 * ```
 */
export type IssueFact<C extends IssueFactCode = IssueFactCode> = {
  [Code in C]: IssueFactOf<Code>;
}[C];
