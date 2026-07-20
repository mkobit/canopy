import React, { useEffect, useRef, useState } from 'react';
import { usePlugin } from '../../context/plugin-context';

export const WizardDialog: React.FC = () => {
  const { activeWizard, submitWizardStep, cancelWizard } = usePlugin();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (activeWizard) {
      if (!dialog.open) {
        // Initialize form values with defaults from schema
        const initialValues: Record<string, any> = {};
        for (const field of activeWizard.stepSchema.fields) {
          initialValues[field.name] = field.defaultValue !== undefined ? field.defaultValue : '';
          if (field.kind === 'boolean' && field.defaultValue === undefined) {
            initialValues[field.name] = false;
          }
        }
        setFormValues(initialValues);
        dialog.showModal();
      } else {
        // If step changes but dialog is already open, update default values
        setFormValues((prev) => {
          const next = { ...prev };
          for (const field of activeWizard.stepSchema.fields) {
            if (next[field.name] === undefined) {
              next[field.name] = field.defaultValue !== undefined ? field.defaultValue : '';
              if (field.kind === 'boolean' && field.defaultValue === undefined) {
                next[field.name] = false;
              }
            }
          }
          return next;
        });
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
    // Batch submit values to plugin context
    const submissionMap = new Map<string, any>();
    for (const field of stepSchema.fields) {
      let val = formValues[field.name];
      if (field.kind === 'number') {
        val = Number(val);
      }
      submissionMap.set(field.name, val);
    }
    void submitWizardStep(submissionMap);
  };

  const isFormInvalid = () => {
    return stepSchema.fields.some((field) => {
      if (!field.required) return false;
      const val = formValues[field.name];
      if (field.kind === 'boolean') return false;
      if (val === undefined || val === null) return true;
      if (typeof val === 'string' && val.trim() === '') return true;
      if (field.kind === 'number' && isNaN(Number(val))) return true;
      return false;
    });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={cancelWizard}
      onCancel={cancelWizard}
      className="dark bg-[#0e141b] text-on-surface rounded-xl p-0 backdrop:bg-black/70 border border-[#2a3c54]/30 w-[min(36rem,90vw)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full font-body">
        {/* Dialog Header */}
        <div className="px-6 py-4 bg-[#121a25]/80 border-b border-[#2a3c54]/30 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold tracking-wide text-[#a2c9ff] uppercase font-display">
              {stepSchema.title}
            </h2>
            {stepSchema.description && (
              <p className="text-xs text-on-surface-variant mt-1 font-body">
                {stepSchema.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={cancelWizard}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-[#202f44]/40 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Dialog Content */}
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

                {field.kind === 'boolean' ? (
                  <label className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#121a25]/30 border border-[#2a3c54]/10 cursor-pointer hover:bg-[#121a25]/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={!!formValues[field.name]}
                      onChange={(e) => {
                        setFormValues((prev) => ({ ...prev, [field.name]: e.target.checked }));
                      }}
                      className="w-4 h-4 rounded border-outline-variant/30 text-primary focus:ring-primary/40 bg-background"
                    />
                    <span className="text-sm text-on-surface">{field.label}</span>
                  </label>
                ) : field.kind === 'node-reference' && field.options && field.options.length > 0 ? (
                  <select
                    value={formValues[field.name] ?? ''}
                    onChange={(e) => {
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }));
                    }}
                    className="w-full bg-[#121a25]/50 border border-[#2a3c54]/30 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all"
                  >
                    <option value="" disabled>Select a node...</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      field.kind === 'number'
                        ? 'number'
                        : field.kind === 'date'
                          ? 'date'
                          : 'text'
                    }
                    value={formValues[field.name] ?? ''}
                    onChange={(e) => {
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }));
                    }}
                    className="w-full bg-[#121a25]/50 border border-[#2a3c54]/30 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all font-body"
                    required={field.required}
                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Dialog Footer */}
        <div className="px-6 py-4 bg-[#121a25]/50 border-t border-[#2a3c54]/30 flex justify-end gap-3">
          <button
            type="button"
            onClick={cancelWizard}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:bg-[#202f44]/40 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isFormInvalid()}
            className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-primary-container text-on-primary-container disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-container/80 transition-all flex items-center gap-1.5 active:scale-[0.98]"
          >
            <span>{stepSchema.submitLabel || 'Submit'}</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </form>
    </dialog>
  );
};
