/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Generic projection adapter — transforms a source type to a destination type
 * using a named projection function.
 *
 * Projection functions live in *-projections.ts files alongside their read models.
 * This keeps the transformation logic close to the types it operates on,
 * and avoids ad-hoc inline mapping scattered across handlers and controllers.
 */
export function project<TSource, TDest>(
  source: TSource,
  fn: (src: TSource) => TDest,
): TDest {
  return fn(source);
}
