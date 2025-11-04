import {BinaryPayloadValue} from '../../../common/value-objects/binary-payload-value.js';

export class ContainerPropertyValue extends BinaryPayloadValue {
  readonly containerPropertyDefinitionSystemId: number;

  constructor(
    containerPropertyDefinitionSystemId: number,
    payload: Uint8Array | null,
  ) {
    super(payload);
    this.containerPropertyDefinitionSystemId =
      containerPropertyDefinitionSystemId;
  }

  getPayloadCopy(): Uint8Array | null {
    return super.getPayloadCopy();
  }

  // Add/replace payload using defensive copy semantics
  setPayloadCopy(value: Uint8Array | null): void {
    this.setPayloadCopyInternal(value);
  }
}
