import { z } from "zod";

import { parseAmountToMinorUnits } from "./money";
import { prisma } from "./prisma";

const MAXIMUM_SORT_ORDER = 2_147_483_647;
const MAXIMUM_CATEGORIES = 100;
const MAXIMUM_ITEMS = 5_000;

const normalizedKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Must be a normalized lowercase key",
  });

const displayNameSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim(), {
    message: "Must not contain leading or trailing whitespace",
  });

const sortOrderSchema = z.number().int().min(0).max(MAXIMUM_SORT_ORDER);

const unitPriceSchema = z
  .string()
  .refine(
    (value) => {
      try {
        parseAmountToMinorUnits(value);
        return true;
      } catch {
        return false;
      }
    },
    {
      message: "Must be a positive decimal amount with at most two digits",
    },
  )
  .transform((value) => parseAmountToMinorUnits(value));

const catalogItemSchema = z
  .object({
    key: normalizedKeySchema,
    name: displayNameSchema,
    unitPrice: unitPriceSchema,
    sortOrder: sortOrderSchema,
    active: z.boolean(),
  })
  .strict()
  .transform(({ unitPrice, ...item }) => ({
    ...item,
    unitPriceMinor: unitPrice,
  }));

const catalogCategorySchema = z
  .object({
    key: normalizedKeySchema,
    name: displayNameSchema,
    sortOrder: sortOrderSchema,
    items: z.array(catalogItemSchema).max(MAXIMUM_ITEMS),
  })
  .strict();

const catalogImportDocumentSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    categories: z.array(catalogCategorySchema).min(1).max(MAXIMUM_CATEGORIES),
  })
  .strict()
  .superRefine((document, context) => {
    const categoryKeys = new Set<string>();
    const itemKeys = new Set<string>();
    let itemCount = 0;

    document.categories.forEach((category, categoryIndex) => {
      if (categoryKeys.has(category.key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate category key: ${category.key}`,
          path: ["categories", categoryIndex, "key"],
        });
      }

      categoryKeys.add(category.key);

      category.items.forEach((item, itemIndex) => {
        itemCount += 1;

        if (itemKeys.has(item.key)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate item key: ${item.key}`,
            path: ["categories", categoryIndex, "items", itemIndex, "key"],
          });
        }

        itemKeys.add(item.key);
      });
    });

    if (itemCount > MAXIMUM_ITEMS) {
      context.addIssue({
        code: "custom",
        message: `Catalog cannot contain more than ${MAXIMUM_ITEMS} items`,
        path: ["categories"],
      });
    }
  });

export class InvalidCatalogImportError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super("Catalog import document is invalid");
    this.name = "InvalidCatalogImportError";
    this.issues = issues;
  }
}

