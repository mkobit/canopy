import React from 'react';
import { PropertyValue, PropertyValueKind, ScalarValue } from '@canopy/types';
import { cn } from '../../utils/cn';

interface PropertyInputData {
  readonly value: PropertyValue;
  readonly className?: string | undefined;
  readonly kind?: PropertyValueKind | undefined; // In case we're creating a new property and value is undefined (though props say value is required here, handling creation might be separate)
}

interface PropertyInputEvents {
  readonly onChange: (value: PropertyValue) => unknown;
}

type PropertyInputProps = PropertyInputData & PropertyInputEvents;

// Helper to update a scalar value while preserving its kind
const updateScalar = (original: ScalarValue, newValue: string | number | boolean): ScalarValue => {
  switch (original.kind) {
    case 'text': return { ...original, value: String(newValue) };
    case 'number': return { ...original, value: Number(newValue) };
    case 'boolean': return { ...original, value: Boolean(newValue) };
    // For specialized types, we cast for now but should validate in real usage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case 'instant': return { ...original, value: String(newValue) as any };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case 'plain-date': return { ...original, value: String(newValue) as any };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case 'reference': return { ...original, target: String(newValue) as any };
    case 'external-reference': return original;
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
            // eslint-disable-next-line functional/immutable-data
                 newItems[index] = newItem;
                 onChange({ ...value, items: newItems });
                 return undefined;
               }}
             />
             <button
               onClick={() => {
                 const newItems = value.items.filter((_, i) => i !== index);
                 onChange({ ...value, items: newItems });
                 return undefined;
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
            const getDefaultItem = (firstItem?: ScalarValue): ScalarValue => {
              if (!firstItem) return { kind: 'text', value: '' };
              switch(firstItem.kind) {
                 case 'text': return { kind: 'text', value: '' };
                 case 'number': return { kind: 'number', value: 0 };
                 case 'boolean': return { kind: 'boolean', value: false };
                 default: return { kind: 'text', value: '' };
              }
            };

            const newItem = getDefaultItem(value.items.length > 0 ? value.items[0] : undefined);
            onChange({ ...value, items: [...value.items, newItem] });
            return undefined;
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

const ScalarInput: React.FC<Readonly<{ value: ScalarValue, onChange: (val: ScalarValue) => unknown, className?: string | undefined }>> = ({ value, onChange, className }) => {
  const baseInputClass = cn("border rounded px-2 py-1 w-full text-sm", className);

  switch (value.kind) {
    case 'text':
      return (
        <input
          type="text"
          value={value.value}
          onChange={(e) => { onChange(updateScalar(value, e.target.value)); return undefined; }}
          className={baseInputClass}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={value.value}
          onChange={(e) => { onChange(updateScalar(value, e.target.valueAsNumber)); return undefined; }}
          className={baseInputClass}
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={value.value}
          onChange={(e) => { onChange(updateScalar(value, e.target.checked)); return undefined; }}
          className={cn("h-4 w-4", className)}
        />
      );
    case 'instant':
      // Basic text input for now, ideally a datetime picker
      return (
        <input
          type="text"
          value={value.value}
          onChange={(e) => { onChange(updateScalar(value, e.target.value)); return undefined; }}
          className={baseInputClass}
          placeholder="ISO 8601 Timestamp"
        />
      );
    case 'plain-date':
        return (
          <input
            type="date"
            value={value.value}
            onChange={(e) => { onChange(updateScalar(value, e.target.value)); return undefined; }}
            className={baseInputClass}
          />
        );
    case 'reference':
        return (
          <input
            type="text"
            value={value.target}
            onChange={(e) => { onChange(updateScalar(value, e.target.value)); return undefined; }}
            className={baseInputClass}
            placeholder="Node ID"
          />
        );
    default:
      return <div className="text-gray-400 text-xs">Editing not supported for {value.kind}</div>;
  }
};
