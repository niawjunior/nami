'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  ReactFlowProvider,
  NodeTypes,
  SelectionMode,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import FolderNode from './nodes/FolderNode';
import FileNode from './nodes/FileNode';
import { buildGraphFromFiles, getLayoutedElements } from './utils/graphBuilder';
import { FileEntry } from '../file-browser/FileExplorer';

import { VisualControls } from './VisualControls';

// --- Types ---
interface VisualProjectMapProps {
  files: FileEntry[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenFile: (path: string) => void;
}

// --- Icons / Styles ---
const nodeTypes: NodeTypes = {
  folder: FolderNode,
  file: FileNode,
};

function VisualProjectMapContent({ files, currentPath, onNavigate, onOpenFile }: VisualProjectMapProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [graphMode, setGraphMode] = React.useState<'structure' | 'dependency'>('structure');
  const [isLoadingProps, setIsLoadingProps] = React.useState(false);

  // Re-build graph when files or path changes (Structure Mode)
  useEffect(() => {
    if (graphMode !== 'structure' || !files || !currentPath) return;

    const { nodes: newNodes, edges: newEdges } = buildGraphFromFiles(files, currentPath);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [files, currentPath, graphMode, setNodes, setEdges]);

  // Load Dependencies (Dependency Mode)
  useEffect(() => {
    if (graphMode !== 'dependency' || !currentPath) return;

    let isMounted = true;
    const loadDeps = async () => {
        setIsLoadingProps(true);
        setNodes([]); // Clear previous nodes to avoid confusion
        setEdges([]);
        try {
            const { nodes: depNodes, edges: depEdges } = await window.electron.analyzeDependencies(currentPath);
            if (!isMounted) return;

            // Add basic layout props if missing (or use dagre on them)
            // Re-using generic layout helper for now, assuming nodes have ID/Labels
            // We need to map the raw nodes to React Flow nodes
            const flowNodes: Node[] = depNodes.map((n: any) => ({
                id: n.id,
                type: 'file', 
                data: { 
                    label: n.label, 
                    path: n.id, 
                    extension: n.label.split('.').pop(),
                    isExternal: n.isExternal // Pass flag
                },
                position: { x: 0, y: 0 },
                style: n.isExternal ? { opacity: 0.6, borderStyle: 'dashed' } : undefined // Visual cue for external
            }));

            const flowEdges: Edge[] = depEdges.map((e: any, i: number) => ({
                id: `e-${e.source}-${e.target}-${i}`, // Unique ID
                source: e.source,
                target: e.target,
                type: 'default', // Curved lines
                animated: true,
                style: { stroke: '#64748b', strokeWidth: 2, opacity: 1 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' }, // Add arrow
            }));
            
            // We need to import getLayoutedElements from graphBuilder but it's not exported to the component scope here easily unless we import it
            // For now, let's blindly set them and let React Flow handle or use a simple layout if possible.
            // Actually, we should use the same layout function.
            // Just for this prototype, I will trust the nodes have IDs. 
            // We should use dagre again.
            
            // Note: Since we can't easily import 'getLayoutedElements' inside this replace block without changing imports,
            // I will assume the user has that import or I'll add it.
            // Wait, I can see the import in the file already: import { buildGraphFromFiles } from './utils/graphBuilder';
            // I need to change the import to include getLayoutedElements.
            
            // For now, set raw positions and let's update imports in next step if needed.
            // Actually, I'll assume they will be piled up without layout. 
            // I'll add a separate step to fix the layout or imports.
            
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges, 'LR');
            
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);

        } catch (e) {
            console.error(e);
        } finally {
            if (isMounted) setIsLoadingProps(false);
        }
    };
    
    loadDeps();
    return () => { isMounted = false; };
  }, [currentPath, graphMode, setNodes, setEdges]);

  // Filter Nodes (Visual Only)
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        // If search is empty, show everything fully
        if (!searchQuery) {
          return { ...node, style: { ...node.style, opacity: 1 } };
        }

        // Check if node matches query
        const label = (node.data.label as string).toLowerCase();
        // ... (rest of search logic)
        const query = searchQuery.toLowerCase();
        const isMatch = label.includes(query);

        return {
          ...node,
          style: {
            ...node.style,
            opacity: isMatch ? 1 : 0.2, // Fade out non-matches
          },
        };
      })
    );
  }, [searchQuery, setNodes]);

  // Handle Node Click
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // ...
  }, []);

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    // ... same as before
    if (node.type === 'folder' && !node.data.isRoot) {
        setSearchQuery(''); // Clear search on navigation
        onNavigate(node.data.path);
    } else if (node.type === 'file') {
      // Open file
       window.electron.openPath(node.data.path);
    }
  }, [onNavigate]);

  return (
    <div className="w-full h-full bg-slate-50 dark:bg-slate-950 relative group">
      <VisualControls 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        graphMode={graphMode}
        setGraphMode={setGraphMode}
      />
      {isLoadingProps && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-background/80 backdrop-blur rounded-full shadow border border-border flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Analyzing dependencies...</span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        attributionPosition="bottom-right"
        selectionMode={SelectionMode.Partial}
        minZoom={0.1}
      >
        <Background gap={20} size={1} color="#94a3b8" />
        <Controls className="bg-white dark:bg-slate-900 border-border fill-foreground text-foreground shadow-sm" />
        <MiniMap 
            nodeColor={(node) => {
                if (node.type === 'folder') return '#3b82f6'; // Blue-500
                return '#cbd5e1'; // Slate-300 (visible on white)
            }}
            className="!bg-white dark:!bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md override-minimap" 
            maskColor="rgba(0, 0, 0, 0.1)" // Lighter mask for better contrast
        />
      </ReactFlow>
    </div>
  );
}

// Wrapper with Provider is best practice
export default function VisualProjectMap(props: VisualProjectMapProps) {
  return (
    <ReactFlowProvider>
      <VisualProjectMapContent {...props} />
    </ReactFlowProvider>
  );
}