export function parseCatalogImportDocument(input: unknown) {
  const result = catalogImportDocumentSchema.safeParse(input);

  if (!result.success) {
    throw new InvalidCatalogImportError(
      result.error.issues.map((issue) => {
        const path = issue.path.join(".");

        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }

  return result.data;
}

export type CatalogImportDocument = ReturnType<
  typeof parseCatalogImportDocument
>;

export class CatalogImportRestaurantNotFoundError extends Error {
  constructor() {
    super("Catalog import restaurant was not found");
    this.name = "CatalogImportRestaurantNotFoundError";
  }
}

export type CatalogImportResult = {
  categories: {
    created: number;
    updated: number;
    unchanged: number;
  };
  items: {
    created: number;
    updated: number;
    unchanged: number;
  };
};

export async function importCatalog({
  restaurantId,
  document: input,
}: {
  restaurantId: string;
  document: unknown;
}): Promise<CatalogImportResult> {
  if (!restaurantId.trim()) {
    throw new CatalogImportRestaurantNotFoundError();
  }

  const document = parseCatalogImportDocument(input);

  return prisma.$transaction(
    async (transaction) => {
      const restaurant = await transaction.restaurant.findUnique({
        where: {
          id: restaurantId,
        },
        select: {
          id: true,
        },
      });

      if (!restaurant) {
        throw new CatalogImportRestaurantNotFoundError();
      }

      const existingCategories = await transaction.catalogCategory.findMany({
        where: {
          restaurantId,
        },
        select: {
          id: true,
          key: true,
          name: true,
          sortOrder: true,
        },
      });

      const categoriesByKey = new Map(
        existingCategories.map((category) => [category.key, category]),
      );

      const categoryIdsByKey = new Map<string, string>();
      const categoryResult = {
        created: 0,
        updated: 0,
        unchanged: 0,
      };

      for (const category of document.categories) {
        const existingCategory = categoriesByKey.get(category.key);

        if (!existingCategory) {
          const createdCategory = await transaction.catalogCategory.create({
            data: {
              restaurantId,
              key: category.key,
              name: category.name,
              sortOrder: category.sortOrder,
            },
            select: {
              id: true,
            },
          });

          categoryIdsByKey.set(category.key, createdCategory.id);
          categoryResult.created += 1;
          continue;
        }

        categoryIdsByKey.set(category.key, existingCategory.id);

        if (
          existingCategory.name === category.name &&
          existingCategory.sortOrder === category.sortOrder
        ) {
          categoryResult.unchanged += 1;
          continue;
        }

        await transaction.catalogCategory.update({
          where: {
            id: existingCategory.id,
          },
          data: {
            name: category.name,
            sortOrder: category.sortOrder,
          },
        });

        categoryResult.updated += 1;
      }

      const importedItems = document.categories.flatMap((category) =>
        category.items.map((item) => {
          const categoryId = categoryIdsByKey.get(category.key);

          if (!categoryId) {
            throw new Error(
              `Catalog category was not resolved: ${category.key}`,
            );
          }

          return {
            ...item,
            categoryId,
          };
        }),
      );

      const existingItems =
        importedItems.length === 0
          ? []
          : await transaction.catalogItem.findMany({
              where: {
                restaurantId,
                key: {
                  in: importedItems.map((item) => item.key),
                },
              },
              select: {
                id: true,
                categoryId: true,
                key: true,
                name: true,
                unitPriceMinor: true,
                isActive: true,
                sortOrder: true,
              },
            });

      const itemsByKey = new Map(existingItems.map((item) => [item.key, item]));

      const itemsToCreate = importedItems.filter(
        (item) => !itemsByKey.has(item.key),
      );

      const itemsToUpdate = importedItems.filter((item) => {
        const existingItem = itemsByKey.get(item.key);

        if (!existingItem) {
          return false;
        }

        return (
          existingItem.categoryId !== item.categoryId ||
          existingItem.name !== item.name ||
          existingItem.unitPriceMinor !== item.unitPriceMinor ||
          existingItem.isActive !== item.active ||
          existingItem.sortOrder !== item.sortOrder
        );
      });

      const itemResult = {
        created: itemsToCreate.length,
        updated: itemsToUpdate.length,
        unchanged:
          importedItems.length - itemsToCreate.length - itemsToUpdate.length,
      };

      if (itemsToCreate.length > 0) {
        await transaction.catalogItem.createMany({
          data: itemsToCreate.map((item) => ({
            restaurantId,
            categoryId: item.categoryId,
            key: item.key,
            name: item.name,
            unitPriceMinor: item.unitPriceMinor,
            isActive: item.active,
            sortOrder: item.sortOrder,
          })),
        });
      }

      await Promise.all(
        itemsToUpdate.map((item) => {
          const existingItem = itemsByKey.get(item.key);

          if (!existingItem) {
            throw new Error(
              `Existing catalog item was not resolved: ${item.key}`,
            );
          }

          return transaction.catalogItem.update({
            where: {
              id: existingItem.id,
            },
            data: {
              categoryId: item.categoryId,
              name: item.name,
              unitPriceMinor: item.unitPriceMinor,
              isActive: item.active,
              sortOrder: item.sortOrder,
            },
          });
        }),
      );

      return {
        categories: categoryResult,
        items: itemResult,
      };
    },
    {
      timeout: 60_000,
    },
  );
}
