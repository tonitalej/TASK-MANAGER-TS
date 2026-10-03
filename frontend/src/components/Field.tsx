import type { ReactNode } from 'react';

interface Props {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode; // the <input>/<select>/<textarea>; it must use the same id
}

// Every input gets a visible <label>. The error text is linked with aria-describedby on the
// input (see describedBy below), so screen readers read it together with the field.
export default function Field({ id, label, error, hint, children }: Props) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span id={`${id}-hint`} className="muted small">{hint}</span>}
      {error && <span id={`${id}-error`} className="field-error">{error}</span>}
    </div>
  );
}

/** Props for the input inside <Field>: marks it invalid and links its error or hint text. */
export function describedBy(id: string, error?: string, hint?: string) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
}
