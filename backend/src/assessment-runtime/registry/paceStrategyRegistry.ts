import type { PaceKind } from "../types/mode.js";
import type { PaceStrategy } from "../strategies/paceStrategy.js";
import { InstructorPacedStrategy } from "../strategies/instructorPacedStrategy.js";
import { SelfPacedStrategy } from "../strategies/selfPacedStrategy.js";
import type { LiveSessionPort } from "../ports/liveSessionPort.js";

export class PaceStrategyRegistry {
  private readonly strategies = new Map<PaceKind, PaceStrategy>();

  register(strategy: PaceStrategy): void {
    this.strategies.set(strategy.paceKind, strategy);
  }

  get(paceKind: PaceKind): PaceStrategy {
    const strategy = this.strategies.get(paceKind);
    if (!strategy) {
      throw new Error(`No PaceStrategy registered for pace kind: ${paceKind}`);
    }
    return strategy;
  }

  has(paceKind: PaceKind): boolean {
    return this.strategies.has(paceKind);
  }

  list(): PaceKind[] {
    return [...this.strategies.keys()];
  }
}

/** Factory — registers instructor + self-paced strategies. */
export function createDefaultPaceStrategyRegistry(
  instructorPort: LiveSessionPort,
  selfPacedPort: LiveSessionPort
): PaceStrategyRegistry {
  const registry = new PaceStrategyRegistry();
  registry.register(new InstructorPacedStrategy(instructorPort));
  registry.register(new SelfPacedStrategy(selfPacedPort));
  return registry;
}
