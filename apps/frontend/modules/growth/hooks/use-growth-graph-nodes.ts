import { applyNodeChanges, type NodeChange } from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';
import type { GrowthGraphNode } from '../components/growth-graph-model';

const emptyNodes: GrowthGraphNode[] = [];

function retainMeasurements(
  source: GrowthGraphNode[],
  measured: GrowthGraphNode[],
): GrowthGraphNode[] {
  const byId = new Map(measured.map((node) => [node.id, node]));
  return source.map((node) => {
    const previous = byId.get(node.id);
    if (
      !previous ||
      previous.type !== node.type ||
      previous.data.kind !== node.data.kind
    )
      return node;
    return {
      ...node,
      measured: previous.measured,
      selected: previous.selected,
    };
  });
}

/** Keep browser measurements while the canonical graph supplies current data. */
export function useGrowthGraphNodes(
  viewKey: string,
  source: GrowthGraphNode[] = emptyNodes,
) {
  const [snapshot, setSnapshot] = useState({ viewKey, nodes: emptyNodes });
  const nodes = useMemo(
    () =>
      retainMeasurements(
        source,
        snapshot.viewKey === viewKey ? snapshot.nodes : emptyNodes,
      ),
    [source, snapshot, viewKey],
  );
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // YAML owns the structure; React Flow owns measurements and selection.
      const presentation = changes.filter(
        (change) => change.type === 'dimensions' || change.type === 'select',
      );
      if (!presentation.length) return;
      setSnapshot((previous) => ({
        viewKey,
        nodes: applyNodeChanges(
          presentation,
          retainMeasurements(
            source,
            previous.viewKey === viewKey ? previous.nodes : emptyNodes,
          ),
        ),
      }));
    },
    [source, viewKey],
  );
  return { nodes, onNodesChange };
}
