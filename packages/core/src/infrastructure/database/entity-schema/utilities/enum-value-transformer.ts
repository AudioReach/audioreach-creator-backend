import {ValueTransformer} from 'typeorm';

export function makeEnumTransformer<Value>(
  parseValue: (raw: unknown) => Value,
): ValueTransformer {
  return {
    to: (v: Value) => v as any, // app -> DB (store raw number/string)
    from: (raw: unknown) => parseValue(raw), // DB -> app (validate & narrow)
  };
}
