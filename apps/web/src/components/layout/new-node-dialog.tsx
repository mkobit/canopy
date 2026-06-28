import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  asGraphId,
  asInstant,
  asNodeId,
  asPlainDate,
  type PropertyDefinition,
  type PropertyValue,
  type PropertyValueKind,
  type ScalarValue,
  type TypeId,
} from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';
import { PropertyInput } from '../properties/property-input';
import type { NodeTypeOption } from '../../utils/node-types';

export interface NewNodeDialogProps {
  readonly open: boolean;
  readonly nodeTypes: readonly NodeTypeOption[];
  readonly onSubmit: (type: TypeId, properties: Record<string, PropertyValue>) => unknown;
  readonly onCancel: () => unknown;
}

function getInitialValue(kind: PropertyValueKind): PropertyValue {
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
      return asInstant(Temporal.Now.instant().toString());
    }
    case 'plain-date': {
      return asPlainDate(Temporal.Now.plainDateISO().toString());
    }
    case 'reference': {
      return asNodeId('');
    }
    case 'external-reference': {
      return { graph: asGraphId(''), target: asNodeId('') };
    }
    case 'list': {
      return [] as readonly ScalarValue[];
    }
  }
}

function initialValuesFor(
  definitions: readonly PropertyDefinition[],
): Record<string, PropertyValue> {
  return Object.fromEntries(definitions.map((def) => [def.name, getInitialValue(def.valueKind)]));
}

function isEmpty(value: PropertyValue, kind: PropertyValueKind): boolean {
  if (kind === 'boolean' || kind === 'number') return false;
  if (Array.isArray(value)) return value.length === 0;
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  return false;
}

const TypeSelect: React.FC<
  Readonly<{
    nodeTypes: readonly NodeTypeOption[];
    selectedTypeId: TypeId | null;
    onChange: (next: NodeTypeOption) => unknown;
  }>
> = ({ nodeTypes, selectedTypeId, onChange }) => (
  <label className="block space-y-1">
    <span className="text-xs uppercase tracking-wider text-on-surface-variant">Type</span>
    <select
      value={selectedTypeId ?? ''}
      onChange={(e) => {
        const next = nodeTypes.find((t) => t.id === e.target.value);
        if (next) onChange(next);
        return undefined;
      }}
      className="w-full bg-background border border-outline-variant/30 rounded px-2 py-1 text-sm"
    >
      {nodeTypes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  </label>
);

const PropertyField: React.FC<
  Readonly<{
    definition: PropertyDefinition;
    value: PropertyValue;
    onChange: (value: PropertyValue) => unknown;
  }>
> = ({ definition, value, onChange }) => (
  <label className="block space-y-1">
    <span className="text-xs uppercase tracking-wider text-on-surface-variant">
      {definition.name}
      {definition.required ? ' *' : ''}
    </span>
    <PropertyInput value={value} kind={definition.valueKind} onChange={onChange} />
    {definition.description && (
      <span className="text-[10px] text-on-surface-variant block">{definition.description}</span>
    )}
  </label>
);

function useNewNodeDialogState(open: boolean, nodeTypes: readonly NodeTypeOption[]) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<TypeId | null>(null);
  const [values, setValues] = useState<Record<string, PropertyValue>>({});

  const selectedType = useMemo(
    () => nodeTypes.find((t) => t.id === selectedTypeId),
    [nodeTypes, selectedTypeId],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const firstType = nodeTypes[0];
      setSelectedTypeId(firstType ? firstType.id : null);
      setValues(firstType ? initialValuesFor(firstType.properties) : {});
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, nodeTypes]);

  return { dialogRef, selectedTypeId, setSelectedTypeId, values, setValues, selectedType };
}

function hasRequiredMissing(
  selected: NodeTypeOption | undefined,
  values: Record<string, PropertyValue>,
): boolean {
  if (!selected) return true;
  return selected.properties.some(
    (def) =>
      def.required && isEmpty(values[def.name] ?? getInitialValue(def.valueKind), def.valueKind),
  );
}

export const NewNodeDialog: React.FC<NewNodeDialogProps> = ({
  open,
  nodeTypes,
  onSubmit,
  onCancel,
}) => {
  const { dialogRef, selectedTypeId, setSelectedTypeId, values, setValues, selectedType } =
    useNewNodeDialogState(open, nodeTypes);

  const handleTypeChange = (next: NodeTypeOption) => {
    setSelectedTypeId(next.id);
    setValues(initialValuesFor(next.properties));
    return undefined;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return undefined;
    onSubmit(selectedType.id, values);
    return undefined;
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onCancel={onCancel}
      className="dark bg-surface text-on-surface rounded-lg p-0 backdrop:bg-black/60 w-[min(32rem,90vw)]"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <h2 className="text-lg font-bold">New Node</h2>

        {nodeTypes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No node types available. Open a graph first.
          </p>
        ) : (
          <>
            <TypeSelect
              nodeTypes={nodeTypes}
              selectedTypeId={selectedTypeId}
              onChange={handleTypeChange}
            />
            {selectedType?.description && (
              <p className="text-xs text-on-surface-variant">{selectedType.description}</p>
            )}
            <div className="space-y-3">
              {selectedType?.properties.map((def) => (
                <PropertyField
                  key={def.name}
                  definition={def}
                  value={values[def.name] ?? getInitialValue(def.valueKind)}
                  onChange={(v) => {
                    setValues((prev) => ({ ...prev, [def.name]: v }));
                    return undefined;
                  }}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded text-sm text-on-surface-variant hover:bg-surface-variant/20"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={hasRequiredMissing(selectedType, values)}
            className="px-4 py-2 rounded text-sm bg-primary-container text-on-primary-container disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-container/80"
          >
            Create
          </button>
        </div>
      </form>
    </dialog>
  );
};
