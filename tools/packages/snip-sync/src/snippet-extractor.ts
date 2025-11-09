import * as fs from "node:fs/promises";
import * as path from "node:path";
import { globSync } from "glob";

export interface Snippet {
  name: string;
  content: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
}

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".js": "javascript",
  ".tsx": "typescript",
  ".jsx": "javascript",
  ".wesl": "wgsl",
  ".wgsl": "wgsl",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".c": "c",
  ".cpp": "cpp",
  ".java": "java",
};

export async function extractSnippets(
  sourceGlobs: string[],
  cwd: string = process.cwd()
): Promise<Map<string, Snippet>> {
  const snippets = new Map<string, Snippet>();

  for (const glob of sourceGlobs) {
    const files = globSync(glob, { cwd, absolute: true });

    for (const filePath of files) {
      const fileSnippets = await extractSnippetsFromFile(filePath);

      for (const snippet of fileSnippets) {
        if (snippets.has(snippet.name)) {
          const existing = snippets.get(snippet.name)!;
          throw new Error(
            `Duplicate snippet name "${snippet.name}" found in:\n` +
              `  1. ${existing.filePath}:${existing.startLine}\n` +
              `  2. ${snippet.filePath}:${snippet.startLine}`
          );
        }
        snippets.set(snippet.name, snippet);
      }
    }
  }

  return snippets;
}

async function extractSnippetsFromFile(filePath: string): Promise<Snippet[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const snippets: Snippet[] = [];
  const ext = path.extname(filePath);
  const language = LANGUAGE_MAP[ext] || ext.slice(1);

  let currentSnippet: {
    name: string;
    startLine: number;
    lines: string[];
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Look for snippet-start marker
    const startMatch = line.match(/snippet-start:\s*(\S+)/);
    if (startMatch) {
      if (currentSnippet) {
        throw new Error(
          `Nested snippet-start found at ${filePath}:${lineNumber} ` +
            `while already inside snippet "${currentSnippet.name}"`
        );
      }
      currentSnippet = {
        name: startMatch[1],
        startLine: lineNumber,
        lines: [],
      };
      continue;
    }

    // Look for snippet-end marker
    if (line.match(/snippet-end/)) {
      if (!currentSnippet) {
        throw new Error(
          `snippet-end without matching snippet-start at ${filePath}:${lineNumber}`
        );
      }

      // Remove common indentation
      const content = removeCommonIndentation(currentSnippet.lines);

      snippets.push({
        name: currentSnippet.name,
        content,
        filePath,
        language,
        startLine: currentSnippet.startLine,
        endLine: lineNumber,
      });

      currentSnippet = null;
      continue;
    }

    // Collect lines inside snippet
    if (currentSnippet) {
      currentSnippet.lines.push(line);
    }
  }

  if (currentSnippet) {
    throw new Error(
      `Unclosed snippet "${currentSnippet.name}" at ${filePath}:${currentSnippet.startLine}`
    );
  }

  return snippets;
}

function removeCommonIndentation(lines: string[]): string {
  if (lines.length === 0) return "";

  // Find minimum indentation (ignoring empty lines)
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const match = line.match(/^(\s*)/);
      return match ? match[1].length : 0;
    });

  if (indents.length === 0) return lines.join("\n");

  const minIndent = Math.min(...indents);

  // Remove common indentation
  const dedented = lines.map((line) =>
    line.length > minIndent ? line.slice(minIndent) : line
  );

  // Trim leading/trailing empty lines
  while (dedented.length > 0 && dedented[0].trim() === "") {
    dedented.shift();
  }
  while (dedented.length > 0 && dedented[dedented.length - 1].trim() === "") {
    dedented.pop();
  }

  return dedented.join("\n");
}
