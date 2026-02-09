/**
 * Handles parsing of VCPM (Voice Call Processing Manager) configuration properties from binary data.
 */
export class VcpmConfigProperty {
  /** Raw VCPM configuration data */
  readonly configData: Uint8Array;

  private constructor(configData: Uint8Array) {
    this.configData = configData;
  }

  /**
   * Create VcpmConfigProperty from binary payload
   */
  static fromPayload(payload: Uint8Array): VcpmConfigProperty {
    // For VCPM config, we store the raw payload as-is
    // eslint-disable-next-line unicorn/prefer-spread -- Uint8Array.slice() is more efficient than spread for typed arrays
    return new VcpmConfigProperty(payload.slice());
  }

  /**
   * Get the raw configuration data
   */
  getRawData(): Uint8Array {
    // eslint-disable-next-line unicorn/prefer-spread -- Uint8Array.slice() is more efficient than spread for typed arrays
    return this.configData.slice();
  }

  /**
   * Get the size of the configuration data
   */
  getDataSize(): number {
    return this.configData.length;
  }

  /**
   * Check if configuration data is empty
   */
  isEmpty(): boolean {
    return this.configData.length === 0;
  }
}
