import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePlugin } from '../../context/plugin-context';
import { useGraph } from '../../context/graph-context';
import { executeStoredQuery } from '@canopy/queries';
import { SYSTEM_IDS, type Node, type Graph } from '@canopy/graph';

interface CommandItemProps {
  readonly command: Readonly<{ id: string; title: string; category?: string }>;
  readonly isSelected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onMouseEnter: () => void;
}

const CommandItem: React.FC<CommandItemProps> = ({
  command,
  isSelected,
  onSelect,
  onMouseEnter,
}) => (
  <button
    onClick={() => onSelect(command.id)}
    onMouseEnter={onMouseEnter}
    className={`w-full flex items-center justify-between px-4 py-2 text-left text-xs transition-colors duration-150 cursor-pointer ${
      isSelected
        ? 'bg-primary-container text-on-primary-container font-bold'
        : 'text-on-surface-variant hover:text-on-surface'
    }`}
  >
    <div className="flex items-center gap-2.5 font-body">
      <span className="material-symbols-outlined text-[16px]">terminal</span>
      <span>{command.title}</span>
    </div>
    {command.category && (
      <span
        className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono ${
          isSelected
            ? 'bg-primary/20 text-on-primary-container'
            : 'bg-[#1a2637]/40 text-on-surface-variant/60'
        }`}
      >
        {command.category}
      </span>
    )}
  </button>
);

interface NodeItemProps {
  readonly node: Node;
  readonly isSelected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onMouseEnter: () => void;
}

const NodeItem: React.FC<NodeItemProps> = ({ node, isSelected, onSelect, onMouseEnter }) => {
  const name = node.properties.get('name');
  const nameStr = typeof name === 'string' ? name : 'Untitled Node';
  return (
    <button
      onClick={() => onSelect(node.id)}
      onMouseEnter={onMouseEnter}
      className={`w-full flex items-center justify-between px-4 py-2 text-left text-xs transition-colors duration-150 cursor-pointer ${
        isSelected
          ? 'bg-primary-container text-on-primary-container font-bold'
          : 'text-on-surface-variant hover:text-on-surface'
      }`}
    >
      <div className="flex items-center gap-2.5 font-body">
        <span className="material-symbols-outlined text-[16px]">description</span>
        <span>{nameStr}</span>
        <span className="text-[10px] text-on-surface-variant/40 font-mono">({node.id})</span>
      </div>
      <span
        className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono ${
          isSelected
            ? 'bg-primary/20 text-on-primary-container'
            : 'bg-[#1a2637]/40 text-on-surface-variant/60'
        }`}
      >
        {node.type}
      </span>
    </button>
  );
};

const isCommandMode = (q: string): boolean => q.trimStart().startsWith('>');
const getCommandQuery = (q: string): string => q.trimStart().slice(1).trim();
const getNodeQuery = (q: string): string => q.trim();

const useClickOutside = (
  isOpen: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e: Readonly<MouseEvent>) => {
      const target = e.target;
      if (
        target instanceof Node &&
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, containerRef, setIsOpen]);
};

const useShortcutToggle = (
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setQuery: React.Dispatch<React.SetStateAction<string>>,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
) => {
  useEffect(() => {
    const handleKeyDown = (e: Readonly<KeyboardEvent>) => {
      const isP = e.key === 'p' || e.key === 'P';
      const isCtrlCmd = e.ctrlKey || e.metaKey;
      if (!isCtrlCmd || !isP) return;

      e.preventDefault();
      const isShift = e.shiftKey;

      setIsOpen((prev) => {
        if (prev) {
          return false;
        }
        setQuery(isShift ? '>' : '');
        setSelectedIndex(0);
        return true;
      });
    };
    addEventListener('keydown', handleKeyDown);
    return () => removeEventListener('keydown', handleKeyDown);
  }, [setIsOpen, setQuery, setSelectedIndex]);
};

const useFilteredItems = (
  query: string,
  commands: readonly Readonly<{ id: string; title: string; category?: string }>[],
  graph: Graph | null,
) => {
  const inCommandMode = isCommandMode(query);

  const filteredCommands = commands.filter((cmd) => {
    const searchQ = getCommandQuery(query).toLowerCase();
    const text = `${cmd.title} ${cmd.category ?? ''}`.toLowerCase();
    return text.includes(searchQ);
  });

  const queryResult = graph ? executeStoredQuery(graph, SYSTEM_IDS.QUERY_ALL_NODES) : null;
  const nodes = queryResult?.ok ? queryResult.value.nodes : [];
  const searchNodeQ = getNodeQuery(query).toLowerCase();
  const filteredNodes = nodes
    .filter((node) => {
      if (node.id.toLowerCase().includes(searchNodeQ)) return true;
      const name = node.properties.get('name');
      return typeof name === 'string' && name.toLowerCase().includes(searchNodeQ);
    })
    .slice(0, 10);

  return {
    inCommandMode,
    filteredCommands,
    filteredNodes,
    filteredCount: (inCommandMode ? filteredCommands : filteredNodes).length,
  };
};

const useKeyboardNav = (
  filteredCount: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  setIsOpen: (open: boolean) => void,
  onConfirm: () => void,
) => {
  return (e: Readonly<React.KeyboardEvent>) => {
    switch (e.key) {
      case 'Escape': {
        setIsOpen(false);
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredCount > 0 ? (prev + 1) % filteredCount : 0));
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredCount > 0 ? (prev - 1 + filteredCount) % filteredCount : 0,
        );
        break;
      }
      case 'Enter': {
        e.preventDefault();
        onConfirm();
        break;
      }
      default: {
        break;
      }
    }
  };
};

