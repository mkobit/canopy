import React, { useEffect, useRef, useState } from 'react';
import { usePlugin, type FieldDefinition } from '../../context/plugin-context';

interface DialogHeaderProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly onCancel: () => void;
}

const DialogHeader: React.FC<DialogHeaderProps> = ({ title, description, onCancel }) => (
  <div className="px-6 py-4 bg-[#121a25]/80 border-b border-[#2a3c54]/30 flex items-center justify-between">
    <div>
      <h2 className="text-base font-bold tracking-wide text-[#a2c9ff] uppercase font-display">
        {title}
      </h2>
      {description && (
        <p className="text-xs text-on-surface-variant mt-1 font-body">{description}</p>
      )}
    </div>
    <button
      type="button"
      onClick={onCancel}
      className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-[#202f44]/40 transition-colors"
    >
      <span className="material-symbols-outlined text-[20px]">close</span>
    </button>
  </div>
);

interface DialogFooterProps {
  readonly submitLabel: string;
  readonly onCancel: () => void;
  readonly isInvalid: boolean;
}

const DialogFooter: React.FC<DialogFooterProps> = ({ submitLabel, onCancel, isInvalid }) => (
  <div className="px-6 py-4 bg-[#121a25]/50 border-t border-[#2a3c54]/30 flex justify-end gap-3">
    <button
      type="button"
      onClick={onCancel}
      className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:bg-[#202f44]/40 transition-all"
    >
      Cancel
    </button>
    <button
      type="submit"
      disabled={isInvalid}
      className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-primary-container text-on-primary-container disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-container/80 transition-all flex items-center gap-1.5 active:scale-[0.98]"
    >
      <span>{submitLabel || 'Submit'}</span>
      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
    </button>
  </div>
);

interface FormFieldInputProps {
  readonly field: FieldDefinition;
  readonly value: unknown;
  readonly onChange: (val: unknown) => void;
}

const FormFieldInput: React.FC<FormFieldInputProps> = ({ field, value, onChange }) => {
  if (field.kind === 'boolean') {
    return (
      <label className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#121a25]/30 border border-[#2a3c54]/10 cursor-pointer hover:bg-[#121a25]/50 transition-colors">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-outline-variant/30 text-primary focus:ring-primary/40 bg-background"
        />
        <span className="text-sm text-on-surface">{field.label}</span>
      </label>
    );
  }

  if (field.kind === 'node-reference' && field.options && field.options.length > 0) {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#121a25]/50 border border-[#2a3c54]/30 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all"
      >
        <option value="" disabled>
          Select a node...
        </option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
      value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#121a25]/50 border border-[#2a3c54]/30 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all font-body"
      required={field.required}
      placeholder={`Enter ${field.label.toLowerCase()}...`}
    />
  );
};

const getInitialValues = (fields: readonly FieldDefinition[]): Record<string, unknown> => {
  const entries = fields.map((field) => {
    const defaultVal = field.defaultValue === undefined ? '' : field.defaultValue;
    const val = field.kind === 'boolean' && field.defaultValue === undefined ? false : defaultVal;
    return [field.name, val] as const;
  });
  return Object.fromEntries(entries);
};

const updateDefaultValues = (
  fields: readonly FieldDefinition[],
  prev: Record<string, unknown>,
): Record<string, unknown> => {
  const entries = fields.map((field) => {
    const prevVal = prev[field.name];
    const defaultVal = field.defaultValue === undefined ? '' : field.defaultValue;
    const val = field.kind === 'boolean' && field.defaultValue === undefined ? false : defaultVal;
    const finalVal = prevVal === undefined ? val : prevVal;
    return [field.name, finalVal] as const;
  });
  return { ...prev, ...Object.fromEntries(entries) };
};

export const WizardDialog: React.FC = () => {
  const { activeWizard, submitWizardStep, cancelWizard } = usePlugin();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (activeWizard) {
      if (dialog.open) {
        setFormValues((prev) => updateDefaultValues(activeWizard.stepSchema.fields, prev));
      } else {
        setFormValues(getInitialValues(activeWizard.stepSchema.fields));
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [activeWizard]);

  if (!activeWizard) return null;

  const { stepSchema, error } = activeWizard;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entries = stepSchema.fields.map((field) => {
      const val = formValues[field.name];
      const parsedVal = field.kind === 'number' ? Number(val) : val;
      return [field.name, parsedVal] as const;
    });
    void submitWizardStep(new Map<string, unknown>(entries));
  };

  const isFormInvalid = () =>
    stepSchema.fields.some((field) => {
      if (!field.required) return false;
      const val = formValues[field.name];
      if (field.kind === 'boolean') return false;
      if (val === undefined || val === null) return true;
      if (typeof val === 'string' && val.trim() === '') return true;
      return field.kind === 'number' && Number.isNaN(Number(val));
    });

  return (
    <dialog
      ref={dialogRef}
      onClose={cancelWizard}
      onCancel={cancelWizard}
      className="dark bg-[#0e141b] text-on-surface rounded-xl p-0 backdrop:bg-black/70 border border-[#2a3c54]/30 w-[min(36rem,90vw)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full font-body">
        <DialogHeader
          title={stepSchema.title}
          description={stepSchema.description}
          onCancel={cancelWizard}
        />

        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-error-container/20 border border-error/30 text-error text-xs rounded-lg flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] mt-0.5">warning</span>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {stepSchema.fields.map((field) => (
              <div key={field.name} className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
                  <span>{field.label}</span>
                  {field.required && <span className="text-error font-body">*</span>}
                </label>

                <FormFieldInput
                  field={field}
                  value={formValues[field.name]}
                  onChange={(val) => {
                    setFormValues((prev) => ({ ...prev, [field.name]: val }));
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter
          submitLabel={stepSchema.submitLabel}
          onCancel={cancelWizard}
          isInvalid={isFormInvalid()}
        />
      </form>
    </dialog>
  );
};
