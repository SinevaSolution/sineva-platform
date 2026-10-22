export type ClassValue = string | false | null | undefined;

// Joins class names. There is deliberately no tailwind-merge: every class in
// the new components comes from a static map, so a conflict is resolved by
// choosing the right map entry, not by string order. A caller className is
// appended last but cannot reliably override a conflicting utility already on
// the element (Tailwind orders its stylesheet, not the class attribute); use it
// for layout (w-full, max-w-*, margins), not to restyle a variant. The legacy
// primitives keep their own `cn` (tailwind-merge) until they are replaced.
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
