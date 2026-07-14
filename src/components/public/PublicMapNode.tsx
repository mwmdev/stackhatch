"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { getCategoryConfig } from "@/lib/node-config";
import type { DemoNode } from "@/content/stackhatch-demo";

export interface PublicMapNodeData extends Omit<DemoNode, "position"> {
  sequence: number;
  highlighted: boolean;
  dimmed: boolean;
}

function PublicMapNodeComponent({ data, selected }: NodeProps<PublicMapNodeData>) {
  const category = getCategoryConfig(data.category);

  return (
    <article
      className={`demo-node ${selected ? "is-selected" : ""} ${
        data.highlighted ? "is-highlighted" : ""
      } ${data.dimmed ? "is-dimmed" : ""}`}
      style={
        {
          "--demo-category": category.color,
          "--demo-sequence": data.sequence,
        } as React.CSSProperties
      }
      aria-label={`${data.name}, ${data.technology}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!pointer-events-none !h-px !w-px !border-0 !opacity-0"
        isConnectable={false}
      />
      <p className="demo-node-category">{category.displayName}</p>
      <h3>{data.name}</h3>
      <p className="demo-node-technology">{data.technology}</p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!pointer-events-none !h-px !w-px !border-0 !opacity-0"
        isConnectable={false}
      />
    </article>
  );
}

export const PublicMapNode = memo(PublicMapNodeComponent);
