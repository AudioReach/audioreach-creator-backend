/**
 * Binary data utilities for consistent cross-platform binary operations.
 * Provides standardized methods for reading/writing binary data with consistent endianness.
 */
export class BinaryUtils {
  // Size constants
  static readonly SIZEOF_UINT32 = 4;
  static readonly SIZEOF_INT32 = 4;
  static readonly SIZEOF_UINT16 = 2;
  static readonly SIZEOF_UINT8 = 1;

  /**
   * Convert 4-character ASCII string to UInt32 (little-endian).
   *
   * @param str - 4-character ASCII string
   * @returns UInt32 value in little-endian format
   */
  static stringToUint32(str: string): number {
    if (str.length !== 4) {
      throw new Error(
        `String must be exactly 4 characters, got: ${str.length}`,
      );
    }

    const bytes = new TextEncoder().encode(str);
    if (bytes.length !== 4) {
      throw new Error(
        `String must encode to exactly 4 bytes, got: ${bytes.length}`,
      );
    }

    // Convert bytes to UInt32 in little-endian format
    return (
      (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0
    );
  }

  /**
   * Convert UInt32 to 4-character ASCII string (little-endian).
   *
   * @param value - UInt32 value
   * @returns 4-character ASCII string
   */
  static uint32ToString(value: number): string {
    // Extract bytes in little-endian format
    const bytes = new Uint8Array(4);
    bytes[0] = value & 0xff;
    bytes[1] = (value >>> 8) & 0xff;
    bytes[2] = (value >>> 16) & 0xff;
    bytes[3] = (value >>> 24) & 0xff;

    return new TextDecoder('ascii').decode(bytes);
  }

  /**
   * Read UInt32 from DataView (always little-endian).
   *
   * @param view - DataView to read from
   * @param offset - Byte offset to read from
   * @returns UInt32 value
   */
  static readUint32(view: DataView, offset: number): number {
    return view.getUint32(offset, true); // true = little-endian
  }

  /**
   * Read Int32 from DataView (always little-endian).
   *
   * @param view - DataView to read from
   * @param offset - Byte offset to read from
   * @returns Int32 value
   */
  static readInt32(view: DataView, offset: number): number {
    return view.getInt32(offset, true); // true = little-endian
  }

  /**
   * Write UInt32 to DataView (always little-endian).
   *
   * @param view - DataView to write to
   * @param offset - Byte offset to write to
   * @param value - UInt32 value to write
   */
  static writeUint32(view: DataView, offset: number, value: number): void {
    view.setUint32(offset, value, true); // true = little-endian
  }

  /**
   * Read UInt16 from DataView (always little-endian).
   *
   * @param view - DataView to read from
   * @param offset - Byte offset to read from
   * @returns UInt16 value
   */
  static readUint16(view: DataView, offset: number): number {
    return view.getUint16(offset, true); // true = little-endian
  }

  /**
   * Write UInt16 to DataView (always little-endian).
   *
   * @param view - DataView to write to
   * @param offset - Byte offset to write to
   * @param value - UInt16 value to write
   */
  static writeUint16(view: DataView, offset: number, value: number): void {
    view.setUint16(offset, value, true); // true = little-endian
  }

  /**
   * Read UInt8 from DataView.
   *
   * @param view - DataView to read from
   * @param offset - Byte offset to read from
   * @returns UInt8 value
   */
  static readUint8(view: DataView, offset: number): number {
    return view.getUint8(offset);
  }

  /**
   * Write UInt8 to DataView.
   *
   * @param view - DataView to write to
   * @param offset - Byte offset to write to
   * @param value - UInt8 value to write
   */
  static writeUint8(view: DataView, offset: number, value: number): void {
    view.setUint8(offset, value);
  }
}
