// domain/enums/EnumCodec.ts
export type EnumCodec<Name extends string, Value extends string | number> = {
  readonly byName: Record<Name, Value>;
  readonly byValue: Record<Value, Name>;
  readonly names: readonly Name[];
  readonly values: readonly Value[];
  nameToValue(name: Name): Value;
  valueToName(value: Value): Name;
  isValue(raw: unknown): raw is Value;
  parseValue(raw: unknown): Value; // throws if invalid
};

export function defineEnum<const T extends Record<string, number | string>>(
  def: T,
): EnumCodec<keyof T & string, T[keyof T & string]> {
  type Name = keyof T & string;
  type Value = T[Name];

  const byName = def;

  // Reverse map: value -> name
  const byValue = Object.fromEntries(
    Object.entries(def).map(([n, v]) => [v as string | number, n]),
  ) as Record<Value, Name>;

  const names = Object.keys(def) as Name[];
  const values = names.map(n => def[n]) as Value[];

  const isValue = (raw: unknown): raw is Value =>
    Object.prototype.hasOwnProperty.call(byValue, raw as any);

  const parseValue = (raw: unknown): Value => {
    if (!isValue(raw)) {
      throw new Error(`Invalid enum value: ${String(raw)}`);
    }
    return raw;
  };

  const codec: EnumCodec<Name, Value> = {
    byName,
    byValue,
    names,
    values,
    nameToValue: name => byName[name],
    valueToName: value => byValue[value],
    isValue,
    parseValue,
  };

  return codec;
}
