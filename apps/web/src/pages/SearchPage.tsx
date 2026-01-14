import React, { useState } from 'react';
import { useGraph } from '../context/GraphContext';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PropertyValue, Node } from '@canopy/types';
import { filter, map } from 'remeda';

export const SearchPage = () => {
  const { graph } = useGraph();
  const [query, setQuery] = useState('');

  if (!graph) return <div>Loading...</div>;

  const results = filter([...graph.nodes.values()], (node: Node) => {
    if (!query) return false;
    const q = query.toLowerCase();

    const properties = [...node.properties.values()];
    return properties.some((val: PropertyValue) => {
      if (val.kind === 'text') {
        return val.value.toLowerCase().includes(q);
      }
      return false;
    });
  });

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="relative mb-8">
        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Search nodes..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            return undefined;
          }}
        />
      </div>

      <div className="space-y-4">
        {map(results, (node: Node) => {
          const name = node.properties.get('name');
          const desc = node.properties.get('description');

          return (
            <Link
              key={node.id}
              to={`/node/${node.id}`}
              className="block p-4 border rounded-lg hover:border-blue-400 hover:shadow-sm transition-all bg-white"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {name?.kind === 'text' ? name.value : 'Untitled Node'}
                  </h3>
                  <p className="text-sm text-gray-500 font-mono mt-1">{node.type}</p>
                </div>
              </div>
              {desc?.kind === 'text' && (
                <p className="mt-2 text-gray-600 line-clamp-2">{desc.value}</p>
              )}
            </Link>
          );
        })}
        {query && results.length === 0 && (
          <div className="text-center text-gray-500 py-12">No results found for "{query}"</div>
        )}
      </div>
    </div>
  );
};
