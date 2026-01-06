import {ApiProperty} from '@nestjs/swagger';

/**
 * TypeScript equivalent of C# IEquatable interface
 */
interface IEquatable<T> {
  equals(other: T): boolean;
}

export class KeyInfo implements IEquatable<KeyInfo> {
  @ApiProperty({description: 'Key id', type: Number})
  readonly keyId!: number;

  @ApiProperty({description: 'Key name', type: String})
  readonly keyLabel!: string;

  constructor(keyId: number, keyLabel: string) {
    this.keyId = keyId;
    this.keyLabel = keyLabel;
  }

  equals(other: KeyInfo): boolean {
    if (!other) return false;
    return this.keyId === other.keyId && this.keyLabel === other.keyLabel;
  }
}

export class KeyValueInfo extends KeyInfo {
  @ApiProperty({description: 'Value id', type: Number})
  readonly valueId!: number;

  @ApiProperty({description: 'Value name', type: String})
  readonly valueLabel!: string;

  constructor(
    keyId: number,
    valueId: number,
    keyName: string,
    valueName: string,
  ) {
    super(keyId, keyName);
    this.valueId = valueId;
    this.valueLabel = valueName;
  }

  override equals(object: KeyValueInfo): boolean {
    if (!(object instanceof KeyValueInfo)) return false;

    return object.keyId === this.keyId && object.valueId === this.valueId;
  }

  override toString(): string {
    return `[${this.keyLabel}:${this.valueLabel}]`;
  }
}

export class KVInfo implements IEquatable<KVInfo> {
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

  equals(other: KVInfo | null): boolean {
    if (!other || !other.keyValueCollection) return false;

    if (other.keyValueCollection.length !== this.keyValueCollection.length)
      return false;

    for (let index = 0; index < this.keyValueCollection.length; index++) {
      const item = this.keyValueCollection[index];

      const otherItem = other.keyValueCollection[index];
      if (!otherItem || !item.equals(otherItem)) {
        return false;
      }
    }
    return true;
  }

  toString(): string {
    let result = '';
    for (const kv of this.keyValueCollection) {
      result += kv.toString();
    }
    return result;
  }
}
