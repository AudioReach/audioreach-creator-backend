/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  ACDBVersionInfo,
  CodecInfo,
} from '../../../../application/file-operations/shared/acdb-chunks/header-chunk.js';

/**
 * Header entity representing ACDB file metadata.
 * Created from HeaderChunk during Phase 2 domain assembly.
 */
export class HeaderEntity {
  constructor(
    public readonly headerVersion: number,
    public readonly version: ACDBVersionInfo,
    public readonly codecInfos: CodecInfo[],
    public readonly modifiedDate: number,
    public readonly oemInfo: string,
    public readonly createdAt: Date = new Date(),
  ) {
    this.validate();
  }

  private validate(): void {
    if (this.headerVersion <= 0) {
      throw new Error('Header version must be positive');
    }
    if (!this.version) {
      throw new Error('ACDB version info is required');
    }
    if (!this.codecInfos) {
      throw new Error('Codec infos array is required');
    }
    if (this.modifiedDate < 0) {
      throw new Error('Modified date must be non-negative');
    }
    if (this.oemInfo == null) {
      throw new Error('OEM info is required (can be empty string)');
    }
  }

  /**
   * Check if this header is compatible with another header version
   */
  isCompatibleWith(otherHeaderVersion: number): boolean {
    return this.headerVersion === otherHeaderVersion;
  }

  /**
   * Get version as string for display
   */
  getVersionString(): string {
    return `${this.version.major}.${this.version.minor}.${this.version.revision}.${this.version.cplInfo}`;
  }

  /**
   * Get formatted modified date
   */
  getModifiedDate(): Date {
    return new Date(this.modifiedDate * 1000); // Convert from Unix timestamp
  }

  /**
   * Serialize entity to plain object
   */
  toJSON() {
    return {
      headerVersion: this.headerVersion,
      version: this.version,
      codecInfos: this.codecInfos,
      modifiedDate: this.modifiedDate,
      oemInfo: this.oemInfo,
      createdAt: this.createdAt.toISOString(),
    };
  }

  /**
   * Create entity from plain object (for deserialization)
   */
  static fromJSON(data: any): HeaderEntity {
    return new HeaderEntity(
      data.headerVersion,
      data.version,
      data.codecInfos,
      data.modifiedDate,
      data.oemInfo,
      new Date(data.createdAt),
    );
  }
}
