/**
 * Handles parsing of VCPM (Voice Call Processing Manager) configuration properties from binary data.
 * Based on C# VcpmSgCfg implementation.
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
    // The C# implementation also stores it as raw data
    return new VcpmConfigProperty(payload.slice());
  }

  /**
   * Get the raw configuration data
   */
  getRawData(): Uint8Array {
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
