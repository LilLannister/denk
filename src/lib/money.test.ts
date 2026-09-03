import { describe, expect, it } from "vitest";

import {
  InvalidMoneyAmountError,
  formatMinorUnits,
  parseAmountToMinorUnits,
} from "./money";

describe("money utilities", () => {
  it.each([
    ["1", 100],
    ["1.5", 150],
    ["1.50", 150],
    ["125.50", 12_550],
    ["0.01", 1],
  ])("converts %s to exact minor units", (input, expected) => {
    expect(parseAmountToMinorUnits(input)).toBe(expected);
  });

  it.each(["", "0", "0.00", "-1", "1.234", "1,50", "abc"])(
    "rejects invalid amount %s",
    (input) => {
      expect(() => parseAmountToMinorUnits(input)).toThrow(
        InvalidMoneyAmountError,
      );
    },
  );

  it("formats minor units without floating-point arithmetic", () => {
    expect(formatMinorUnits(12_550)).toBe("125.50");
    expect(formatMinorUnits(1)).toBe("0.01");
  });
});
