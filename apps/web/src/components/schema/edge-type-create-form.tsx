import React, { useState } from 'react';
import type { CreateEdgeTypeInput, NodeId, Result, TypePropertyInput } from '@canopy/graph';
import { PropertyListEditor } from './property-list-editor';
import type { PropertyTypeOption, TypeDefinitionOption } from '../../utils/schema';

export interface EdgeTypeCreateFormProperties {
  readonly namespace: string;
  readonly propertyTypeOptions: readonly PropertyTypeOption[];
  readonly nodeTypeOptions: readonly TypeDefinitionOption[];
  readonly onSubmit: (input: CreateEdgeTypeInput) => Promise<Result<NodeId, Error>>;
}

const NodeTypeCheckboxList: React.FC<
  Readonly<{
    label: string;
    options: readonly TypeDefinitionOption[];
    selected: readonly NodeId[];
    onChange: (next: readonly NodeId[]) => unknown;
  }>
> = ({ label, options, selected, onChange }) => (
  <div className="space-y-1">
    <span className="text-xs uppercase tracking-wider text-gray-500">{label} (optional)</span>
    <div className="border rounded p-2 max-h-32 overflow-y-auto space-y-1">
      {options.length === 0 && <p className="text-xs text-gray-400">No NodeTypes yet.</p>}
      {options.map((opt) => (
        <label key={opt.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(opt.id)}
            onChange={(event_) => {
              onChange(
                event_.target.checked
                  ? [...selected, opt.id]
                  : selected.filter((id) => id !== opt.id),
              );
              return undefined;
            }}
          />
          <span>
            {opt.namespace}/{opt.name}
          </span>
        </label>
      ))}
    </div>
  </div>
);

export const EdgeTypeCreateForm: React.FC<EdgeTypeCreateFormProperties> = ({
  namespace,
  propertyTypeOptions,
  nodeTypeOptions,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [properties, setProperties] = useState<readonly TypePropertyInput[]>([]);
  const [sourceTypes, setSourceTypes] = useState<readonly NodeId[]>([]);
  const [targetTypes, setTargetTypes] = useState<readonly NodeId[]>([]);
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
      ...(sourceTypes.length > 0 && { sourceTypes }),
      ...(targetTypes.length > 0 && { targetTypes }),
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return undefined;
    }

    setName('');
    setDescription('');
    setProperties([]);
    setSourceTypes([]);
    setTargetTypes([]);
    return undefined;
  };

  return (
    <form
      onSubmit={(event_) => {
        handleSubmit(event_).catch(console.error);
      }}
      className="space-y-3 p-4 border rounded-lg bg-white"
    >
      <h3 className="font-semibold text-gray-900">New EdgeType</h3>
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
      <NodeTypeCheckboxList
        label="Source types"
        options={nodeTypeOptions}
        selected={sourceTypes}
        onChange={setSourceTypes}
      />
      <NodeTypeCheckboxList
        label="Target types"
        options={nodeTypeOptions}
        selected={targetTypes}
        onChange={setTargetTypes}
      />
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
        Create EdgeType
      </button>
    </form>
  );
};
