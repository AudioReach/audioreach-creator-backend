import {ValueTransformer} from 'typeorm';

export function makeEnumTransformer<Value>(
  parseValue: (raw: unknown) => Value,
): ValueTransformer {
  return {
    to: (v: Value) => v as any, // app -> DB (store raw number/string)
    from: (raw: unknown) => {
      try {
        return parseValue(raw); // DB -> app (validate & narrow)
      } catch (error) {
        // Return raw value if parsing fails to prevent data loss
        console.warn(`Failed to parse enum value: ${raw}`, error);
        return raw as Value;
      }
    },
  };
}
