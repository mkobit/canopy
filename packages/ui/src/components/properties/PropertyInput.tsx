import React from 'react';
import type { PropertyValue, PropertyValueKind, ScalarValue } from '@canopy/types';
import { asNodeId, parseInstant, createInstant, fromThrowable } from '@canopy/types';
import { cn } from '../../utils/cn';
import { Temporal } from 'temporal-polyfill';

interface PropertyInputData {
  readonly value: PropertyValue;
  readonly className?: string | undefined;
  readonly kind?: PropertyValueKind | undefined; // Required for unambiguous editing of string-based types
}

interface PropertyInputEvents {
  readonly onChange: (value: PropertyValue) => unknown;
}

type PropertyInputProps = PropertyInputData & PropertyInputEvents;

const getDefaultItem = (kind?: PropertyValueKind): ScalarValue => {
  switch (kind) {
    case 'text': {
      return '';
    }
    case 'number': {
      return 0;
    }
    case 'boolean': {
      return false;
    }
    case 'instant': {
      return createInstant();
    }
    case 'reference': {
      return asNodeId('');
    }
    case undefined: {
      return '';
    }
    case 'list': {
      return '';
    }
    default: {
      return '';
    }
  }
};

const formatInstantForInput = (val: ScalarValue): string => {
  if (typeof val !== 'number') return '';
  const res = fromThrowable(() =>
    Temporal.Instant.fromEpochMilliseconds(val).toString().slice(0, 16),
  );
  return res.ok ? res.value : '';
};

export const PropertyInput: React.FC<PropertyInputProps> = ({
  value,
  onChange,
  className,
  kind,
}) => {
  if (Array.isArray(value)) {
    return (
      <div className={cn('space-y-2', className)}>
        {value.map((item, index) => (
          <div key={index} className="flex gap-2">
            <ScalarInput
              value={item}
              {...(kind && kind !== 'list' ? { kind } : {})}
              onChange={(newItem) => {
                const newItems = [...value];
                // eslint-disable-next-line functional/immutable-data
                newItems[index] = newItem;
                onChange(newItems);
                return undefined;
              }}
            />
            <button
              onClick={() => {
                const newItems = value.filter((_, i) => i !== index);
                onChange(newItems);
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
            // Infer item kind from existing items or default to text
            const itemKind =
              kind && kind !== 'list' ? kind : value.length > 0 ? inferKind(value[0]) : 'text';
            const newItem = getDefaultItem(itemKind);
            onChange([...value, newItem]);
            return undefined;
          }}
          className="text-blue-500 hover:bg-blue-50 px-2 py-1 rounded text-sm border border-dashed border-blue-200 w-full"
        >
          + Add Item
        </button>
      </div>
    );
  }

  return (
    <ScalarInput
      value={value as ScalarValue}
      onChange={onChange}
      className={className}
      {...(kind ? { kind } : {})}
    />
  );
};

const ScalarInput: React.FC<
  Readonly<{
    value: ScalarValue;
    onChange: (val: ScalarValue) => unknown;
    className?: string | undefined;
    kind?: PropertyValueKind;
  }>
> = ({ value, onChange, className, kind }) => {
  const baseInputClass = cn('border rounded px-2 py-1 w-full text-sm', className);

  // Use provided kind or infer
  const activeKind = kind || inferKind(value);

  switch (activeKind) {
    case 'text': {
      return (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => {
            onChange(e.target.value);
            return undefined;
          }}
          className={baseInputClass}
        />
      );
    }
    case 'number': {
      return (
        <input
          type="number"
          value={Number(value ?? 0)}
          onChange={(e) => {
            onChange(Number(e.target.value));
            return undefined;
          }}
          className={baseInputClass}
        />
      );
    }
    case 'boolean': {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => {
            onChange(e.target.checked);
            return undefined;
          }}
          className={cn('h-4 w-4', className)}
        />
      );
    }
    case 'instant': {
      const displayValue = formatInstantForInput(value);

      return (
        <input
          type="datetime-local"
          value={displayValue}
          onChange={(e) => {
            const res = fromThrowable(() => {
              // datetime-local returns YYYY-MM-DDThh:mm. Append Z for UTC.
              return Temporal.Instant.from(e.target.value + ':00Z').epochMilliseconds;
            });
            if (res.ok) {
              const instantRes = parseInstant(res.value);
              if (instantRes.ok) {
                onChange(instantRes.value);
              }
            }
            return undefined;
          }}
          className={baseInputClass}
        />
      );
    }
    case 'reference': {
      return (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => {
            onChange(asNodeId(e.target.value));
            return undefined;
          }}
          className={baseInputClass}
          placeholder="Node ID"
        />
      );
    }
    case 'list': {
      return null;
    }
    default: {
      return (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => {
            onChange(e.target.value);
            return undefined;
          }}
          className={baseInputClass}
        />
      );
    }
  }
};

function inferKind(value: ScalarValue): PropertyValueKind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'text';
}
