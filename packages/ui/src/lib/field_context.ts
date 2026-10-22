'use client';

import * as React from 'react';

// SNField wires a label, helper and error to the control inside it. The control
// reads this context instead of the caller threading ids through props, so
// `<SNField label="Email"><SNInput /></SNField>` is labelled and described
// correctly with no extra attributes.

export interface FieldState {
  id: string;
  /** Space separated ids of the helper and error paragraphs that are rendered. */
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

export const FieldContext = React.createContext<FieldState | null>(null);

interface OwnControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  required?: boolean;
}

export interface ControlA11yProps {
  id: string | undefined;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  required: boolean | undefined;
}

/**
 * Merges the field's wiring with the control's own props. Inside a field the
 * field's id wins for `id`: its label already points there, so a different id
 * on the control would leave the label orphaned (give the id to SNField
 * instead). The two `aria-describedby` lists are joined, and `aria-invalid` is
 * only ever set when something is actually wrong (an always-present
 * `aria-invalid="false"` is noise for screen readers).
 */
export function useFieldControl(own: OwnControlProps): ControlA11yProps {
  const field = React.useContext(FieldContext);
  const describedBy = [own['aria-describedby'], field?.describedBy].filter(Boolean).join(' ') || undefined;
  const ownInvalid = own['aria-invalid'] === true || own['aria-invalid'] === 'true';
  return {
    id: field?.id ?? own.id,
    'aria-describedby': describedBy,
    'aria-invalid': ownInvalid || field?.invalid ? true : undefined,
    required: own.required ?? (field?.required ? true : undefined),
  };
}
