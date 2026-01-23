import React from 'react';
import type { PropertyValue, PropertyValueKind, ScalarValue } from '@canopy/types';
import { cn } from '../../utils/cn';
import { Temporal } from 'temporal-polyfill';

interface PropertyDisplayProps {
  readonly value: PropertyValue;
  readonly className?: string;
  readonly kind?: PropertyValueKind; // Optional override or context
}

export const PropertyDisplay: React.FC<PropertyDisplayProps> = ({ value, className, kind }) => {
  if (Array.isArray(value)) {
    return (
      <ul className={cn('list-disc pl-4', className)}>
        {value.map((item, index) => (
          <li key={index}>
            <ScalarDisplay value={item} {...(kind && kind !== 'list' ? { kind } : {})} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={className}>
      <ScalarDisplay value={value as ScalarValue} {...(kind ? { kind } : {})} />
    </div>
  );
};

const ScalarDisplay: React.FC<Readonly<{ value: ScalarValue; kind?: PropertyValueKind }>> = ({
  value,
  kind,
}) => {
  if (value === null) {
    return <span className="text-gray-400 italic">null</span>;
  }

  // Use provided kind if available, otherwise infer
  const inferredKind = kind || inferKind(value);

  switch (inferredKind) {
    case 'text': {
      return <span className="text-gray-900">{String(value)}</span>;
    }
    case 'number': {
      return <span className="font-mono text-blue-600">{String(value)}</span>;
    }
    case 'boolean': {
      return (
        <span
          className={cn(
            'px-2 py-0.5 rounded text-xs font-bold',
            value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
          )}
        >
          {value ? 'TRUE' : 'FALSE'}
        </span>
      );
    }
    case 'instant': {
      return (
        <span className="text-sm text-gray-500" title={String(value)}>
          {tryFormatInstant(Number(value))}
        </span>
      );
    }
    case 'reference': {
      return (
        <span className="text-blue-500 hover:underline cursor-pointer">
          @{String(value).slice(0, 8)}...
        </span>
      );
    }
    case 'list': {
      return null;
    }
    default: {
      return <span className="text-gray-900">{String(value)}</span>;
    }
  }
};

function inferKind(value: ScalarValue): PropertyValueKind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  // String is ambiguous, default to text
  return 'text';
}

function tryFormatInstant(val: number): string {
  // eslint-disable-next-line functional/no-try-statements
  try {
    return Temporal.Instant.fromEpochMilliseconds(val).toLocaleString();
  } catch {
    return String(val);
  }
}
