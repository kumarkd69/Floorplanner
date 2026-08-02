import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Unit } from '@/types';
import { formatLength, fromMM, parseLength } from '@/core/units';
import { IconClose } from './Icons';

/* --------------------------------------------------------------- button */

export function Button({
  children,
  active,
  variant,
  tip,
  size,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  tip?: string;
  size?: 'sm';
}) {
  const cls = [
    'btn',
    active && 'btn--active',
    variant && `btn--${variant}`,
    size === 'sm' && 'btn--sm',
    tip && 'tip',
    rest.className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      {...rest}
      className={cls}
      data-tip={tip}
      aria-pressed={active === undefined ? undefined : active}
      title={rest.title ?? (tip ? undefined : rest['aria-label'])}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  on,
  label,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean; label: string }) {
  return (
    <button
      type="button"
      {...rest}
      className={`iconbtn ${on ? 'iconbtn--on' : ''} ${rest.className ?? ''}`}
      aria-label={label}
      title={label}
      aria-pressed={on}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- field */

export function Field({
  label,
  children,
  stack,
}: {
  label: string;
  children: ReactNode;
  stack?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field ${stack ? 'field--stack' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        {typeof children === 'object' && children !== null && 'props' in (children as object)
          ? // Wire the label to the control without forcing every call site to
            // thread an id through.
            wireId(children as React.ReactElement, id)
          : children}
      </div>
    </div>
  );
}

function wireId(el: React.ReactElement, id: string): React.ReactElement {
  if (el.props && (el.props as { id?: string }).id) return el;
  return { ...el, props: { ...el.props, id } } as React.ReactElement;
}

export function TextInput({
  value,
  onCommit,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return (
    <input
      {...rest}
      className={`input ${rest.className ?? ''}`}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        rest.onFocus?.(e);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        focused.current = false;
        onCommit(draft);
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onCommit(draft);
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
    />
  );
}

export function NumberInput({
  value,
  onCommit,
  step = 1,
  min,
  max,
  suffix,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(round(value)));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(round(value)));
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(String(round(value)));
      return;
    }
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    setDraft(String(round(v)));
    onCommit(v);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        className={`input ${rest.className ?? ''}`}
        style={suffix ? { paddingRight: 28 } : undefined}
        value={draft}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          focused.current = false;
          commit(draft);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            commit(draft);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = Number(draft);
            if (!Number.isFinite(base)) return;
            const mult = e.shiftKey ? 10 : 1;
            commit(String(base + (e.key === 'ArrowUp' ? step : -step) * mult));
          }
        }}
      />
      {suffix && (
        <span
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 11,
            color: 'var(--text-subtle)',
            pointerEvents: 'none',
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

/**
 * A length input that speaks the project's unit.
 *
 * Displays in the project unit but accepts any notation the parser understands
 * (`12'6"`, `3.5m`, `450mm`), so a user working in feet can still type an exact
 * metric door width without switching the whole project over.
 */
export function LengthInput({
  valueMM,
  unit,
  onCommit,
  min = 0,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  valueMM: number;
  unit: Unit;
  onCommit: (mm: number) => void;
  min?: number;
}) {
  const display = () =>
    unit === 'ft' ? formatLength(valueMM, unit) : String(round(fromMM(valueMM, unit), 3));
  const [draft, setDraft] = useState(display);
  const [bad, setBad] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMM, unit]);

  const commit = () => {
    const mm = parseLength(draft, unit);
    if (mm === null) {
      setBad(true);
      setTimeout(() => setBad(false), 900);
      setDraft(display());
      return;
    }
    const v = Math.max(min, mm);
    onCommit(v);
    setDraft(unit === 'ft' ? formatLength(v, unit) : String(round(fromMM(v, unit), 3)));
  };

  return (
    <input
      {...rest}
      type="text"
      className={`input ${bad ? 'input--invalid' : ''} ${rest.className ?? ''}`}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <select
      {...rest}
      className={`select ${rest.className ?? ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`seg__item ${value === o.value ? 'seg__item--active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="switch">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/* --------------------------------------------------------------- dialog */

export function Dialog({
  title,
  subtitle,
  children,
  footer,
  onClose,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      // Trap focus so keyboard users cannot tab behind the modal.
      if (e.key === 'Tab' && ref.current) {
        const items = ref.current.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`dialog ${wide ? 'dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="dialog__head">
          <div>
            <h2 className="dialog__title">{title}</h2>
            {subtitle && <p className="dialog__sub">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <IconClose />
          </IconButton>
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
