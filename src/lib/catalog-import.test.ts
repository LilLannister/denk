import { describe, expect, it } from "vitest";

import {
  InvalidCatalogImportError,
  parseCatalogImportDocument,
} from "./catalog-import";

function createValidDocument() {
  return {
    schemaVersion: "1.0.0",
    categories: [
      {
        key: "pizza",
        name: "Pizza",
        sortOrder: 10,
        items: [
          {
            key: "margherita",
            name: "Margherita",
            unitPrice: "250.00",
            sortOrder: 10,
            active: true,
          },
        ],
      },
    ],
  };
}

function createItem(index: number) {
  return {
    key: `item-${index}`,
    name: `Item ${index}`,
    unitPrice: "1.00",
    sortOrder: index,
    active: true,
  };
}

function expectInvalid(
  input: unknown,
  expectedIssue?: string,
): InvalidCatalogImportError {
  try {
    parseCatalogImportDocument(input);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidCatalogImportError);

    const invalidImportError = error as InvalidCatalogImportError;

    if (expectedIssue) {
      expect(
        invalidImportError.issues.some((issue) =>
          issue.includes(expectedIssue),
        ),
      ).toBe(true);
    }

    return invalidImportError;
  }

  throw new Error("Expected catalog import parsing to fail");
}

describe("catalog import parsing", () => {
  it("parses a versioned categorized catalog", () => {
    const document = parseCatalogImportDocument(createValidDocument());

    expect(document).toEqual({
      schemaVersion: "1.0.0",
      categories: [
        {
          key: "pizza",
          name: "Pizza",
          sortOrder: 10,
          items: [
            {
              key: "margherita",
              name: "Margherita",
              unitPriceMinor: 25_000,
              sortOrder: 10,
              active: true,
            },
          ],
        },
      ],
    });
  });

  it("converts prices to exact minor units", () => {
    const input = createValidDocument();
    input.categories[0].items[0].unitPrice = "0.01";

    const document = parseCatalogImportDocument(input);

    expect(document.categories[0].items[0].unitPriceMinor).toBe(1);
  });

  it("accepts the maximum PostgreSQL integer price", () => {
    const input = createValidDocument();
    input.categories[0].items[0].unitPrice = "21474836.47";

    const document = parseCatalogImportDocument(input);

    expect(document.categories[0].items[0].unitPriceMinor).toBe(2_147_483_647);
  });

  it("accepts a category without items", () => {
    const input = createValidDocument();
    input.categories[0].items = [];

    expect(parseCatalogImportDocument(input)).toMatchObject({
      categories: [
        {
          key: "pizza",
          items: [],
        },
      ],
    });
  });

  it.each(["1", "1.0.1", "1.1.0", "2.0.0"])(
    "rejects unsupported schema version %s",
    (schemaVersion) => {
      const input = {
        ...createValidDocument(),
        schemaVersion,
      };

      expectInvalid(input, "schemaVersion");
    },
  );

  it("rejects a non-string schema version", () => {
    const input = {
      ...createValidDocument(),
      schemaVersion: 1,
    };

    expectInvalid(input, "schemaVersion");
  });

  it("rejects an empty category list", () => {
    const input = {
      ...createValidDocument(),
      categories: [],
    };

    expectInvalid(input, "categories");
  });

  it("rejects more than 100 categories", () => {
    const input = {
      schemaVersion: "1.0.0",
      categories: Array.from({ length: 101 }, (_, index) => ({
        key: `category-${index}`,
        name: `Category ${index}`,
        sortOrder: index,
        items: [],
      })),
    };

    expectInvalid(input, "categories");
  });

  it("rejects more than 5,000 items across categories", () => {
    const input = {
      schemaVersion: "1.0.0",
      categories: [
        {
          key: "first-category",
          name: "First Category",
          sortOrder: 10,
          items: Array.from({ length: 2_501 }, (_, index) => createItem(index)),
        },
        {
          key: "second-category",
          name: "Second Category",
          sortOrder: 20,
          items: Array.from({ length: 2_500 }, (_, index) =>
            createItem(index + 2_501),
          ),
        },
      ],
    };

    expectInvalid(input, "more than 5000 items");
  });

  it("rejects duplicate category keys", () => {
    const category = createValidDocument().categories[0];
    const input = {
      schemaVersion: "1.0.0",
      categories: [
        category,
        {
          ...category,
          name: "Another Pizza Category",
          sortOrder: 20,
          items: [],
        },
      ],
    };

    expectInvalid(input, "Duplicate category key: pizza");
  });

  it("rejects duplicate item keys within one category", () => {
    const input = createValidDocument();
    const item = input.categories[0].items[0];

    input.categories[0].items.push({
      ...item,
      name: "Another Margherita",
      sortOrder: 20,
    });

    expectInvalid(input, "Duplicate item key: margherita");
  });

  it("rejects duplicate item keys across categories", () => {
    const input = createValidDocument();
    const item = input.categories[0].items[0];

    input.categories.push({
      key: "specials",
      name: "Specials",
      sortOrder: 20,
      items: [
        {
          ...item,
          name: "Special Margherita",
        },
      ],
    });

    expectInvalid(input, "Duplicate item key: margherita");
  });

  it.each([
    {
      description: "root",
      input: {
        ...createValidDocument(),
        unexpected: true,
      },
    },
    {
      description: "category",
      input: {
        ...createValidDocument(),
        categories: [
          {
            ...createValidDocument().categories[0],
            unexpected: true,
          },
        ],
      },
    },
    {
      description: "item",
      input: {
        ...createValidDocument(),
        categories: [
          {
            ...createValidDocument().categories[0],
            items: [
              {
                ...createValidDocument().categories[0].items[0],
                unexpected: true,
              },
            ],
          },
        ],
      },
    },
  ])("rejects unknown fields at the $description level", ({ input }) => {
    expectInvalid(input, "Unrecognized key");
  });

  it.each([
    {
      field: "category key",
      update(input: ReturnType<typeof createValidDocument>) {
        input.categories[0].key = "Pizza";
      },
    },
    {
      field: "category name",
      update(input: ReturnType<typeof createValidDocument>) {
        input.categories[0].name = " Pizza ";
      },
    },
    {
      field: "category sort order",
      update(input: ReturnType<typeof createValidDocument>) {
        input.categories[0].sortOrder = -1;
      },
    },
    {
      field: "item key",
      update(input: ReturnType<typeof createValidDocument>) {
        input.categories[0].items[0].key = "Margherita";
      },
    },
    {
      field: "item name",
      update(input: ReturnType<typeof createValidDocument>) {
        input.categories[0].items[0].name = " Margherita ";
      },
    },
    {
      field: "item sort order",
      update(input: ReturnType<typeof createValidDocument>) {
        input.categories[0].items[0].sortOrder = -1;
      },
    },
  ])("rejects an invalid $field", ({ update }) => {
    const input = createValidDocument();
    update(input);

    expectInvalid(input);
  });

  it.each(["0", "-1", "1.234", "1,50", "21474836.48", "not-a-price"])(
    "rejects invalid item price %s",
    (unitPrice) => {
      const input = createValidDocument();
      input.categories[0].items[0].unitPrice = unitPrice;

      expectInvalid(input, "unitPrice");
    },
  );

  it("reports the path of an invalid value", () => {
    const input = createValidDocument();
    input.categories[0].items[0].unitPrice = "invalid";

    const error = expectInvalid(input);

    expect(error.issues).toContain(
      "categories.0.items.0.unitPrice: Must be a positive decimal amount with at most two digits",
    );
  });
});
