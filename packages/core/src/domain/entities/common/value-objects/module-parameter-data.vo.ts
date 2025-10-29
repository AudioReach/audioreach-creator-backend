/**
 * This class can be used for add or update payload for a param, remove id is enough
 */
export class ModuleParameterData {
  constructor(
    readonly parameterId: number,
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
