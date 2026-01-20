/**
 * Requirements addressed:
 * - Node descriptions are optional, one-line strings on GraphNode.
 * - Description gathering is invoked from core but implemented by the provider.
 * - Descriptions should be available even when TypeScript is missing (best-effort),
 *   without requiring TS compiler APIs.
 */

import fs from 'node:fs/promises';

import type { GraphNode, NodeId } from '../types';
import { nodeIdToAbsPath } from './paths';

export type DescribeSourceText = (args: {
  sourceText: string;
  nodeDescriptionLimit: number;
}) => string | undefined;

const isDescribableNode = (n: GraphNode): boolean =>
  (n.kind === 'source' || n.kind === 'external') &&
  (n.language === 'ts' || n.language === 'js');

export const applyNodeDescriptions = async (args: {
  cwd: string;
  nodes: Record<NodeId, GraphNode>;
  nodeDescriptionLimit: number;
  describeSourceText: DescribeSourceText;
}): Promise<Record<NodeId, GraphNode>> => {
  const limit = args.nodeDescriptionLimit;
  if (!Number.isFinite(limit) || limit <= 0) return args.nodes;

  const out: Record<NodeId, GraphNode> = { ...args.nodes };

  for (const [id, n] of Object.entries(args.nodes)) {
    if (!isDescribableNode(n)) continue;

    const abs = nodeIdToAbsPath(args.cwd, id);
    if (!abs) continue;

    let sourceText: string;
    try {
      sourceText = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }

    const desc = args.describeSourceText({
      sourceText,
      nodeDescriptionLimit: limit,
    });

    if (typeof desc === 'string') {
      if (desc === n.description) continue;
      out[id] = { ...n, description: desc };
      continue;
    }

    if (typeof n.description === 'string') {
      // Remove an existing description when it no longer resolves.
      const { description: _omit, ...rest } = n;
      out[id] = rest;
    }
  }

  return out;
};
