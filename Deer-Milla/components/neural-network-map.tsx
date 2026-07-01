import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { MemoryGraph } from '@/services/milla-api';

interface NeuralNode {
  id: string;
  x: number;
  y: number;
  type: 'episodic' | 'semantic' | 'procedural' | 'working' | 'hub';
  strength: number;
  connections: string[];
}

const TYPE_COLOR: Record<string, string> = {
  episodic: '#7df9ff',
  semantic: '#a78bfa',
  procedural: '#34d399',
  working: '#fbbf24',
  hub: '#f472b6',
};

function buildDefaultNodes(): NeuralNode[] {
  return [
    {
      id: 'hub-core',
      x: 0.5,
      y: 0.45,
      type: 'hub',
      strength: 1,
      connections: ['e1', 's1', 'p1', 'w1', 's2', 'e2'],
    },
    {
      id: 'e1',
      x: 0.18,
      y: 0.2,
      type: 'episodic',
      strength: 0.85,
      connections: ['hub-core', 'e2'],
    },
    {
      id: 'e2',
      x: 0.3,
      y: 0.75,
      type: 'episodic',
      strength: 0.6,
      connections: ['hub-core', 'e1'],
    },
    {
      id: 's1',
      x: 0.72,
      y: 0.18,
      type: 'semantic',
      strength: 0.9,
      connections: ['hub-core', 's2'],
    },
    {
      id: 's2',
      x: 0.82,
      y: 0.62,
      type: 'semantic',
      strength: 0.7,
      connections: ['hub-core', 's1'],
    },
    {
      id: 'p1',
      x: 0.14,
      y: 0.55,
      type: 'procedural',
      strength: 0.75,
      connections: ['hub-core'],
    },
    {
      id: 'w1',
      x: 0.6,
      y: 0.85,
      type: 'working',
      strength: 0.5,
      connections: ['hub-core'],
    },
  ];
}

function buildNodesFromGraph(graph: MemoryGraph): NeuralNode[] {
  if (!graph.nodes?.length) return buildDefaultNodes();

  const width = 1;
  const height = 1;
  const nodeMap = new Map<string, NeuralNode>();

  const positions = [
    { x: 0.5, y: 0.45 },
    { x: 0.18, y: 0.2 },
    { x: 0.3, y: 0.75 },
    { x: 0.72, y: 0.18 },
    { x: 0.82, y: 0.62 },
    { x: 0.14, y: 0.55 },
    { x: 0.6, y: 0.85 },
    { x: 0.4, y: 0.12 },
    { x: 0.88, y: 0.35 },
    { x: 0.25, y: 0.42 },
  ];

  graph.nodes.slice(0, 10).forEach((node, i) => {
    const pos = positions[i] || {
      x: Math.random() * width,
      y: Math.random() * height,
    };
    nodeMap.set(node.id, {
      id: node.id,
      x: pos.x,
      y: pos.y,
      type: node.type,
      strength: node.strength,
      connections: node.connections.slice(0, 3),
    });
  });

  return Array.from(nodeMap.values());
}

interface Props {
  graph?: MemoryGraph | null;
  width?: number;
  height?: number;
}

export function NeuralNetworkMap({ graph, width = 320, height = 200 }: Props) {
  const nodes = graph ? buildNodesFromGraph(graph) : buildDefaultNodes();
  const pulseAnims = useRef(nodes.map(() => new Animated.Value(0)));

  useEffect(() => {
    const animations = pulseAnims.current.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 280),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const connections: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    key: string;
  }> = [];
  const seen = new Set<string>();
  nodes.forEach((n) => {
    n.connections.forEach((targetId) => {
      const pairKey = [n.id, targetId].sort().join('-');
      if (seen.has(pairKey)) return;
      seen.add(pairKey);
      const target = nodeById.get(targetId);
      if (!target) return;
      connections.push({
        x1: n.x * width,
        y1: n.y * height,
        x2: target.x * width,
        y2: target.y * height,
        key: pairKey,
      });
    });
  });

  return (
    <View style={[styles.container, { width, height }]}>
      {connections.map((c) => {
        const dx = c.x2 - c.x1;
        const dy = c.y2 - c.y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View
            key={c.key}
            style={[
              styles.connection,
              {
                width: length,
                left: c.x1,
                top: c.y1,
                transform: [{ rotate: `${angle}deg` }],
              },
            ]}
          />
        );
      })}

      {nodes.map((node, i) => {
        const color = TYPE_COLOR[node.type] ?? '#7df9ff';
        const size = node.type === 'hub' ? 20 : 10 + node.strength * 8;
        const opacity =
          pulseAnims.current[i]?.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 1],
          }) ?? 0.8;

        return (
          <Animated.View
            key={node.id}
            style={[
              styles.node,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                left: node.x * width - size / 2,
                top: node.y * height - size / 2,
                opacity,
                shadowColor: color,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const LEGEND = [
  { type: 'episodic', label: 'Episodic' },
  { type: 'semantic', label: 'Semantic' },
  { type: 'procedural', label: 'Procedural' },
  { type: 'working', label: 'Working' },
  { type: 'hub', label: 'Core Hub' },
];

export function NeuralNetworkLegend() {
  return (
    <View style={legendStyles.row}>
      {LEGEND.map((item) => (
        <View key={item.type} style={legendStyles.item}>
          <View
            style={[
              legendStyles.dot,
              { backgroundColor: TYPE_COLOR[item.type] },
            ]}
          />
          <ThemedText style={legendStyles.label}>{item.label}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  connection: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(125, 249, 255, 0.18)',
    transformOrigin: '0 0',
  },
  node: {
    position: 'absolute',
    shadowOpacity: 0.6,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});

const legendStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 11,
    opacity: 0.75,
  },
});
