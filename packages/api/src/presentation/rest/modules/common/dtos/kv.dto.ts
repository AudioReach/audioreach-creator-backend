import { ApiProperty } from '@nestjs/swagger';

/**
 * TypeScript equivalent of C# IEquatable interface
 */
interface IEquatable<T> {
    equals(other: T): boolean;
}


export class KeyInfo implements IEquatable<KeyInfo> {
    private _keyId: number;
    private _keyLabel: string;

    constructor(keyId: number, keyLabel: string) {
        this._keyId = keyId;
        this._keyLabel = keyLabel;
    }

    @ApiProperty({ description: 'Key id', type: Number })
    get keyId(): number {
        return this._keyId;
    }

    @ApiProperty({ description: 'Key name', type: String })
    get keyLabel(): string {
        return this._keyLabel;
    }

    equals(other: KeyInfo): boolean {
        if (!other) return false;
        return this._keyId === other._keyId && this._keyLabel === other._keyLabel;
    }
}


export class KeyValueInfo extends KeyInfo {
    private _valueId: number;
    private _valueLabel: string;

    @ApiProperty({ description: 'Value id', type: Number })
    get valueId(): number {
        return this._valueId;
    }

    @ApiProperty({ description: 'Value name', type: String })
    get valueLabel(): string {
        return this._valueLabel;
    }

    constructor(keyId: number, valueId: number, keyName: string, valueName: string) {
        super(keyId, keyName);
        this._valueId = valueId;
        this._valueLabel = valueName;
    }

    override equals(object: KeyValueInfo): boolean {
        if (!(object instanceof KeyValueInfo)) return false;

        return object.keyId === this.keyId &&
            object.valueId === this._valueId;
    }

    override toString(): string {
        return `[${this.keyLabel}:${this._valueLabel}]`;
    }
}


export class KVInfo implements IEquatable<KVInfo> {
    private _keyValueCollection: ReadonlyArray<KeyValueInfo>;
    private _systemId: string;

    @ApiProperty({
        description: 'Collection of key-value pairs',
        type: [KeyValueInfo]
    })
    get keyValueCollection(): ReadonlyArray<KeyValueInfo> {
        return this._keyValueCollection;
    }

    @ApiProperty({ description: 'The system identifier', type: String })
    get systemId(): string {
        return this._systemId;
    }
    set systemId(value: string) {
        this._systemId = value;
    }

    constructor();
    constructor(keyValueInfo: KeyValueInfo[]);
    constructor(keyValueInfo?: KeyValueInfo[]) {
        this._keyValueCollection = keyValueInfo ? [...keyValueInfo] : [];
        this._systemId = '';
    }

    getHashCode(): number {
        let hash = 17;

        // Get hash code for all items in array
        for (const item of this._keyValueCollection) {
            hash = hash * 23 + item.keyId;
            hash = hash * 23 + item.valueId;
        }

        return hash;
    }

    equals(other: KVInfo | null): boolean {
        if (!other || !other.keyValueCollection) return false;

        if (other.keyValueCollection.length !== this._keyValueCollection.length) return false;

        for (let index = 0; index < this._keyValueCollection.length; index++) {
            // eslint-disable-next-line security/detect-object-injection
            const item = this._keyValueCollection[index];
            // eslint-disable-next-line security/detect-object-injection
            const otherItem = other.keyValueCollection[index];
            if (!otherItem || !item.equals(otherItem)) {
                return false;
            }
        }
        return true;
    }

    toString(): string {
        let result = '';
        for (const kv of this._keyValueCollection) {
            result += kv.toString();
        }
        return result;
    }
}
