import React from 'react';
import { PropertyValue, PropertyValueKind, ScalarValue } from '@canopy/types';
import { cn } from '../../utils/cn.js';

interface PropertyInputProps {
  value: PropertyValue;
  onChange: (value: PropertyValue) => void;
  className?: string | undefined;
  kind?: PropertyValueKind | undefined; // In case we're creating a new property and value is undefined (though props say value is required here, handling creation might be separate)
}

// Helper to update a scalar value while preserving its kind
const updateScalar = (original: ScalarValue, newValue: any): ScalarValue => {
  switch (original.kind) {
    case 'text': return { ...original, value: String(newValue) };
    case 'number': return { ...original, value: Number(newValue) };
    case 'boolean': return { ...original, value: Boolean(newValue) };
    case 'instant': return { ...original, value: String(newValue) as any }; // In a real app, validate Instant format
    case 'plain-date': return { ...original, value: String(newValue) as any }; // Validate PlainDate
    case 'reference': return { ...original, target: String(newValue) as any };
    case 'external-reference': return original; // Complex edit needed for external ref
    default: return original;
  }
};

export const PropertyInput: React.FC<PropertyInputProps> = ({ value, onChange, className }) => {
  if (value.kind === 'list') {
    return (
      <div className={cn("space-y-2", className)}>
        {value.items.map((item, index) => (
          <div key={index} className="flex gap-2">
             <ScalarInput
               value={item}
               onChange={(newItem) => {
                 const newItems = [...value.items];
                 newItems[index] = newItem;
                 onChange({ ...value, items: newItems });
               }}
             />
             <button
               onClick={() => {
                 const newItems = value.items.filter((_, i) => i !== index);
                 onChange({ ...value, items: newItems });
               }}
               className="text-red-500 hover:bg-red-50 px-2 rounded"
             >
               Remove
             </button>
          </div>
        ))}
        <button
          onClick={() => {
            // Add a default value based on existing items or a generic default
            // If list is empty, we can't infer kind easily without schema, but we can try to guess or use text.
            // However, the `value` prop has `kind: 'list'` but `items` might be empty.
            // If items is empty, we need the `kind` prop to know what to add, or default to text.
            // For now, let's default to text if empty, or copy the kind of the first item.
            let newItem: ScalarValue = { kind: 'text', value: '' };
            if (value.items.length > 0) {
                 const first = value.items[0];
                 if (first) {
                     // Create a safe default based on kind
                     switch(first.kind) {
                         case 'text': newItem = { kind: 'text', value: '' }; break;
                         case 'number': newItem = { kind: 'number', value: 0 }; break;
                         case 'boolean': newItem = { kind: 'boolean', value: false }; break;
                         // ... others
                     }
                 }
            }
            onChange({ ...value, items: [...value.items, newItem] });
          }}
          className="text-blue-500 hover:bg-blue-50 px-2 py-1 rounded text-sm border border-dashed border-blue-200 w-full"
        >
          + Add Item
        </button>
      </div>
    );
  }

  return <ScalarInput value={value} onChange={onChange} className={className} />;
};

const ScalarInput: React.FC<{ value: ScalarValue, onChange: (val: ScalarValue) => void, className?: string | undefined }> = ({ value, onChange, className }) => {
  const baseInputClass = cn("border rounded px-2 py-1 w-full text-sm", className);

  switch (value.kind) {
    case 'text':
      return (
        <input
          type="text"
          value={value.value}
          onChange={(e) => onChange(updateScalar(value, e.target.value))}
          className={baseInputClass}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={value.value}
          onChange={(e) => onChange(updateScalar(value, e.target.valueAsNumber))}
          className={baseInputClass}
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={value.value}
          onChange={(e) => onChange(updateScalar(value, e.target.checked))}
          className={cn("h-4 w-4", className)}
        />
      );
    case 'instant':
      // Basic text input for now, ideally a datetime picker
      return (
        <input
          type="text"
          value={value.value}
          onChange={(e) => onChange(updateScalar(value, e.target.value))}
          className={baseInputClass}
          placeholder="ISO 8601 Timestamp"
        />
      );
    case 'plain-date':
        return (
          <input
            type="date"
            value={value.value}
            onChange={(e) => onChange(updateScalar(value, e.target.value))}
            className={baseInputClass}
          />
        );
    case 'reference':
        return (
          <input
            type="text"
            value={value.target}
            onChange={(e) => onChange(updateScalar(value, e.target.value))}
            className={baseInputClass}
            placeholder="Node ID"
          />
        );
    default:
      return <div className="text-gray-400 text-xs">Editing not supported for {value.kind}</div>;
  }
};
