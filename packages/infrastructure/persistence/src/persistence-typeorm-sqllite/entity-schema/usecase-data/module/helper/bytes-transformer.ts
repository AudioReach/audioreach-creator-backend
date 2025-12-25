// core/make-bytes-transformer.ts
import type {BlobBytesConverter} from './blob-unit8array.converter.js';
import type {ValueTransformer} from 'typeorm';

export const DbTypeToBytesTransformer = (
  codec: BlobBytesConverter,
): ValueTransformer => ({
  to: v => codec.toSql(v as Uint8Array | null | undefined),
  from: v => codec.fromSql(v),
});
