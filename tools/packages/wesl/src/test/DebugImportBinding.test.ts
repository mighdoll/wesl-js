/**
 * Debug import binding differences between V1 and V2
 */
import { test } from "vitest";
import { weslParserConfig } from "../ParseWESL.ts";
import { link } from "../Linker.ts";

test("debug import binding: import twice doesn't get two copies", async () => {
  // Test case from importCases - "import twice doesn't get two copies"
  const weslSrc = {
    main: `
      import foo from "./file1";
      import foo from "./file1";
      fn bar() { foo(); }
    `,
    file1: `
      export fn foo() {}
    `,
  };

  console.log("\n==================== V1 Parser ====================");
  weslParserConfig.useV2Parser = false;
  try {
    const result1 = await link({ weslSrc, rootModuleName: "main" });
    console.log("V1 SUCCESS:");
    console.log(result1.dest);
  } catch (e: any) {
    console.log("V1 FAILED:");
    console.log(e.message);
  }

  console.log("\n==================== V2 Parser ====================");
  weslParserConfig.useV2Parser = true;
  try {
    const result2 = await link({ weslSrc, rootModuleName: "main" });
    console.log("V2 SUCCESS:");
    console.log(result2.dest);
  } catch (e: any) {
    console.log("V2 FAILED:");
    console.log(e.message);
  }
});
