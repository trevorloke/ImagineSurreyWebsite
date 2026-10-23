import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type Common = { id: string; label: ReactNode; error?: string; className?: string };

export function TextField({
  id,
  label,
  error,
  className,
  inputClassName,
  ...input
}: Common & { inputClassName?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`input ${inputClassName ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  id,
  label,
  error,
  className,
  children,
  ...select
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...select}
      >
        {children}
      </select>
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ name, children, error, ...input }: { name: string; children: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="check">
        <input type="checkbox" name={name} {...input} />
        <span>{children}</span>
      </label>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "note" }) {
  return (
    <div role={tone === "error" ? "alert" : "note"} className={`alert ${tone === "note" ? "alert--note" : ""}`}>
      <span aria-hidden="true" className="alert-icon">
        !
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Hidden from people, irresistible to bots. Submissions that fill it are dropped. */
export function Honeypot() {
  return (
    <div className="honeypot" aria-hidden="true">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
