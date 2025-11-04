/**
 * This class can be used for add or update payload for a param, remove id is enough
 */
import {BinaryPayloadValue} from './binary-payload-value.js';

export class ModuleParameterData extends BinaryPayloadValue {
  constructor(
    readonly parameterSystemId: number,
    payload: Uint8Array | null,
  ) {
    super(payload);
  }

  getPayloadCopy(): Uint8Array | null {
    return super.getPayloadCopy();
  }

  setPayloadCopy(src: Uint8Array | null) {
    this.setPayloadCopyInternal(src);
  }
}
