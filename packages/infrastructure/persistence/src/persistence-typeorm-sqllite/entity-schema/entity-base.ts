import type {EntitySchemaColumnOptions} from 'typeorm';

export interface EntityBaseRow {
  //arc specific id, should be treated as primary key for the enity whenever possible
  systemId: number;
  //stores the enity creation date
  creationDate: Date;
  //stores entity update date
  updateDate: Date;
}

export const BaseColumnSchemaPart = {
  systemId: {
    name: 'system_id',
    type: Number,
    primary: true,
  } as EntitySchemaColumnOptions,

  creationDate: {
    name: 'created_at',
    type: Date,
    createDate: true,
  } as EntitySchemaColumnOptions,

  updateDate: {
    name: 'updated_at',
    type: Date,
    updateDate: true,
  } as EntitySchemaColumnOptions,
};
