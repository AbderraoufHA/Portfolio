import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../lib/utils';

/* ----------------------------------------------------------------- button */

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'quiet';

export function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-[13px]',
        variant === 'primary' && 'border-transparent bg-accent text-bg hover:brightness-110',
        variant === 'ghost' && 'border-line bg-surface text-ink hover:bg-elevated',
        variant === 'danger' && 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20',
        variant === 'quiet' && 'border-transparent text-muted hover:bg-elevated hover:text-ink',
        className,
      )}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className ?? 'h-4 w-4')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('field', className)}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-accent">*</span>}
      </label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx('field-input', className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx('field-input scroll-thin', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx('field-input', className)}>
      {children}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface px-3 py-2.5">
      <div>
        <label htmlFor={inputId} className="text-[13px] font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[11.5px] text-muted">{description}</p>}
      </div>
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent/60 bg-accent/80' : 'border-line bg-elevated',
        )}
      >
        <span
          className={cx(
            'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all',
            checked ? 'left-[1.15rem] bg-bg' : 'left-0.5 bg-muted',
          )}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ layout */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-xl border border-line bg-surface', className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  actions,
  id,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-[13px] font-semibold" id={id}>
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[11.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'ok' | 'warn' | 'bad' | 'accent';
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
        tone === 'muted' && 'border-line bg-elevated text-muted',
        tone === 'ok' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'bad' && 'border-red-500/30 bg-red-500/10 text-red-300',
        tone === 'accent' && 'border-accent/30 bg-accent/10 text-accent',
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md text-[12.5px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = 'warn',
  title,
  children,
  action,
}: {
  tone?: 'warn' | 'bad' | 'info' | 'ok';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx(
        'rounded-lg border p-3',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/[0.06]',
        tone === 'bad' && 'border-red-500/30 bg-red-500/[0.06]',
        tone === 'info' && 'border-line bg-elevated/60',
        tone === 'ok' && 'border-emerald-500/30 bg-emerald-500/[0.06]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-medium">{title}</p>
          {children && <div className="mt-1 text-[12px] leading-relaxed text-muted">{children}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className ?? 'h-4 w-full')} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ toasts */

type ToastKind = 'ok' | 'bad' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<{ push: (message: string, kind?: ToastKind) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    counter.current += 1;
    const id = counter.current;
    setItems((current) => [...current, { id, message, kind }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cx(
              'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] shadow-lift backdrop-blur',
              item.kind === 'ok' && 'border-emerald-500/40 bg-emerald-950/80 text-emerald-100',
              item.kind === 'bad' && 'border-red-500/40 bg-red-950/80 text-red-100',
              item.kind === 'info' && 'border-line bg-surface/95 text-ink',
            )}
          >
            <span aria-hidden="true" className="mt-px font-mono text-[11px] opacity-70">
              {item.kind === 'ok' ? '✓' : item.kind === 'bad' ? '✖' : 'i'}
            </span>
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

/* ------------------------------------------------------------------- modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = window.setTimeout(() => {
      const focusable = panel.current?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panel.current)?.focus();
    }, 20);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const nodes = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusFirst);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
        tabIndex={-1}
        className={cx(
          'my-8 w-full rounded-xl border border-line bg-surface shadow-lift outline-none',
          size === 'sm' && 'max-w-sm',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-3xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[11.5px] text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-elevated hover:text-ink"
            aria-label="Close dialog"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[12.5px] leading-relaxed text-muted">{description}</p>
      {children}
    </Modal>
  );
}

/* ------------------------------------------------------------------- misc */

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'accent' | 'ok' | 'warn';
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p
        className={cx(
          'mt-1.5 text-xl font-semibold tracking-tight',
          tone === 'accent' && 'text-accent',
          tone === 'ok' && 'text-emerald-300',
          tone === 'warn' && 'text-amber-300',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  const hint =
    error && typeof error === 'object' && 'hint' in error ? String((error as { hint?: string }).hint ?? '') : '';
  return (
    <Alert
      tone="bad"
      title={message}
      action={
        onRetry ? (
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      {hint}
    </Alert>
  );
}
