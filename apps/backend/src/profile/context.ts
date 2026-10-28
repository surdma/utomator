import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Parse the backend-owned account context as data, without evaluating TypeScript.
// This deliberately evaluates only literal AST nodes, never executable TypeScript.
type ContextValue = string | number | boolean | null | ContextValue[] | { [key: string]: ContextValue };
function literal(node: ts.Expression): ContextValue | undefined {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return literal(node.expression);
  }
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) {
    const entries = node.elements.map((item) => literal(item as ts.Expression));
    return entries.filter((item): item is ContextValue => item !== undefined);
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out: { [key: string]: ContextValue } = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name;
      if (!ts.isIdentifier(name) && !ts.isStringLiteralLike(name)) continue;
      const value = literal(property.initializer);
      if (value !== undefined) out[name.text] = value;
    }
    return out;
  }
  return undefined;
}

async function collect(file: string, names: readonly string[]): Promise<Record<string, ContextValue>> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../context/source');
  const source = await readFile(resolve(root, file), 'utf8');
  const document = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const result: Record<string, ContextValue> = {};
  for (const statement of document.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      if (!names.includes(declaration.name.text)) continue;
      const parsed = literal(declaration.initializer);
      if (parsed !== undefined) result[declaration.name.text] = parsed;
    }
  }
  for (const name of names) {
    if (!(name in result)) throw new Error('Owner context missing declaration: ' + file + ':' + name);
  }
  return result;
}

export async function loadOwnerContext() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../context/source');
  const [portfolio, resume, about, roles, photo, provenance, claims, linkedinGuidance] = await Promise.all([
    collect('portfolio-data.ts', ['siteConfig', 'socialLinks', 'projects', 'experiences', 'education']),
    collect('resume-data.ts', [
      'resumeProfile', 'resumeContacts', 'resumeSummary', 'resumeEducation',
      'resumeExperience', 'resumeSelectedWork', 'resumeSkills', 'resumeCourses',
    ]),
    collect('about-evidence.ts', ['technologyGroups']),
    collect('about-profile.ts', ['professionalRoles', 'strengths']),
    collect('profile-image.ts', ['profileImage']),
    readFile(resolve(root, 'portfolio-evidence.md'), 'utf8'),
    readFile(resolve(root, 'about-evidence.md'), 'utf8'),
    readFile(resolve(root, 'linkedin-profile-optimization.md'), 'utf8'),
  ]);
  return {
    source: 'apps/backend/context/source', sourceFiles: [
      'portfolio-data.ts', 'resume-data.ts', 'about-evidence.ts',
      'about-profile.ts', 'profile-image.ts', 'portfolio-evidence.md',
      'about-evidence.md', 'linkedin-profile-optimization.md',
    ],
    portfolio, resume, about, roles, photo,
    evidence: { portfolio: provenance, about: claims, linkedin: linkedinGuidance },
  };
}
