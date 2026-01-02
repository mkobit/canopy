import React, { useState } from 'react';
import { useGraph } from '../context/GraphContext';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { Node } from '@canopy/types';

export const SearchPage = () => {
    const { graph } = useGraph();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');

    // Simple client-side search for now as QueryBuilder is complex to setup fully in this snippet
    // and we need "Search: find nodes by text content or property values."
    // In a real app we'd use QueryBuilder.

    const results = React.useMemo(() => {
        if (!graph || !query) return [];
        const lowerQ = query.toLowerCase();
        const matches: Node[] = [];

        for (const node of graph.nodes.values()) {
            // Search in properties
            let found = false;
            for (const val of node.properties.values()) {
                if (val.kind === 'text' && val.value.toLowerCase().includes(lowerQ)) {
                    found = true;
                    break;
                }
            }
            if (found) matches.push(node);
        }
        return matches;
    }, [graph, query]);

    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Search</h1>

            <div className="relative mb-8">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type="text"
                    placeholder="Search for nodes..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoFocus
                />
            </div>

            <div className="space-y-4">
                {query && results.length === 0 && (
                    <p className="text-center text-gray-500">No results found.</p>
                )}

                {results.map(node => (
                    <div
                        key={node.id}
                        onClick={() => navigate(`/graph/${graph!.id}/node/${node.id}`)}
                        className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all bg-white"
                    >
                        <div className="flex items-center gap-2 mb-1">
                             <span className="px-2 py-0.5 bg-gray-100 text-xs font-mono rounded text-gray-600">{node.type}</span>
                        </div>
                        <h3 className="font-semibold text-lg text-gray-900">
                            {/* Try to find a name property, else ID */}
                            {(() => {
                                const nameProp = node.properties.get('name');
                                return nameProp && nameProp.kind === 'text' ? nameProp.value : 'Untitled Node';
                            })()}
                        </h3>
                        <p className="text-xs text-gray-400 font-mono mt-2">{node.id}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};
