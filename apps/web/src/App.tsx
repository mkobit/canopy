import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { GraphPage } from './pages/GraphPage';
import { NodePage } from './pages/NodePage';
import { SearchPage } from './pages/SearchPage';
import { StorageProvider } from './context/StorageContext';
import { GraphProvider } from './context/GraphContext';

const App = () => {
  return (
    <StorageProvider>
      <GraphProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="graph/:graphId" element={<GraphPage />}>
                <Route path="node/:nodeId" element={<NodePage />} />
                {/* Default graph view: could be a dashboard or redirect to search/last node */}
                <Route index element={<SearchPage />} />
              </Route>
              <Route path="search" element={<SearchPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </GraphProvider>
    </StorageProvider>
  );
};

export default App;
