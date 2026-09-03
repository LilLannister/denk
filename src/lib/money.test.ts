import { describe, expect, it } from "vitest";

import {
  InvalidMoneyAmountError,
  formatMinorUnits,
  formatTryAmount,
  parseAmountToMinorUnits,
} from "./money";

describe("money utilities", () => {
  it.each([
    ["1", 100],
    ["1.5", 150],
    ["1.50", 150],
    ["125.50", 12_550],
    ["0.01", 1],
    ["21474836.47", 2_147_483_647],
  ])("converts %s to exact minor units", (input, expected) => {
    expect(parseAmountToMinorUnits(input)).toBe(expected);
  });

  it.each([
    "",
    "0",
    "0.00",
    "-1",
    "1.234",
    "1,50",
    "abc",
    "21474836.48",
    "90071992547409.92",
  ])("rejects invalid amount %s", (input) => {
    expect(() => parseAmountToMinorUnits(input)).toThrow(
      InvalidMoneyAmountError,
    );
  });

  it("formats minor units without floating-point arithmetic", () => {
    expect(formatMinorUnits(12_550)).toBe("125.50");
    expect(formatMinorUnits(1)).toBe("0.01");
  });

  it("formats V1 money as Turkish lira", () => {
    expect(formatTryAmount(12_550)).toBe("₺125.50");
    expect(formatTryAmount(1)).toBe("₺0.01");
  });
});
