import { testLink } from "./TestLink.ts";

// Test case: import a transitive struct
const testCase = {
  name: "import a transitive struct",
  weslSrc: {
    "./main.wgsl": `
      import package::file1::AStruct;

      struct SrcStruct {
        a: AStruct,
      }
    `,
    "./file1.wgsl": `
      import package::file2::BStruct;

      struct AStruct {
        s: BStruct
      }
    `,
    "./file2.wgsl": `
      struct BStruct {
        x: u32
      }
    `,
  },
  expect: `
struct SrcStruct { a: package_file1_AStruct }
struct package_file1_AStruct { s: package_file2_BStruct }
struct package_file2_BStruct { x: u32 }
  `,
};

try {
  testLink(testCase, { useV2Parser: true });
  console.log("Test passed!");
} catch (error) {
  console.log("Test failed:", error.message);
}
