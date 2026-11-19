/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityRef} from '../../domain/identity/entity-identity.js';
import type {
  IssueContextMap,
  IssueFactCode,
} from '../../domain/issues/issue-context-map.js';
import type {FixOptionContext} from '../../domain/issues/issue-fact.js';
import type {EntityType} from '../../shared/entity-type.js';
import type {ClientInputSpec} from '../../shared/issues/fix-option.js';
import type {
  IssueCategory,
  IssueSeverity,
} from '../../shared/issues/severity.js';

/**
 * An entity reference as shown to people: `systemId` for machines and one
 * display string, written by `IdentityFormatter` (the natural identity, or
 * the systemId fallback when the identity is unknown).
 */
export interface RenderedEntityRef {
  readonly entityType: EntityType;
  readonly systemId: number;
  readonly displayName: string;
}

/** `T` with every `EntityRef` in it replaced by a `RenderedEntityRef`. */
export type Rendered<T> = T extends EntityRef
  ? RenderedEntityRef
  : T extends readonly (infer E)[]
    ? readonly Rendered<E>[]
    : T extends object
      ? {readonly [K in keyof T]: Rendered<T[K]>}
      : T;

type FixOptionKinds<C extends IssueFactCode> = IssueContextMap[C]['fixOptions'];

/** One rendered fix option of code `C` and kind `K`. */
export type RenderedFixOptionOf<
  C extends IssueFactCode,
  K extends keyof FixOptionKinds<C>,
> = {
  readonly id: string;
  readonly kind: K;
  readonly description: string;
  readonly relatedEntities: Rendered<FixOptionContext<C, K>['relatedEntities']>;
  readonly params: FixOptionContext<C, K>['params'];
  readonly commandType: string;
  readonly commandPayload: Readonly<Record<string, unknown>>;
  readonly requiredClientInputs: readonly ClientInputSpec[];
};

/** A rendered fix option of code `C`: one variant per kind. */
export type RenderedFixOption<C extends IssueFactCode = IssueFactCode> = {
  [Code in C]: {
    [K in keyof FixOptionKinds<Code>]: RenderedFixOptionOf<Code, K>;
  }[keyof FixOptionKinds<Code>];
}[C];

/** One rendered issue of code `C`. */
export type IssueOf<C extends IssueFactCode> = {
  readonly code: C;
  readonly severity: IssueSeverity;
  readonly category?: IssueCategory;
  readonly message: string;
  readonly impactedEntity?: RenderedEntityRef;
  readonly relatedEntities: Rendered<IssueContextMap[C]['relatedEntities']>;
  readonly params: IssueContextMap[C]['params'];
  readonly impactedUsecases?: readonly RenderedEntityRef[];
  readonly fixOptions?: readonly RenderedFixOption<C>[];
};

/**
 * An issue fact rendered for people: the same shape with a `message`, each
 * fix option's `description`, and every entity reference rendered.
 * `relatedEntities` and `params` are always present, empty when the code has
 * none. The default is the union of every code, so `code` narrows the rest.
 */
export type Issue<C extends IssueFactCode = IssueFactCode> = {
  [Code in C]: IssueOf<Code>;
}[C];
