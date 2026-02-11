/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Key-Value pair read model for use case queries
 */
export interface KeyVectorReadModel {
  readonly key: KeyReadModel;
  readonly value: ValueReadModel;
}

/**
 * Key read model
 */
export interface KeyReadModel {
  readonly systemId: number;
  readonly keyId: number;
  readonly name: string;
}

/**
 * Value read model
 */
export interface ValueReadModel {
  readonly systemId: number;
  readonly valueId: number;
  readonly name: string;
}
