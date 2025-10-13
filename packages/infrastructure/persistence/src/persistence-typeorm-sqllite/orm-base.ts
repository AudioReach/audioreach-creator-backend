// packages/infrastructure/persistence/persistence-typeorm-sqllite/orm-base.ts
import {getAllEntitySchemas} from './entity-schema/index.js';
import type {BlobBytesConverter} from './entity-schema/usecase-data/module/helper/blob-unit8array.converter.js';
import {migrations} from './migration-index.js';
import type {DataSourceOptions} from 'typeorm';

export function getOrmBase(
  blobConverter: BlobBytesConverter,
): Pick<DataSourceOptions, 'entities' | 'migrations' | 'synchronize'> {
  return {
    entities: getAllEntitySchemas(blobConverter), // EntitySchema[]
    migrations, // explicit array from migration-index.ts
    synchronize: false, // rely on migrations only
  };
}
