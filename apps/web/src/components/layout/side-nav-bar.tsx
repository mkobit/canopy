import React from 'react';
import { NavLink } from 'react-router-dom';
import { SYSTEM_IDS } from '@canopy/graph';
import type { GraphId } from '@canopy/graph';

export interface SideNavBarProps {
  readonly onNewNode?: () => unknown;
  readonly onLogout?: () => unknown;
  readonly graphId?: GraphId;
}

const navLinkClass = ({ isActive }: Readonly<{ isActive: boolean }>) =>
  `flex items-center gap-3 py-3 px-4 transition-all duration-200 ${
    isActive
      ? 'text-[#a2c9ff] font-bold bg-[#121a25] border-l-2 border-[#a2c9ff]'
      : 'text-[#d9e6fd]/40 hover:bg-[#121a25]/50 hover:text-[#d9e6fd] hover:translate-x-1'
  }`;

// eslint-disable-next-line max-lines-per-function
export const SideNavBar: React.FC<SideNavBarProps> = ({ onNewNode, onLogout, graphId }) => {
  return (
    <aside className="flex flex-col fixed left-0 top-0 h-full z-40 bg-[#0a0e14] border-r border-[#1a2637]/15 font-display text-xs uppercase tracking-wider w-64">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-primary-container flex items-center justify-center rounded-lg">
            <span className="material-symbols-outlined text-primary" data-icon="hub">
              hub
            </span>
          </div>
          <div>
            <h2 className="font-bold text-on-surface text-sm tracking-widest">CANOPY_PKM</h2>
            <p className="text-[10px] text-on-surface-variant">v1.0.0-stable</p>
          </div>
        </div>
        <button
          onClick={onNewNode}
          className="w-full bg-primary-container text-on-primary-container py-3 px-4 rounded-lg flex items-center justify-center gap-2 mb-8 hover:bg-primary-container/80 transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-sm" data-icon="add">
            add
          </span>
          <span className="font-bold">New Node</span>
        </button>
        <nav className="space-y-1">
          <NavLink to="/" className={navLinkClass}>
            <span className="material-symbols-outlined" data-icon="database">
              database
            </span>
            <span>Database</span>
          </NavLink>
          <NavLink to="/search" className={navLinkClass}>
            <span className="material-symbols-outlined" data-icon="search">
              search
            </span>
            <span>Search</span>
          </NavLink>
        </nav>

        {graphId !== undefined && (
          <div className="mt-6">
            <nav className="space-y-1">
              <NavLink to={`/graph/${graphId}/schema`} className={navLinkClass}>
                <span className="material-symbols-outlined" data-icon="schema">
                  schema
                </span>
                <span>Schema</span>
              </NavLink>
            </nav>
          </div>
        )}

        {graphId !== undefined && (
          <div className="mt-6">
            <p className="text-[10px] text-on-surface-variant px-4 mb-2 tracking-widest">Views</p>
            <nav className="space-y-1">
              <NavLink
                to={`/graph/${graphId}/view/${SYSTEM_IDS.VIEW_ALL_NODES}`}
                className={navLinkClass}
              >
                <span className="material-symbols-outlined" data-icon="table_rows">
                  table_rows
                </span>
                <span>All Nodes</span>
              </NavLink>
              <NavLink
                to={`/graph/${graphId}/view/${SYSTEM_IDS.VIEW_BY_TYPE}`}
                className={navLinkClass}
              >
                <span className="material-symbols-outlined" data-icon="category">
                  category
                </span>
                <span>By Type</span>
              </NavLink>
              <NavLink
                to={`/graph/${graphId}/view/${SYSTEM_IDS.VIEW_RECENT}`}
                className={navLinkClass}
              >
                <span className="material-symbols-outlined" data-icon="history">
                  history
                </span>
                <span>Recent</span>
              </NavLink>
            </nav>
          </div>
        )}
      </div>
      <div className="mt-auto p-6 border-t border-outline-variant/10">
        <nav className="space-y-1">
          <a
            className="flex items-center gap-3 text-[#d9e6fd]/40 py-3 px-4 hover:bg-[#121a25]/50 hover:text-[#d9e6fd] transition-all duration-200"
            href="#"
          >
            <span className="material-symbols-outlined" data-icon="menu_book">
              menu_book
            </span>
            <span>Docs</span>
          </a>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 text-[#d9e6fd]/40 py-3 px-4 hover:bg-[#121a25]/50 hover:text-[#d9e6fd] transition-all duration-200"
          >
            <span className="material-symbols-outlined" data-icon="logout">
              logout
            </span>
            <span>Logout</span>
          </button>
        </nav>
      </div>
    </aside>
  );
};
