/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class KeyInfo {
  @ApiProperty({description: 'Key id', type: Number})
  readonly keyId!: number;

  @ApiProperty({description: 'Key name', type: String})
  readonly keyLabel!: string;

  @ApiProperty({description: 'Key system identifier', type: String})
  readonly keySystemId!: string;

  constructor(keyId: number, keyLabel: string, keySystemId: string) {
    this.keyId = keyId;
    this.keyLabel = keyLabel;
    this.keySystemId = keySystemId;
  }

  equals(other: KeyInfo): boolean {
    if (!other) return false;
    return (
      this.keyId === other.keyId &&
      this.keyLabel === other.keyLabel &&
      this.keySystemId === other.keySystemId
    );
  }
}

export class ValueInfo {
  @ApiProperty({description: 'Value id', type: Number})
  readonly valueId!: number;

  @ApiProperty({description: 'Value name', type: String})
  readonly valueLabel!: string;

  @ApiProperty({description: 'Value system identifier', type: String})
  readonly valueSystemId!: string;

  constructor(valueId: number, valueLabel: string, valueSystemId: string) {
    this.valueId = valueId;
    this.valueLabel = valueLabel;
    this.valueSystemId = valueSystemId;
  }

  equals(other: ValueInfo): boolean {
    if (!other) return false;
    return (
      this.valueId === other.valueId &&
      this.valueLabel === other.valueLabel &&
      this.valueSystemId === other.valueSystemId
    );
  }
}

export class KeyValueInfo {
  @ApiProperty({description: 'Key information', type: KeyInfo})
  readonly keyInfo!: KeyInfo;

  @ApiProperty({description: 'Value information', type: ValueInfo})
  readonly valueInfo!: ValueInfo;

  constructor(keyInfo: KeyInfo, valueInfo: ValueInfo) {
    this.keyInfo = keyInfo;
    this.valueInfo = valueInfo;
  }

  equals(other: KeyValueInfo): boolean {
    if (!other) return false;
    return (
      this.keyInfo.equals(other.keyInfo) &&
      this.valueInfo.equals(other.valueInfo)
    );
  }

  toString(): string {
    return `[${this.keyInfo.keyLabel}:${this.valueInfo.valueLabel}]`;
  }
}

export class KeyValuePairsInfo {
  @ApiProperty({
    description: 'Collection of key-value pairs',
    type: [KeyValueInfo],
  })
  readonly keyValueCollection: ReadonlyArray<KeyValueInfo>;

  @ApiProperty({description: 'The system identifier', type: String})
  systemId: string;

  constructor();
  constructor(keyValueInfo: KeyValueInfo[]);
  constructor(keyValueInfo?: KeyValueInfo[]) {
    this.keyValueCollection = keyValueInfo ? [...keyValueInfo] : [];
    this.systemId = '';
  }
}
