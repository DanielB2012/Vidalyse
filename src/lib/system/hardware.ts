import os from "node:os";

// Only RAM is used for the "Recommandé" hint (spec's "ne jamais inventer" —
// os.totalmem() is a real, reliable cross-platform reading). VRAM is
// deliberately NOT detected: Windows WMI/AdapterRAM readings are known to be
// wrong on modern GPU drivers, and reporting a fabricated-looking VRAM figure
// would be worse than not showing one.
export function getSystemRamGB(): number {
  return Math.round(os.totalmem() / 1024 ** 3);
}
