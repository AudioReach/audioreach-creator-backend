/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Branded type utility for creating nominal types from primitives.
 * Brands are compile-time only and have zero runtime cost.
 */
type Brand<K, T> = K & {__brand: T};

/**
 * Natural ID - identifier from source files (ACDB, AWSP)
 * Used to identify entities before they are persisted to the database.
 */
export type NaturalId = Brand<number, 'NaturalId'>;

/**
 * System ID - database-generated identifier
 * Used to identify entities after they are persisted to the database.
 */
export type SystemId = Brand<number, 'SystemId'>;

/**
 * Helper function to cast a number to NaturalId.
 * Use at boundaries where numbers come from external sources.
 */
export const asNaturalId = (id: number): NaturalId => id as NaturalId;

/**
 * Helper function to cast a number to SystemId.
 * Use at boundaries where numbers come from external sources.
 */
export const asSystemId = (id: number): SystemId => id as SystemId;

/**
 * Extract the numeric value from a branded ID.
 * Useful when interfacing with external APIs that expect plain numbers.
 */
export const unbranded = (id: NaturalId | SystemId): number => id as number;
