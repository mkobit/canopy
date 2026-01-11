import React from 'react';
import type { PropertyValue, PropertyValueKind, ScalarValue } from '@canopy/types';
import { cn } from '../../utils/cn';

interface PropertyDisplayProps {
  readonly value: PropertyValue;
  readonly className?: string;
  readonly kind?: PropertyValueKind; // Optional override or context
}

export const PropertyDisplay: React.FC<PropertyDisplayProps> = ({ value, className }) => {
  if (value.kind === 'list') {
    return (
      <ul className={cn("list-disc pl-4", className)}>
        {value.items.map((item, index) => (
          <li key={index}>
            <ScalarDisplay value={item} />
          </li>
        ))}
      </ul>
    );
  }

  return <div className={className}><ScalarDisplay value={value} /></div>;
};

const ScalarDisplay: React.FC<Readonly<{ value: ScalarValue }>> = ({ value }) => {
  switch (value.kind) {
    case 'text':
      return <span className="text-gray-900">{value.value}</span>;
    case 'number':
      return <span className="font-mono text-blue-600">{value.value}</span>;
    case 'boolean':
      return <span className={cn("px-2 py-0.5 rounded text-xs font-bold", value.value ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>{value.value ? 'TRUE' : 'FALSE'}</span>;
    case 'instant':
      return <span className="text-sm text-gray-500" title={value.value}>{new Date(value.value).toLocaleString()}</span>;
    case 'plain-date':
      return <span className="text-sm text-gray-500">{value.value}</span>;
    case 'reference':
      return <span className="text-blue-500 hover:underline cursor-pointer">@{value.target.substring(0, 8)}...</span>;
    case 'external-reference':
      return <span className="text-indigo-500 hover:underline cursor-pointer">@{value.graph.substring(0, 8)}:{value.target.substring(0, 8)}...</span>;
    default:
      return <span className="text-gray-400 italic">Unknown value</span>;
  }
};
