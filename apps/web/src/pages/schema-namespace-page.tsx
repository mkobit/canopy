import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { RESTRICTED_NAMESPACE_KINDS } from '@canopy/graph';
import { useGraph } from '../context/graph-context';
import {
  listAllNodeTypes,
  listAllPropertyTypes,
  listEdgeTypesIn,
  listNamespaces,
  listNodeTypesIn,
  listPropertyTypesIn,
  type EdgeTypeOption,
  type PropertyTypeOption,
  type TypeDefOption,
} from '../utils/schema';
import { NodeTypeCreateForm, EdgeTypeCreateForm, PropertyTypeCreateForm } from '../components';

const TypeDefList: React.FC<Readonly<{ items: readonly TypeDefOption[] }>> = ({ items }) => {
  if (items.length === 0) return <p className="text-sm text-gray-400">None yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="p-3 border rounded-md bg-white">
          <div className="flex justify-between items-baseline">
            <span className="font-medium text-gray-900">{item.name}</span>
            <span className="text-xs text-gray-400">
              {item.properties.length} propert{item.properties.length === 1 ? 'y' : 'ies'}
            </span>
          </div>
          {item.description && <p className="text-sm text-gray-600 mt-1">{item.description}</p>}
        </li>
      ))}
    </ul>
  );
};

const EdgeTypeList: React.FC<Readonly<{ items: readonly EdgeTypeOption[] }>> = ({ items }) => {
  if (items.length === 0) return <p className="text-sm text-gray-400">None yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="p-3 border rounded-md bg-white">
          <div className="flex justify-between items-baseline">
            <span className="font-medium text-gray-900">{item.name}</span>
            <span className="text-xs text-gray-400">
              {item.properties.length} propert{item.properties.length === 1 ? 'y' : 'ies'}
            </span>
          </div>
          {item.description && <p className="text-sm text-gray-600 mt-1">{item.description}</p>}
          {(item.sourceTypes.length > 0 || item.targetTypes.length > 0) && (
            <p className="text-xs text-gray-400 mt-1 font-mono">
              {item.sourceTypes.length > 0 ? item.sourceTypes.join(', ') : 'any'} {'->'}{' '}
              {item.targetTypes.length > 0 ? item.targetTypes.join(', ') : 'any'}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
};

const PropertyTypeList: React.FC<Readonly<{ items: readonly PropertyTypeOption[] }>> = ({
  items,
}) => {
  if (items.length === 0) return <p className="text-sm text-gray-400">None yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="p-3 border rounded-md bg-white flex justify-between items-baseline"
        >
          <span className="font-medium text-gray-900">{item.name}</span>
          <span className="text-xs text-gray-400 font-mono">{item.valueKind}</span>
        </li>
      ))}
    </ul>
  );
};

export const SchemaNamespacePage = () => {
  const { graphId, namespaceName } =
    useParams<Readonly<{ graphId: string; namespaceName: string }>>();
  const { graph, createNodeType, createEdgeType, createPropertyType } = useGraph();
  const navigate = useNavigate();

  const namespace = namespaceName ?? '';

  const namespaceInfo = useMemo(
    () => (graph ? listNamespaces(graph).find((ns) => ns.name === namespace) : undefined),
    [graph, namespace],
  );
  const isRestricted = namespaceInfo ? RESTRICTED_NAMESPACE_KINDS.has(namespaceInfo.kind) : false;

  const nodeTypes = useMemo(
    () => (graph ? listNodeTypesIn(graph, namespace) : []),
    [graph, namespace],
  );
  const edgeTypes = useMemo(
    () => (graph ? listEdgeTypesIn(graph, namespace) : []),
    [graph, namespace],
  );
  const propertyTypes = useMemo(
    () => (graph ? listPropertyTypesIn(graph, namespace) : []),
    [graph, namespace],
  );
  const allPropertyTypes = useMemo(() => (graph ? listAllPropertyTypes(graph) : []), [graph]);
  const allNodeTypes = useMemo(() => (graph ? listAllNodeTypes(graph) : []), [graph]);

  if (!graph) {
    return <div className="p-8 text-center text-gray-500">No graph loaded.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-10">
      <div>
        <button
          onClick={() => navigate(`/graph/${graphId}/schema`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeft size={16} /> Namespaces
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{namespace}</h1>
        {namespaceInfo && (
          <p className="text-xs text-gray-500 font-mono mt-1">
            kind: {namespaceInfo.kind}
            {isRestricted ? ' · restricted' : ''}
          </p>
        )}
        {isRestricted && (
          <p className="text-sm text-amber-600 mt-2">
            This namespace is restricted — new definitions can&apos;t be created here.
          </p>
        )}
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Node types</h2>
        <TypeDefList items={nodeTypes} />
        <NodeTypeCreateForm
          namespace={namespace}
          propertyTypeOptions={allPropertyTypes}
          onSubmit={createNodeType}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Edge types</h2>
        <EdgeTypeList items={edgeTypes} />
        <EdgeTypeCreateForm
          namespace={namespace}
          propertyTypeOptions={allPropertyTypes}
          nodeTypeOptions={allNodeTypes}
          onSubmit={createEdgeType}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Property types</h2>
        <PropertyTypeList items={propertyTypes} />
        <PropertyTypeCreateForm namespace={namespace} onSubmit={createPropertyType} />
      </section>
    </div>
  );
};
