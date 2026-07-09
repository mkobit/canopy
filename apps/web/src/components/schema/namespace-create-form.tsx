import React, { useState } from 'react';
import type { CreateNamespaceInput, NodeId, Result } from '@canopy/graph';

export interface NamespaceCreateFormProps {
  readonly existingKinds: readonly string[];
  readonly onSubmit: (input: CreateNamespaceInput) => Promise<Result<NodeId, Error>>;
}

const CUSTOM_KIND = '__custom__';

export const NamespaceCreateForm: React.FC<NamespaceCreateFormProps> = ({
  existingKinds,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState(existingKinds[0] ?? CUSTOM_KIND);
  const [customKind, setCustomKind] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const resolvedKind = kind === CUSTOM_KIND ? customKind : kind;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await onSubmit({
      name,
      kind: resolvedKind,
      ...(description && { description }),
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return undefined;
    }

    setName('');
    setCustomKind('');
    setDescription('');
    return undefined;
  };

  return (
    <form
      onSubmit={(e) => {
        handleSubmit(e).catch(console.error);
      }}
      className="space-y-3 p-4 border rounded-lg bg-white"
    >
      <h3 className="font-semibold text-gray-900">New namespace</h3>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500">Name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-namespace"
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500">Kind</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        >
          {existingKinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
          <option value={CUSTOM_KIND}>Custom…</option>
        </select>
      </label>
      {kind === CUSTOM_KIND && (
        <input
          required
          value={customKind}
          onChange={(e) => setCustomKind(e.target.value)}
          placeholder="kind value"
          className="w-full border rounded px-2 py-1 text-sm"
        />
      )}
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Description (optional)
        </span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting || !name || !resolvedKind}
        className="px-4 py-2 rounded text-sm bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
      >
        Create namespace
      </button>
    </form>
  );
};
