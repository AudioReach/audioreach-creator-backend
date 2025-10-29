/**
 * Value object for a module property.
 * @param propertyDefinitionSystemId The system id of the property definition.
 * @param payload Binary payload. Use null when absent.
 */

export class SpfModulePropertyData {
  constructor(
    readonly propertyDefinitionSystemId: number,
    private payload: Uint8Array | null,
  ) {
    // Defensive copy to prevent external mutation of the same buffer
    this.payload = payload ? new Uint8Array(payload) : null;
  }

  getPayloadCopy(): Uint8Array | null {
    return this.payload ? new Uint8Array(this.payload) : null;
  }

  setPayloadCopy(src: Uint8Array | null) {
    this.payload = src ? new Uint8Array(src) : null;
  }
}
