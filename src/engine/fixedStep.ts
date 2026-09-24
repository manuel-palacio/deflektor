/** The simulation always advances in these exact steps, whatever the display's refresh rate. */
export const SIMULATION_STEP_SECONDS = 1 / 120;
/** After a stall (background tab, debugger) the backlog is dropped instead of fast-forwarding. */
const MAX_STEPS_PER_ADVANCE = 30;
/** Frame times are floats; without a little slack, two half-steps could add up to just under one. */
const ROUNDING_SLACK = 1e-9;

/** Turns variable frame times into a whole number of fixed simulation steps. */
export class FixedStepper {
  private accumulated = 0;

  /** Runs `step` as many times as the elapsed time allows; returns how many steps ran. */
  advance(seconds: number, step: (stepSeconds: number) => void): number {
    this.accumulated += seconds;
    let steps = 0;
    while (this.accumulated >= SIMULATION_STEP_SECONDS - ROUNDING_SLACK && steps < MAX_STEPS_PER_ADVANCE) {
      step(SIMULATION_STEP_SECONDS);
      this.accumulated -= SIMULATION_STEP_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_ADVANCE) this.accumulated = 0;
    return steps;
  }

  reset(): void {
    this.accumulated = 0;
  }
}
