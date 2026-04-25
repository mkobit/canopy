import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

export const CustomEdge = ({
  _id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  selected,
}: EdgeProps & Readonly<{ _id?: string }>) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeProps = {
    path: edgePath,
    style: {
      ...style,
      strokeWidth: selected ? 3 : 2,
      stroke: selected ? '#3b82f6' : '#cbd5e1',
    },
    className: 'transition-colors hover:stroke-gray-400 cursor-pointer',
    ...(markerEnd ? { markerEnd } : {}),
  };

  return (
    <>
      <BaseEdge {...edgeProps} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan px-2 py-0.5 bg-white text-xs text-gray-500 rounded border border-gray-200 shadow-sm font-mono opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
