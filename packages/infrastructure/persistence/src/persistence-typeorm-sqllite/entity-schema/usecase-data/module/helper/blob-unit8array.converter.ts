/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/*----------------------------------------------------
 This converter is used to convert bytes into 
 a format that is accepted by specific type-orm driver
 For node.js -> Buffer
 RN -> Will decide based on driver
------------------------------------------------------*/
export interface BlobBytesConverter {
  toSql(value: Uint8Array | null | undefined): unknown; // app -> DB
  fromSql(value: unknown): Uint8Array | null; // DB -> app
}
