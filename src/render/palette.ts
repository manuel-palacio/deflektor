export const PALETTE = {
  background: 0x07051a,
  boardFill: 0x0c0826,
  gridLine: 0x1d1648,
  frame: 0x7b5cff,
  reflectorFill: 0x3b2a8f,
  reflectorEdge: 0xa98bff,
  absorberFill: 0x0d3a48,
  absorberEdge: 0x4fd8f0,
  gateFill: 0x0f4d5c,
  gateEdge: 0x9ff4ff,
  refractor: 0xff7a6b,
  polarizerAbsorbing: 0xffc34d,
  polarizerReflecting: 0xd4e6ff,
  beam: 0x3df2ff,
  beamHot: 0xff3355,
  beamCore: 0xffffff,
  pod: 0xff3fb4,
  mine: 0xff4d2e,
  mirrorBase: 0x1b1650,
  mirrorRim: 0x6b5cff,
  mirrorPlate: 0xe8f7ff,
  autoMirrorPlate: 0xffd23f,
  emitter: 0x3df2ff,
  receiverLocked: 0x5a4f8a,
  receiverOpen: 0x39ff9c,
  cursor: 0xffffff,
  fibre: { T: 0xffb347, U: 0x7cff6b } as Record<string, number>,
} as const;

export function mixColor(from: number, to: number, amount: number): number {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * amount) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}
