import * as fs from "node:fs/promises";
import { globSync } from "glob";
import type { Snippet } from "./snippet-extractor.ts";

export interface UpdateResult {
  filePath: string;
  updated: boolean;
  snippetsUpdated: string[];
}

export async function updateMarkdownFiles(
  destinationGlobs: string[],
  snippets: Map<string, Snippet>,
  cwd: string = process.cwd()
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];

  for (const glob of destinationGlobs) {
    const files = globSync(glob, { cwd, absolute: true });

    for (const filePath of files) {
      const result = await updateMarkdownFile(filePath, snippets);
      results.push(result);
    }
  }

  return results;
}

async function updateMarkdownFile(
  filePath: string,
  snippets: Map<string, Snippet>
): Promise<UpdateResult> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const updatedLines: string[] = [];
  const snippetsUpdated: string[] = [];
  let changed = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Look for snippet marker: <!-- snippet: name -->
    const snippetMatch = line.match(/<!--\s*snippet:\s*(\S+)\s*-->/);

    if (snippetMatch) {
      const snippetName = snippetMatch[1];
      const snippet = snippets.get(snippetName);

      if (!snippet) {
        throw new Error(
          `Snippet "${snippetName}" referenced in ${filePath} but not found in source files`
        );
      }

      // Keep the snippet marker line
      updatedLines.push(line);
      i++;

      // Find the code fence start
      let codeFenceStart = -1;
      let language = snippet.language;

      while (i < lines.length) {
        const currentLine = lines[i];

        // Check if it's a code fence
        const fenceMatch = currentLine.match(/^```(\w*)/);
        if (fenceMatch) {
          codeFenceStart = i;
          // Use language from fence if present, otherwise use detected
          if (fenceMatch[1]) {
            language = fenceMatch[1];
          }
          break;
        }

        // If we hit the end marker without finding a code fence, error
        if (currentLine.match(/<!--\s*\/snippet\s*-->/)) {
          throw new Error(
            `No code fence found for snippet "${snippetName}" in ${filePath}`
          );
        }

        // Keep non-fence lines before the fence
        updatedLines.push(currentLine);
        i++;
      }

      if (codeFenceStart === -1) {
        throw new Error(
          `No code fence found for snippet "${snippetName}" in ${filePath}`
        );
      }

      // Write the code fence with detected language
      updatedLines.push("```" + language);

      // Write the snippet content
      updatedLines.push(snippet.content);

      // Skip old content until we find the closing fence or end marker
      i++; // Skip the opening fence we just processed
      let foundClosingFence = false;

      while (i < lines.length) {
        const currentLine = lines[i];

        // Found closing fence
        if (currentLine.match(/^```\s*$/)) {
          foundClosingFence = true;
          updatedLines.push(currentLine);
          i++;
          break;
        }

        // Found end marker without closing fence
        if (currentLine.match(/<!--\s*\/snippet\s*-->/)) {
          // Add closing fence ourselves
          updatedLines.push("```");
          // Don't increment i, we'll process the end marker in next iteration
          foundClosingFence = true;
          break;
        }

        // Skip old snippet content
        i++;
        changed = true;
      }

      if (!foundClosingFence) {
        throw new Error(
          `No closing fence found for snippet "${snippetName}" in ${filePath}`
        );
      }

      snippetsUpdated.push(snippetName);
      changed = true;
      continue;
    }

    // Regular line, keep it
    updatedLines.push(line);
    i++;
  }

  if (changed) {
    await fs.writeFile(filePath, updatedLines.join("\n"));
  }

  return {
    filePath,
    updated: changed,
    snippetsUpdated,
  };
}
