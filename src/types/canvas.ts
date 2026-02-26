import type { Node, Edge } from "reactflow";
import type { StackNode, StackEdge } from "./stack";
import type { StackNodeData } from "@/components/canvas/StackNode";
import type { StackEdgeData } from "@/components/canvas/StackEdge";

/** Convert domain StackNodes to React Flow Nodes */
export function toReactFlowNodes(
  nodes: StackNode[],
  positions?: Map<string, { x: number; y: number }>,
): Node<StackNodeData>[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "stackNode",
    position: positions?.get(node.id) ?? { x: 0, y: 0 },
    data: {
      category: node.category,
      subtype: node.subtype,
      name: node.name,
      technology: node.technology,
      description: node.description,
      reasoning: node.reasoning,
      locked: node.locked,
    },
  }));
}

/** Convert domain StackEdges to React Flow Edges */
export function toReactFlowEdges(edges: StackEdge[]): Edge<StackEdgeData>[] {
  return edges.map((edge) => ({
    id: edge.id,
    type: "stackEdge",
    source: edge.source,
    target: edge.target,
    data: {
      connectionType: edge.connectionType,
      label: edge.label,
    },
  }));
}

/** Convert React Flow Nodes back to domain StackNodes */
export function fromReactFlowNodes(nodes: Node<StackNodeData>[]): StackNode[] {
  return nodes.map((node) => ({
    id: node.id,
    category: node.data.category,
    subtype: node.data.subtype,
    name: node.data.name,
    technology: node.data.technology,
    description: node.data.description,
    reasoning: node.data.reasoning,
    locked: node.data.locked,
  }));
}

/** Convert React Flow Edges back to domain StackEdges */
export function fromReactFlowEdges(edges: Edge<StackEdgeData>[]): StackEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    connectionType: edge.data!.connectionType,
    label: edge.data!.label,
  }));
}
