import {BinaryUtils} from '../utilities/binary-utils.js';

/**
 * Represents a single key-value pair in the GKV system
 */
export class KeyValue {
  constructor(
    public readonly keyId: number,
    public readonly value: number,
  ) {}

  /**
   * Check equality with another KeyValue
   */
  equals(other: KeyValue): boolean {
    return this.keyId === other.keyId && this.value === other.value;
  }

  /**
   * Clone this KeyValue instance
   */
  clone(): KeyValue {
    return new KeyValue(this.keyId, this.value);
  }
}

/**
 * Represents a collection of key-value pairs with utility methods
 * Based on C# IKeyValuePairList interface
 */
export class KeyValuePairList {
  private _keyValueList: KeyValue[];

  constructor(keyValues: KeyValue[]) {
    this._keyValueList = [...keyValues];
  }

  /**
   * Get all key-value pairs as readonly array
   */
  get keyValueList(): readonly KeyValue[] {
    return this._keyValueList;
  }

  /**
   * Get all key IDs as readonly array
   */
  get keyList(): readonly number[] {
    return this._keyValueList.map(kv => kv.keyId);
  }

  /**
   * Get all values as readonly array
   */
  get valueList(): readonly number[] {
    return this._keyValueList.map(kv => kv.value);
  }

  /**
   * Generate binary payload from key-value pairs
   */
  generatePayload(): Uint8Array {
    const buffer = new ArrayBuffer(
      this._keyValueList.length * 2 * BinaryUtils.SIZEOF_UINT32,
    );
    const view = new DataView(buffer);
    let offset = 0;

    for (const kv of this._keyValueList) {
      BinaryUtils.writeUint32(view, offset, kv.keyId);
      offset += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, offset, kv.value);
      offset += BinaryUtils.SIZEOF_UINT32;
    }

    return new Uint8Array(buffer);
  }

  /**
   * String representation of the key-value pair list
   */
  toString(): string {
    return `KeyValuePairList[${this._keyValueList.length} pairs: ${this._keyValueList
      .map(kv => `${kv.keyId}:${kv.value}`)
      .join(', ')}]`;
  }

  /**
   * Check equality with another KeyValuePairList
   */
  equals(other: KeyValuePairList): boolean {
    if (this._keyValueList.length !== other._keyValueList.length) {
      return false;
    }

    for (let i = 0; i < this._keyValueList.length; i++) {
      if (!this._keyValueList[i].equals(other._keyValueList[i])) {
        return false;
      }
    }

    return true;
  }
}
