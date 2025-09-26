/*----------------------------------------------------
 This converter is used to convert bytes into 
 a format that is accepted by specific type-orm driver
 For node.js -> Buffer
 RN -> Will decide based on driver
------------------------------------------------------*/
export interface BlobBytesConverter {
  toSql(value: Uint8Array | null | undefined): unknown; // app -> DB
  fromSql(value: unknown): Uint8Array | null; // DB -> app
}
