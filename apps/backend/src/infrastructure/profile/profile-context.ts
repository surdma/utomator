import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Read the actual portfolio declarations rather than copying biography text.
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
  const root = fileURLToPath(new URL('../../../data/seed-profile/', import.meta.url));
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
    if (!(name in result))
      throw new Error('Portfolio context missing declaration: ' + file + ':' + name);
  }
  return result;
}

export async function loadOwnerContext() {
  const root = fileURLToPath(new URL('../../../data/seed-profile/', import.meta.url));
  const [portfolio, resume, about, roles, photo, provenance, claims, linkedinGuidance] =
    await Promise.all([
      collect('lib/data.ts', ['siteConfig', 'socialLinks', 'projects', 'experiences', 'education']),
      collect('lib/resume-data.ts', [
        'resumeProfile',
        'resumeContacts',
        'resumeSummary',
        'resumeEducation',
        'resumeExperience',
        'resumeSelectedWork',
        'resumeSkills',
        'resumeCourses',
      ]),
      collect('lib/about-evidence.ts', ['technologyGroups']),
      collect('lib/about-profile.ts', ['professionalRoles', 'strengths']),
      collect('lib/profile-image.ts', ['profileImage']),
      readFile(resolve(root, 'docs/portfolio-evidence.md'), 'utf8'),
      readFile(resolve(root, 'docs/about-evidence.md'), 'utf8'),
      readFile(resolve(root, 'docs/linkedin-profile-optimization.md'), 'utf8'),
    ]);
  return {
    source: 'apps/backend/data/seed-profile',
    sourceFiles: [
      'lib/data.ts',
      'lib/resume-data.ts',
      'lib/about-evidence.ts',
      'lib/about-profile.ts',
      'lib/profile-image.ts',
      'docs/portfolio-evidence.md',
      'docs/about-evidence.md',
      'docs/linkedin-profile-optimization.md',
    ],
    portfolio,
    resume,
    about,
    roles,
    photo,
    evidence: {
      portfolio: provenance,
      about: claims,
      linkedin: linkedinGuidance,
    },
  };
}
