import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

export type SkillCategory = 'presence' | 'portfolio' | 'job-hunt' | 'applications' | 'content' | 'engagement';
export type SkillKind = 'brief' | 'research' | 'draft' | 'review' | 'publish' | 'measure';
export type SkillStep = {
  id: string; kind: SkillKind; title: string; body: string; position: { x: number; y: number };
};
export type SkillLink = { id: string; source: string; target: string };
export type SkillProject = {
  id: string; slug: string; name: string; description: string; category: SkillCategory;
  enabled: boolean; version: number; updatedAt: string; steps: SkillStep[]; links: SkillLink[];
};
export type SkillInput = Omit<SkillProject, 'id' | 'version' | 'updatedAt'>;
const directory = resolve(process.cwd(), '.runtime', 'skills');
const path = resolve(directory, 'library.json');
const categories = new Set<SkillCategory>(['presence','portfolio','job-hunt','applications','content','engagement']);
const kinds = new Set<SkillKind>(['brief','research','draft','review','publish','measure']);
const slugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const nodePattern = /^[a-z][a-z0-9-]{0,59}$/;
const max = (s: unknown, n: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= n;
const quote = (s: string) => JSON.stringify(s);
const unquote = (s: string): string => {
  const value: unknown = JSON.parse(s);
  if (typeof value !== 'string') throw Error('Frontmatter fields must be strings');
  return value;
};
function graphValid(input: unknown): asserts input is SkillInput {
  if (!input || typeof input !== 'object') throw Error('Expected skill project');
  const skill = input as SkillInput;
  if (!max(skill.slug, 65) || !slugPattern.test(skill.slug) ||
      /(?:^|-)(?:claude|anthropic)(?:-|$)/.test(skill.slug) ||
      !max(skill.name, 100) || /[\r\n]/.test(skill.name) ||
      !max(skill.description, 1023) || /[<>]/.test(skill.description) ||
      !skill.description.toLowerCase().includes('use when') ||
      !categories.has(skill.category) || typeof skill.enabled !== 'boolean' ||
      !Array.isArray(skill.steps) || skill.steps.length < 1 || skill.steps.length > 40 ||
      !Array.isArray(skill.links) || skill.links.length > 100)
    throw Error('Skill requires a kebab-case slug, explicit trigger description, category and steps');
  const ids = new Set<string>();
  for (const step of skill.steps) {
    if (!step || !nodePattern.test(step.id) || ids.has(step.id) || !kinds.has(step.kind) ||
        !max(step.title, 100) || /[\r\n|]/.test(step.title) ||
        typeof step.body !== 'string' || step.body.length > 8000 ||
        /^## Step: |^\*\*Next:\*\* /m.test(step.body) ||
        !step.position || !Number.isFinite(step.position.x) || !Number.isFinite(step.position.y) ||
        Math.abs(step.position.x) > 10000 || Math.abs(step.position.y) > 10000)
      throw Error('Invalid, duplicated or oversized skill step');
    ids.add(step.id);
  }
  const links = new Set<string>();
  const adjacent = new Map<string,string[]>();
  for (const link of skill.links) {
    if (!link || !ids.has(link.source) || !ids.has(link.target) || link.source === link.target ||
        link.id !== link.source + '-to-' + link.target || links.has(link.id))
      throw Error('Connections must join distinct existing steps without duplicates');
    links.add(link.id);
    adjacent.set(link.source, [...(adjacent.get(link.source) || []), link.target]);
  }
  // Dependency order is intentional: reject cycles instead of exporting an
  // ambiguous skill that an agent could endlessly re-enter.
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw Error('Skill connections cannot contain a cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of adjacent.get(id) || []) visit(target);
    visiting.delete(id); visited.add(id);
  };
  for (const id of ids) visit(id);
}
function asInput(value: SkillProject): SkillInput {
  return {
    slug: value.slug, name: value.name, description: value.description,
    category: value.category, enabled: value.enabled,
    steps: value.steps, links: value.links,
  };
}
export function toMdx(skill: SkillProject | SkillInput): string {
  graphValid(skill);
  const lines = ['---', 'name: ' + skill.slug, 'description: ' + quote(skill.description),
    '---', '', '# ' + skill.name, ''];
  for (const step of skill.steps) {
    lines.push('## Step: ' + step.id + ' | ' + step.title,
      '<a id="step-' + step.id + '" />',
      '<SkillNode kind=' + quote(step.kind) + ' x={' + step.position.x +
      '} y={' + step.position.y + '} />', '', step.body.trim(), '',
      '**Next:** ' + (skill.links.filter(l => l.source === step.id).map(l =>
        '[' + l.target + '](#step-' + l.target + ')').join(', ') || 'End'), '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
export function parseMdx(source: string, previous?: SkillProject): SkillInput {
  if (typeof source !== 'string' || source.length > 100000) throw Error('MDX source exceeds limit');
  const match = source.match(/^---\r?\nname: ([a-z][a-z0-9-]*)\r?\ndescription: (.+)\r?\n---\r?\n\r?\n# ([^\r\n]+)\r?\n\r?\n/);
  if (!match) throw Error('Expected name and JSON-quoted description in MDX frontmatter');
  const slug = match[1]!;
  const description = unquote(match[2]!);
  const name = match[3]!;
  const rest = source.slice(match[0].length);
  const parts = rest.split(/^## Step: /m);
  if (parts.length < 2 || parts[0]!.trim()) throw Error('Expected one or more Step sections');
  const steps: SkillStep[] = [], links: SkillLink[] = [];
  for (const part of parts.slice(1)) {
    const block = part.match(/^([a-z][a-z0-9-]*) \| ([^\r\n]+)\r?\n<a id="step-\1" \/>\r?\n<SkillNode kind="(brief|research|draft|review|publish|measure)" x=\{(-?\d+(?:\.\d+)?)\} y=\{(-?\d+(?:\.\d+)?)\} \/>\r?\n\r?\n([\s\S]*?)\r?\n\r?\n\*\*Next:\*\* ([^\r\n]+)\s*$/);
    if (!block) throw Error('Invalid MDX node: each section needs SkillNode and Next');
    const [, id, title, kind, x, y, body, next] = block;
    steps.push({ id: id!, title: title!, kind: kind! as SkillKind, body: body!,
      position: { x: Number(x), y: Number(y) } });
    if (next !== 'End') for (const item of next!.split(', ')) {
      const target = item.match(/^\[([a-z][a-z0-9-]*)\]\(#step-\1\)$/);
      if (!target) throw Error('Next links must point to valid Step IDs');
      links.push({ id: id + '-to-' + target[1], source: id!, target: target[1]! });
    }
  }
  const input: SkillInput = { slug, name, description,
    category: previous?.category || 'content', enabled: previous?.enabled ?? true, steps, links };
  graphValid(input); return input;
}
export function toAgentMarkdown(skill: SkillProject): string {
  graphValid(skill);
  // Convert to plain markdown; SKILL.md is the portable agent entry point.
  return ['---', 'name: ' + skill.slug, 'description: ' + quote(skill.description),
    '---', '', '# ' + skill.name, '',
    'Follow the steps according to the connected dependencies. Ask for owner review before any publication.',
    '', ...skill.steps.flatMap(step => [
      '## ' + step.id + ' - ' + step.title, '', step.body.trim(), '',
      'Next: ' + (skill.links.filter(l=>l.source===step.id).map(l=>l.target).join(', ') || 'Finish'),
      '',
    ])].join('\n');
}
// The .skill format here is a ZIP archive: the standard agent filename
// SKILL.md remains present, alongside source SKILL.mdx and graph metadata.
// The .skill extension is Utomator's convention, not an Anthropic standard.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const b of data) crc = crcTable[(crc ^ b) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function skillArchive(skill: SkillProject): Buffer {
  const files = new Map([
    [skill.slug + '/SKILL.md', toAgentMarkdown(skill)],
    [skill.slug + '/SKILL.mdx', toMdx(skill)],
    [skill.slug + '/graph.json', JSON.stringify(asInput(skill), null, 2) + '\n'],
  ]);
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [fileName, content] of files) {
    const name = Buffer.from(fileName), body = Buffer.from(content);
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4);
    local.writeUInt32LE(crc,14); local.writeUInt32LE(body.length,18);
    local.writeUInt32LE(body.length,22); local.writeUInt16LE(name.length,26);
    locals.push(local,name,body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4); central.writeUInt16LE(20,6);
    central.writeUInt32LE(crc,16); central.writeUInt32LE(body.length,20);
    central.writeUInt32LE(body.length,24); central.writeUInt16LE(name.length,28);
    central.writeUInt32LE(offset,42);
    centrals.push(central,name);
    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((n,b)=>n+b.length,0);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50,0);
  footer.writeUInt16LE(files.size,8); footer.writeUInt16LE(files.size,10);
  footer.writeUInt32LE(centralSize,12); footer.writeUInt32LE(offset,16);
  return Buffer.concat([...locals, ...centrals, footer]);
}
const seed = [
  ['personal-brand-positioning','Personal brand positioning','presence',
    'Defines evidence-backed professional positioning. Use when refining a social bio, defining a personal brand or aligning professional accounts.'],
  ['portfolio-proofing','Portfolio case-study proofing','portfolio',
    'Turns verified projects into attributable case studies. Use when revising a portfolio, project description or personal website.'],
  ['job-search-research','Job opportunity research','job-hunt',
    'Reviews role requirements and fit without inventing credentials. Use when searching for jobs, prioritizing roles or researching employers.'],
  ['application-tailoring','Tailored application drafting','applications',
    'Maps documented career evidence to a specific role. Use when drafting an application, tailoring a resume or writing a cover letter.'],
  ['content-series-planning','Content series planning','content',
    'Plans social content series with factual review gates. Use when brainstorming posts, building a content calendar or drafting social writing.'],
  ['thoughtful-social-engagement','Thoughtful social engagement','engagement',
    'Crafts authentic comments and conversation replies. Use when preparing X posts, replying thoughtfully or planning social engagement.'],
] as const;
function template(slug: string, name: string, category: SkillCategory, description: string): SkillProject {
  const now = new Date().toISOString();
  const steps: SkillStep[] = [
    { id:'goal',kind:'brief',title:'Define the objective',body:'Identify the audience, requested outcome, platform, constraints and source of truth.',position:{x:70,y:140} },
    { id:'evidence',kind:'research',title:'Gather verified evidence',body:'Review portfolio facts, current page or job description. Mark missing facts as unknown, never invent them.',position:{x:390,y:140} },
    { id:'craft',kind:'draft',title:'Craft the deliverable',body:'Draft concise, specific writing that fits the audience and platform. Preserve source attribution.',position:{x:710,y:140} },
    { id:'review',kind:'review',title:'Review and refine',body:'Check accuracy, originality, tone, platform rules, and whether the owner approves any publishing.',position:{x:1030,y:140} },
  ];
  return { id: randomUUID(),slug,name,description,category,enabled:true,version:1,updatedAt:now,steps,
    links:steps.slice(1).map((step,i)=>({source:steps[i]!.id,target:step.id,id:steps[i]!.id+'-to-'+step.id})) };
}
export class SkillLibrary {
  private queue: Promise<unknown> = Promise.resolve();
  private serialized<T>(fn:()=>Promise<T>): Promise<T> {
    const work=this.queue.then(fn); this.queue=work.catch(()=>undefined); return work;
  }
  private async read(): Promise<SkillProject[]> {
    try { const json: unknown = JSON.parse(await readFile(path,'utf8')); return Array.isArray(json)?json as SkillProject[]:[]; }
    catch(e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const initial = seed.map(row=>template(row[0],row[1],row[2],row[3]));
        try { await writeFile(path, JSON.stringify(initial, null, 2), { flag: 'wx', mode: 0o600 }); }
        catch (createError) { if ((createError as NodeJS.ErrnoException).code !== 'EEXIST') throw createError; }
        return JSON.parse(await readFile(path,'utf8')) as SkillProject[];
      }
      throw e;
    }
  }
  private async save(skills:SkillProject[]) {
    await mkdir(directory,{recursive:true,mode:0o700});
    const tmp=path+'.'+randomUUID();
    await writeFile(tmp,JSON.stringify(skills,null,2),{mode:0o600});
    await rename(tmp,path);
  }
  async list() {return this.read();}
  async get(id:string) {return (await this.read()).find(s=>s.id===id);}
  async create(input:unknown):Promise<SkillProject> {
    graphValid(input);
    return this.serialized(async()=>{
      const skills=await this.read();
      if(skills.length>=100||skills.some(s=>s.slug===input.slug))throw Error('Duplicate skill name or library is full');
      const skill:SkillProject={...input,id:randomUUID(),version:1,updatedAt:new Date().toISOString()};
      await this.save([...skills,skill]);return skill;
    });
  }
  async update(id:string,input:unknown,expectedVersion:number):Promise<SkillProject> {
    graphValid(input);
    return this.serialized(async()=>{
      const skills=await this.read();const index=skills.findIndex(s=>s.id===id);
      if(index<0)throw Error('Skill not found');
      if(skills[index]!.version!==expectedVersion)throw Error('Version conflict; reload before saving');
      if(skills.some(s=>s.id!==id&&s.slug===input.slug))throw Error('Skill slug already exists');
      const updated:SkillProject={...input,id,version:expectedVersion+1,updatedAt:new Date().toISOString()};
      skills[index]=updated;await this.save(skills);return updated;
    });
  }
  async remove(id:string,expectedVersion:number) {
    return this.serialized(async()=>{
      const skills=await this.read();const item=skills.find(s=>s.id===id);
      if(!item)throw Error('Skill not found');
      if(item.version!==expectedVersion)throw Error('Version conflict; reload before deleting');
      await this.save(skills.filter(s=>s.id!==id));return {deleted:true};
    });
  }
}
