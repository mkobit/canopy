import React, { useState } from 'react';
import {
  PROPERTY_VALUE_KINDS,
  PropertyValueKindSchema,
  type CreatePropertyTypeInput,
  type NodeId,
  type PropertyValueKind,
  type Result,
} from '@canopy/graph';

export interface PropertyTypeCreateFormProperties {
  readonly namespace: string;
  readonly onSubmit: (input: CreatePropertyTypeInput) => Promise<Result<NodeId, Error>>;
}

export const PropertyTypeCreateForm: React.FC<PropertyTypeCreateFormProperties> = ({
  namespace,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [valueKind, setValueKind] = useState<PropertyValueKind>('text');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async (event_: React.FormEvent) => {
    event_.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await onSubmit({
      name,
      namespace,
      valueKind,
      ...(description && { description }),
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return undefined;
    }

    setName('');
    setDescription('');
    return undefined;
  };

  return (
    <form
      onSubmit={(event_) => {
        handleSubmit(event_).catch(console.error);
      }}
      className="space-y-3 p-4 border rounded-lg bg-white"
    >
      <h3 className="font-semibold text-gray-900">New PropertyType</h3>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500">Name</span>
        <input
          required
          value={name}
          onChange={(event_) => setName(event_.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500">Value kind</span>
        <select
          value={valueKind}
          onChange={(event_) => {
            const parsed = PropertyValueKindSchema.safeParse(event_.target.value);
            if (parsed.success) setValueKind(parsed.data);
            return undefined;
          }}
          className="w-full border rounded px-2 py-1 text-sm"
        >
          {PROPERTY_VALUE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Description (optional)
        </span>
        <input
          value={description}
          onChange={(event_) => setDescription(event_.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting || !name}
        className="px-4 py-2 rounded text-sm bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
      >
        Create PropertyType
      </button>
    </form>
  );
};
