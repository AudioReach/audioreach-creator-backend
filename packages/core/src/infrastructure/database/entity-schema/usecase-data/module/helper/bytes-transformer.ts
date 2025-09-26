// core/make-bytes-transformer.ts
import {BlobBytesConverter} from '@infrastructure/database/entity-schema/usecase-data/module/helper/blob-unit8array.converter';
import type {ValueTransformer} from 'typeorm';

export const DbTypeToBytesTransformer = (
  codec: BlobBytesConverter,
): ValueTransformer => ({
  to: v => codec.toSql(v as Uint8Array | null | undefined),
  from: v => codec.fromSql(v),
});