interface ConfirmationOptions {
  readonly inCommandMode: boolean;
  readonly filteredCommands: readonly Readonly<{ id: string; title: string; category?: string }>[];
  readonly filteredNodes: readonly Node[];
  readonly selectedIndex: number;
  readonly activeGraphId: string | undefined;
  readonly startWizard: (commandId: string) => Promise<void>;
  readonly navigate: ReturnType<typeof useNavigate>;
  readonly setIsOpen: (open: boolean) => void;
}

const useConfirmationHandler = (options: ConfirmationOptions) => {
  const {
    inCommandMode,
    filteredCommands,
    filteredNodes,
    selectedIndex,
    activeGraphId,
    startWizard,
    navigate,
    setIsOpen,
  } = options;
  const handleTriggerCommand = (commandId: string) => {
    setIsOpen(false);
    void startWizard(commandId);
  };

  const handleSelectNode = (nodeId: string) => {
    setIsOpen(false);
    if (activeGraphId) {
      void navigate(`/graph/${activeGraphId}/node/${nodeId}`);
    }
  };

  const handleConfirm = () => {
    if (inCommandMode) {
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        handleTriggerCommand(selected.id);
      }
    } else {
      const selected = filteredNodes[selectedIndex];
      if (selected) {
        handleSelectNode(selected.id);
      }
    }
  };

  return {
    handleTriggerCommand,
    handleSelectNode,
    handleConfirm,
  };
};

interface PaletteListProps {
  readonly inCommandMode: boolean;
  readonly filteredCommands: readonly Readonly<{ id: string; title: string; category?: string }>[];
  readonly filteredNodes: readonly Node[];
  readonly selectedIndex: number;
  readonly graph: Graph | null;
  readonly handleTriggerCommand: (id: string) => void;
  readonly handleSelectNode: (id: string) => void;
  readonly setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}

const PaletteList: React.FC<PaletteListProps> = ({
  inCommandMode,
  filteredCommands,
  filteredNodes,
  selectedIndex,
  graph,
  handleTriggerCommand,
  handleSelectNode,
  setSelectedIndex,
}) => {
  if (inCommandMode) {
    if (filteredCommands.length === 0) {
      return (
        <div className="px-4 py-6 text-center text-xs text-on-surface-variant font-body">
          No commands found
        </div>
      );
    }
    return (
      <>
        {filteredCommands.map((cmd, idx) => (
          <CommandItem
            key={cmd.id}
            command={cmd}
            isSelected={idx === selectedIndex}
            onSelect={handleTriggerCommand}
            onMouseEnter={() => setSelectedIndex(idx)}
          />
        ))}
      </>
    );
  }

  if (!graph) {
    return (
      <div className="px-4 py-6 text-center text-xs text-on-surface-variant font-body">
        No graph loaded
      </div>
    );
  }

  if (filteredNodes.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-on-surface-variant font-body">
        No nodes found
      </div>
    );
  }

  return (
    <>
      {filteredNodes.map((node, idx) => (
        <NodeItem
          key={node.id}
          node={node}
          isSelected={idx === selectedIndex}
          onSelect={handleSelectNode}
          onMouseEnter={() => setSelectedIndex(idx)}
        />
      ))}
    </>
  );
};

export const CommandPalette: React.FC = () => {
  const { commands, startWizard } = usePlugin();
  const { graph } = useGraph();
  const { graphId } = useParams<Readonly<{ graphId: string }>>();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeGraphId = graphId ?? graph?.id;

  const { inCommandMode, filteredCommands, filteredNodes, filteredCount } = useFilteredItems(
    query,
    commands,
    graph,
  );

  useShortcutToggle(setIsOpen, setQuery, setSelectedIndex);
  useClickOutside(isOpen, containerRef, setIsOpen);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const activeEl = listRef.current.children[selectedIndex];
    if (activeEl instanceof HTMLElement) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, isOpen]);

  const { handleTriggerCommand, handleSelectNode, handleConfirm } = useConfirmationHandler({
    inCommandMode,
    filteredCommands,
    filteredNodes,
    selectedIndex,
    activeGraphId,
    startWizard,
    navigate,
    setIsOpen,
  });

  const handleKeyDown = useKeyboardNav(filteredCount, setSelectedIndex, setIsOpen, handleConfirm);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        ref={containerRef}
        className="w-full max-w-lg bg-[#0e141b] rounded-xl border border-[#2a3c54]/30 shadow-2xl overflow-hidden flex flex-col max-h-[300px] animate-in slide-in-from-top-4 duration-200"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a3c54]/30 bg-[#121a25]/50">
          <span className="material-symbols-outlined text-[#a2c9ff] text-[20px]">
            {inCommandMode ? 'terminal' : 'search'}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={inCommandMode ? 'Type a command to run...' : 'Search nodes...'}
            className="w-full bg-transparent border-none text-sm text-on-surface focus:outline-none placeholder-on-surface-variant/40 font-body"
          />
          <kbd className="text-[10px] text-on-surface-variant bg-[#1a2637]/50 px-2 py-0.5 rounded border border-[#2a3c54]/20 font-mono">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          <PaletteList
            inCommandMode={inCommandMode}
            filteredCommands={filteredCommands}
            filteredNodes={filteredNodes}
            selectedIndex={selectedIndex}
            graph={graph}
            handleTriggerCommand={handleTriggerCommand}
            handleSelectNode={handleSelectNode}
            setSelectedIndex={setSelectedIndex}
          />
        </div>
      </div>
    </div>
  );
};
