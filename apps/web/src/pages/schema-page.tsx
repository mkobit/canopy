import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RESTRICTED_NAMESPACE_KINDS } from '@canopy/graph';
import { useGraph } from '../context/graph-context';
import { listNamespaces, listCreatableNamespaceKinds } from '../utils/schema';
import { NamespaceCreateForm } from '../components';

export const SchemaPage = () => {
  const { graphId } = useParams<Readonly<{ graphId: string }>>();
  const { graph, createNamespace } = useGraph();

  const namespaces = useMemo(() => (graph ? listNamespaces(graph) : []), [graph]);
  const creatableKinds = useMemo(() => listCreatableNamespaceKinds(namespaces), [namespaces]);

  if (!graph) {
    return <div className="p-8 text-center text-gray-500">No graph loaded.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Schema</h1>
        <p className="text-sm text-gray-500">
          Namespaces group NodeType, EdgeType, and PropertyType definitions.
        </p>
      </div>

      <div className="space-y-2">
        {namespaces.map((ns) => (
          <Link
            key={ns.id}
            to={`/graph/${graphId}/schema/${ns.name}`}
            className="block p-4 border rounded-lg hover:border-blue-400 hover:shadow-sm transition-all bg-white"
          >
            <div className="flex justify-between items-baseline">
              <h3 className="text-lg font-semibold text-gray-900">{ns.name}</h3>
              <span className="text-xs text-gray-500 font-mono">
                kind: {ns.kind}
                {RESTRICTED_NAMESPACE_KINDS.has(ns.kind) ? ' · restricted' : ''}
              </span>
            </div>
            {ns.description && <p className="mt-1 text-sm text-gray-600">{ns.description}</p>}
          </Link>
        ))}
      </div>

      <NamespaceCreateForm existingKinds={creatableKinds} onSubmit={createNamespace} />
    </div>
  );
};
