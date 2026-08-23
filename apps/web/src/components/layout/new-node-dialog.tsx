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
import { PropertyInput } from '../properties/property-input';
import type { NodeTypeOption } from '../../utils/node-types';

export interface NewNodeDialogProperties {
  readonly open: boolean;
  readonly nodeTypes: readonly NodeTypeOption[];
  readonly onSubmit: (type: TypeId, properties: Readonly<Record<string, PropertyValue>>) => unknown;
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
): Readonly<Record<string, PropertyValue>> {
  return Object.fromEntries(
    definitions.map((definition) => [definition.name, getInitialValue(definition.valueKind)]),
  );
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
      onChange={(event_) => {
        const next = nodeTypes.find((t) => t.id === event_.target.value);
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
  const dialogReference = useRef<HTMLDialogElement>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<TypeId | null>(null);
  const [values, setValues] = useState<Record<string, PropertyValue>>({});

  const selectedType = useMemo(
    () => nodeTypes.find((t) => t.id === selectedTypeId),
    [nodeTypes, selectedTypeId],
  );

  useEffect(() => {
    const dialog = dialogReference.current;
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

  return {
    dialogRef: dialogReference,
    selectedTypeId,
    setSelectedTypeId,
    values,
    setValues,
    selectedType,
  };
}

function hasRequiredMissing(
  selected: NodeTypeOption | undefined,
  values: Readonly<Record<string, PropertyValue>>,
): boolean {
  if (!selected) return true;
  return selected.properties.some(
    (definition) =>
      definition.required &&
      isEmpty(
        values[definition.name] ?? getInitialValue(definition.valueKind),
        definition.valueKind,
      ),
  );
}

export const NewNodeDialog: React.FC<NewNodeDialogProperties> = ({
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

  const handleSubmit = (event_: React.FormEvent) => {
    event_.preventDefault();
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
              {selectedType?.properties.map((definition) => (
                <PropertyField
                  key={definition.name}
                  definition={definition}
                  value={values[definition.name] ?? getInitialValue(definition.valueKind)}
                  onChange={(v) => {
                    setValues((previous) => ({ ...previous, [definition.name]: v }));
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
