import { describe, expect, spyOn, test } from "bun:test";
import { killProcessGroup, processGroupAlive } from "./process-group";

describe("killProcessGroup outcome", () => {
  const deadPgid = 2_000_000_000;

  test("returns false for a dead pgid without sending a signal", () => {
    expect(processGroupAlive(deadPgid)).toBe(false);
    const kill = spyOn(process, "kill");
    try {
      expect(killProcessGroup(deadPgid, "SIGTERM")).toBe(false);
      expect(kill.mock.calls).toEqual([[-deadPgid, 0]]);
    } finally {
      kill.mockRestore();
    }
  });

  for (const throws of [false, true]) {
    test(`returns the signal outcome after a successful probe (throws=${throws})`, () => {
      const kill = spyOn(process, "kill").mockImplementation((_pid, signal) => {
        if (throws && signal !== 0)
          throw Object.assign(new Error("group disappeared"), { code: "ESRCH" });
        return true;
      });
      try {
        expect(killProcessGroup(deadPgid, "SIGTERM")).toBe(!throws);
        expect(kill.mock.calls).toEqual([[-deadPgid, 0], [-deadPgid, "SIGTERM"]]);
      } finally {
        kill.mockRestore();
      }
    });
  }
});
