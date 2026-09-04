import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  CatalogImportRestaurantNotFoundError,
  InvalidCatalogImportError,
  importCatalog,
} from "../src/lib/catalog-import";
import { prisma } from "../src/lib/prisma";

function requireArgument(
  value: string | undefined,
  optionName: string,
): string {
  if (!value?.trim()) {
    throw new Error(`Missing required option: --${optionName}`);
  }

  return value.trim();
}

async function main() {
  const { values } = parseArgs({
    options: {
      "restaurant-id": {
        type: "string",
      },
      file: {
        type: "string",
      },
    },
    allowPositionals: false,
    strict: true,
  });

  const restaurantId = requireArgument(
    values["restaurant-id"],
    "restaurant-id",
  );
  const filePath = requireArgument(values.file, "file");
  const resolvedFilePath = resolve(process.cwd(), filePath);

  const contents = await readFile(resolvedFilePath, "utf8");

  let document: unknown;

  try {
    document = JSON.parse(contents) as unknown;
  } catch {
    throw new InvalidCatalogImportError(["File must contain valid JSON"]);
  }

  const result = await importCatalog({
    restaurantId,
    document,
  });

  console.log(`Catalog import completed for restaurant ${restaurantId}.`);
  console.log(
    `Categories: ${result.categories.created} created, ${result.categories.updated} updated, ${result.categories.unchanged} unchanged.`,
  );
  console.log(
    `Items: ${result.items.created} created, ${result.items.updated} updated, ${result.items.unchanged} unchanged.`,
  );
}

main()
  .catch((error: unknown) => {
    if (error instanceof InvalidCatalogImportError) {
      console.error(error.message);

      for (const issue of error.issues) {
        console.error(`- ${issue}`);
      }
    } else if (error instanceof CatalogImportRestaurantNotFoundError) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
