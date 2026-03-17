// Auto-forked relationship/bond system — multi-persona trust engine
export type Persona = 'rayne' | 'deer' | 'elara' | 'sarii';

export interface Bond {
  persona: Persona;
  trust: number;     // 0-100
  sharedMemories: string[];
  lastUpdate: Date;
}

export const strengthenBond = (bond: Bond, interaction: string): Bond => ({
  ...bond,
  trust: Math.min(100, bond.trust + (interaction.length > 40 ? 8 : 3)),
  sharedMemories: [...bond.sharedMemories, interaction].slice(-8),
  lastUpdate: new Date()
});
