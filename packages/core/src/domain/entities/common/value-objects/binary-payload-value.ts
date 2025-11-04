/**
 * Reusable base for value-objects that carry a binary payload (Uint8Array)
 * Provides defensive-copy semantics and a protected setter for subclasses.
 */
export abstract class BinaryPayloadValue {
  protected _payload: Uint8Array | null;

  protected constructor(payload: Uint8Array | null) {
    // Defensive copy to prevent external mutation of the same buffer
    this._payload = payload ? new Uint8Array(payload) : null;
  }

  // Return a defensive copy so consumers cannot mutate internal state
  getPayloadCopy(): Uint8Array | null {
    return this._payload ? new Uint8Array(this._payload) : null;
  }

  // Protected setter for subclasses to expose their own mutation methods
  protected setPayloadCopyInternal(src: Uint8Array | null) {
    this._payload = src ? new Uint8Array(src) : null;
  }
}
