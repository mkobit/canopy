import React, { useState } from 'react';
import type { CreateNodeTypeInput, NodeId, Result, TypePropertyInput } from '@canopy/graph';
import { PropertyListEditor } from './property-list-editor';
import type { PropertyTypeOption } from '../../utils/schema';

export interface NodeTypeCreateFormProperties {
  readonly namespace: string;
  readonly propertyTypeOptions: readonly PropertyTypeOption[];
  readonly onSubmit: (input: CreateNodeTypeInput) => Promise<Result<NodeId, Error>>;
}

export const NodeTypeCreateForm: React.FC<NodeTypeCreateFormProperties> = ({
  namespace,
  propertyTypeOptions,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [properties, setProperties] = useState<readonly TypePropertyInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async (event_: React.FormEvent) => {
    event_.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await onSubmit({
      name,
      namespace,
      properties,
      ...(description && { description }),
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return undefined;
    }

    setName('');
    setDescription('');
    setProperties([]);
    return undefined;
  };

  return (
    <form
      onSubmit={(event_) => {
        handleSubmit(event_).catch(console.error);
      }}
      className="space-y-3 p-4 border rounded-lg bg-white"
    >
      <h3 className="font-semibold text-gray-900">New NodeType</h3>
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
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Description (optional)
        </span>
        <input
          value={description}
          onChange={(event_) => setDescription(event_.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </label>
      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500">Properties</span>
        <PropertyListEditor
          value={properties}
          onChange={setProperties}
          propertyTypeOptions={propertyTypeOptions}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting || !name}
        className="px-4 py-2 rounded text-sm bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
      >
        Create NodeType
      </button>
    </form>
  );
};
