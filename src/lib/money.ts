export const MAXIMUM_MINOR_UNIT_AMOUNT = 2_147_483_647;

const decimalAmountPattern = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export class InvalidMoneyAmountError extends Error {
  constructor() {
    super("Money amount must be a positive decimal with at most two digits");
    this.name = "InvalidMoneyAmountError";
  }
}

export function parseAmountToMinorUnits(value: string): number {
  const match = decimalAmountPattern.exec(value.trim());

  if (!match) {
    throw new InvalidMoneyAmountError();
  }

  const majorUnits = BigInt(match[1]);
  const fractionalUnits = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  const minorUnits = majorUnits * BigInt(100) + fractionalUnits;

  if (
    minorUnits <= BigInt(0) ||
    minorUnits > BigInt(MAXIMUM_MINOR_UNIT_AMOUNT)
  ) {
    throw new InvalidMoneyAmountError();
  }

  return Number(minorUnits);
}

export function formatMinorUnits(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidMoneyAmountError();
  }

  const majorUnits = Math.floor(value / 100);
  const fractionalUnits = String(value % 100).padStart(2, "0");

  return `${majorUnits}.${fractionalUnits}`;
}

export function formatTryAmount(value: number): string {
  return `₺${formatMinorUnits(value)}`;
}
