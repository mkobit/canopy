import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  PROPERTY_VALUE_KINDS,
  PropertyValueKindSchema,
  type TypePropertyInput,
} from '@canopy/graph';
import type { PropertyTypeOption } from '../../utils/schema';

export interface PropertyListEditorProps {
  readonly value: readonly TypePropertyInput[];
  readonly onChange: (next: readonly TypePropertyInput[]) => unknown;
  readonly propertyTypeOptions: readonly PropertyTypeOption[];
}

function updateAt<T>(list: readonly T[], index: number, next: T): readonly T[] {
  return list.map((item, i) => (i === index ? next : item));
}

function removeAt<T>(list: readonly T[], index: number): readonly T[] {
  return list.filter((_, i) => i !== index);
}

const InlinePropertyRow: React.FC<
  Readonly<{
    row: Extract<TypePropertyInput, { kind: 'inline' }>;
    onChange: (next: TypePropertyInput) => unknown;
    onRemove: () => unknown;
  }>
> = ({ row, onChange, onRemove }) => (
  <div className="flex items-start gap-2 p-3 border rounded-md bg-gray-50">
    <div className="flex-1 grid grid-cols-2 gap-2">
      <input
        value={row.name}
        onChange={(e) => onChange({ ...row, name: e.target.value })}
        placeholder="Property name"
        className="col-span-2 border rounded px-2 py-1 text-sm"
      />
      <select
        value={row.valueKind}
        onChange={(e) => {
          const parsed = PropertyValueKindSchema.safeParse(e.target.value);
          if (parsed.success) onChange({ ...row, valueKind: parsed.data });
          return undefined;
        }}
        className="border rounded px-2 py-1 text-sm"
      >
        {PROPERTY_VALUE_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={row.required}
          onChange={(e) => onChange({ ...row, required: e.target.checked })}
        />
        Required
      </label>
      <input
        value={row.description ?? ''}
        onChange={(e) => {
          const description = e.target.value;
          onChange({
            kind: 'inline',
            name: row.name,
            valueKind: row.valueKind,
            required: row.required,
            ...(description ? { description } : {}),
          });
          return undefined;
        }}
        placeholder="Description (optional)"
        className="col-span-2 border rounded px-2 py-1 text-sm"
      />
    </div>
    <button
      type="button"
      onClick={onRemove}
      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
    >
      <Trash2 size={16} />
    </button>
  </div>
);

const ReferencePropertyRow: React.FC<
  Readonly<{
    row: Extract<TypePropertyInput, { kind: 'reference' }>;
    propertyTypeOptions: readonly PropertyTypeOption[];
    onChange: (next: TypePropertyInput) => unknown;
    onRemove: () => unknown;
  }>
> = ({ row, propertyTypeOptions, onChange, onRemove }) => (
  <div className="flex items-start gap-2 p-3 border rounded-md bg-gray-50">
    <div className="flex-1 space-y-2">
      <select
        value={row.propertyTypeId}
        onChange={(e) => {
          const selected = propertyTypeOptions.find((opt) => opt.id === e.target.value);
          if (selected) onChange({ ...row, propertyTypeId: selected.id });
          return undefined;
        }}
        className="w-full border rounded px-2 py-1 text-sm"
      >
        {propertyTypeOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.namespace}/{opt.name} ({opt.valueKind})
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={row.required}
          onChange={(e) => onChange({ ...row, required: e.target.checked })}
        />
        Required
      </label>
    </div>
    <button
      type="button"
      onClick={onRemove}
      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
    >
      <Trash2 size={16} />
    </button>
  </div>
);

export const PropertyListEditor: React.FC<PropertyListEditorProps> = ({
  value,
  onChange,
  propertyTypeOptions,
}) => {
  const addInline = () => {
    onChange([...value, { kind: 'inline', name: '', valueKind: 'text', required: false }]);
    return undefined;
  };

  const addReference = () => {
    const first = propertyTypeOptions[0];
    if (!first) return undefined;
    onChange([...value, { kind: 'reference', propertyTypeId: first.id, required: false }]);
    return undefined;
  };

  return (
    <div className="space-y-2">
      {value.map((row, index) =>
        row.kind === 'inline' ? (
          <InlinePropertyRow
            key={index}
            row={row}
            onChange={(next) => onChange(updateAt(value, index, next))}
            onRemove={() => onChange(removeAt(value, index))}
          />
        ) : (
          <ReferencePropertyRow
            key={index}
            row={row}
            propertyTypeOptions={propertyTypeOptions}
            onChange={(next) => onChange(updateAt(value, index, next))}
            onRemove={() => onChange(removeAt(value, index))}
          />
        ),
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={addInline}
          className="flex items-center gap-1 text-sm text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-dashed border-blue-200"
        >
          <Plus size={14} /> Inline property
        </button>
        <button
          type="button"
          onClick={addReference}
          disabled={propertyTypeOptions.length === 0}
          className="flex items-center gap-1 text-sm text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-dashed border-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={14} /> Reference PropertyType
        </button>
      </div>
    </div>
  );
};
