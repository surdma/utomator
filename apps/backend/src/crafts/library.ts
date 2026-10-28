import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {DocumentStore, DocumentRecord} from '../db/documents.js';

export type CraftCategory = 'presence' | 'portfolio' | 'job-hunt' | 'applications' | 'content' | 'engagement';
export type CraftKind = 'brief' | 'research' | 'draft' | 'review' | 'publish' | 'measure';
export type CraftStep = {
  id: string; kind: CraftKind; title: string; body: string; position: { x: number; y: number };
};
export type CraftLink = { id: string; source: string; target: string };
export type CraftProject = {
  id: string; slug: string; name: string; description: string; category: CraftCategory;
  enabled: boolean; version: number; updatedAt: string; steps: CraftStep[]; links: CraftLink[];
};
export type CraftInput = Omit<CraftProject, 'id' | 'version' | 'updatedAt'>;
const categories = new Set<CraftCategory>(['presence','portfolio','job-hunt','applications','content','engagement']);
const kinds = new Set<CraftKind>(['brief','research','draft','review','publish','measure']);
const slugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const nodePattern = /^[a-z][a-z0-9-]{0,59}$/;
const max = (s: unknown, n: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= n;
const quote = (s: string) => JSON.stringify(s);
const unquote = (s: string): string => {
  const value: unknown = JSON.parse(s);
  if (typeof value !== 'string') throw Error('Frontmatter fields must be strings');
  return value;
};
function graphValid(input: unknown): asserts input is CraftInput {
  if (!input || typeof input !== 'object') throw Error('Expected craft');
  const skill = input as CraftInput;
  if (!max(skill.slug, 65) || !slugPattern.test(skill.slug) ||
      /(?:^|-)(?:claude|anthropic)(?:-|$)/.test(skill.slug) ||
      !max(skill.name, 100) || /[\r\n]/.test(skill.name) ||
      !max(skill.description, 1023) || /[<>]/.test(skill.description) ||
      !skill.description.toLowerCase().includes('use when') ||
      !categories.has(skill.category) || typeof skill.enabled !== 'boolean' ||
      !Array.isArray(skill.steps) || skill.steps.length < 1 || skill.steps.length > 40 ||
      !Array.isArray(skill.links) || skill.links.length > 100)
    throw Error('Craft requires a kebab-case slug, explicit trigger description, category and steps');
  const ids = new Set<string>();
  for (const step of skill.steps) {
    if (!step || !nodePattern.test(step.id) || ids.has(step.id) || !kinds.has(step.kind) ||
        !max(step.title, 100) || /[\r\n|]/.test(step.title) ||
        typeof step.body !== 'string' || step.body.length > 8000 ||
        /^## Step: |^\*\*Next:\*\* /m.test(step.body) ||
        !step.position || !Number.isFinite(step.position.x) || !Number.isFinite(step.position.y) ||
        Math.abs(step.position.x) > 10000 || Math.abs(step.position.y) > 10000)
      throw Error('Invalid, duplicated or oversized craft step');
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
    if (visiting.has(id)) throw Error('Craft connections cannot contain a cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of adjacent.get(id) || []) visit(target);
    visiting.delete(id); visited.add(id);
  };
  for (const id of ids) visit(id);
}
function asInput(value: CraftProject): CraftInput {
  return {
    slug: value.slug, name: value.name, description: value.description,
    category: value.category, enabled: value.enabled,
    steps: value.steps, links: value.links,
  };
}
export function toMdx(skill: CraftProject | CraftInput): string {
  graphValid(skill);
  const lines = ['---', 'name: ' + skill.slug, 'description: ' + quote(skill.description),
    'category: ' + skill.category, 'enabled: ' + String(skill.enabled),
    '---', '', '# ' + skill.name, ''];
  for (const step of skill.steps) {
    lines.push('## Step: ' + step.id + ' | ' + step.title,
      '<a id="step-' + step.id + '" />',
      '<CraftNode kind=' + quote(step.kind) + ' x={' + step.position.x +
      '} y={' + step.position.y + '} />', '', step.body.trim(), '',
      '**Next:** ' + (skill.links.filter(l => l.source === step.id).map(l =>
        '[' + l.target + '](#step-' + l.target + ')').join(', ') || 'End'), '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
export function parseMdx(source: string, previous?: CraftProject): CraftInput {
  if (typeof source !== 'string' || source.length > 100000) throw Error('MDX source exceeds limit');
  const match = source.match(/^---\r?\nname: ([a-z][a-z0-9-]*)\r?\ndescription: (.+)\r?\n(?:category: (presence|portfolio|job-hunt|applications|content|engagement)\r?\n)?(?:enabled: (true|false)\r?\n)?---\r?\n\r?\n# ([^\r\n]+)\r?\n\r?\n/);
  if (!match) throw Error('Expected name and JSON-quoted description in MDX frontmatter');
  const slug = match[1]!;
  const description = unquote(match[2]!);
  const name = match[5]!;
  const rest = source.slice(match[0].length);
  const parts = rest.split(/^## Step: /m);
  if (parts.length < 2 || parts[0]!.trim()) throw Error('Expected one or more Step sections');
  const steps: CraftStep[] = [], links: CraftLink[] = [];
  for (const part of parts.slice(1)) {
    const block = part.match(/^([a-z][a-z0-9-]*) \| ([^\r\n]+)\r?\n<a id="step-\1" \/>\r?\n<(?:CraftNode|SkillNode) kind="(brief|research|draft|review|publish|measure)" x=\{(-?\d+(?:\.\d+)?)\} y=\{(-?\d+(?:\.\d+)?)\} \/>\r?\n\r?\n([\s\S]*?)\r?\n\r?\n\*\*Next:\*\* ([^\r\n]+)\s*$/);
    if (!block) throw Error('Invalid MDX node: each section needs CraftNode and Next');
    const [, id, title, kind, x, y, body, next] = block;
    steps.push({ id: id!, title: title!, kind: kind! as CraftKind, body: body!,
      position: { x: Number(x), y: Number(y) } });
    if (next !== 'End') for (const item of next!.split(', ')) {
      const target = item.match(/^\[([a-z][a-z0-9-]*)\]\(#step-\1\)$/);
      if (!target) throw Error('Next links must point to valid Step IDs');
      links.push({ id: id + '-to-' + target[1], source: id!, target: target[1]! });
    }
  }
  const input: CraftInput = { slug, name, description,
    category: (match[3] as CraftCategory|undefined) || previous?.category || 'content',
    enabled: match[4]===undefined ? (previous?.enabled ?? true) : match[4]==='true', steps, links };
  graphValid(input); return input;
}
export function toAgentMarkdown(skill: CraftProject): string {
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
export function craftArchive(skill: CraftProject): Buffer {
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

export type CraftScope = 'default' | 'personal';
export type Craft = CraftProject & {scope:CraftScope;sourceCraftId?:string};
type StoredCraft = {scope:CraftScope;mdx:string;sourceCraftId?:string;updatedAt:string};
const defaults: Array<{slug:string;category:CraftCategory}> = [
  {slug:'personal-brand-positioning',category:'presence'},
  {slug:'portfolio-proofing',category:'portfolio'},
  {slug:'job-search-research',category:'job-hunt'},
  {slug:'application-tailoring',category:'applications'},
  {slug:'content-series-planning',category:'content'},
  {slug:'thoughtful-social-engagement',category:'engagement'},
  {slug:'growth-profile',category:'presence'},
  {slug:'growth-competitors',category:'content'},
  {slug:'growth-content',category:'content'},
  {slug:'growth-engagement',category:'engagement'},
  {slug:'growth-network',category:'engagement'},
  {slug:'growth-company',category:'presence'},
  {slug:'growth-branding',category:'presence'},
  {slug:'growth-jobs',category:'job-hunt'},
  {slug:'growth-outreach',category:'engagement'},
  {slug:'growth-leads',category:'engagement'},
  {slug:'growth-longform',category:'content'},
  {slug:'growth-analytics',category:'content'},
  {slug:'growth-reputation',category:'presence'},
  {slug:'growth-experiments',category:'content'},
  {slug:'growth-reporting',category:'presence'},
];
const defaultKey=(slug:string)=>'default-'+slug;
const personalKey=(slug:string)=>'personal-'+slug;
const docsNamespace='crafts';
const migrationNamespace='craft-migrations';

export class CraftLibrary {
  constructor(
    private readonly legacyFile=resolve(process.cwd(),'.runtime','skills','library.json'),
    private readonly defaultRoot=resolve(dirname(fileURLToPath(import.meta.url)), '../../crafts/default'),
  ){}
  private documents:DocumentStore|undefined;
  setDocuments(documents:DocumentStore) {this.documents=documents;}
  private store():DocumentStore {
    if(!this.documents)throw Error('Craft database is unavailable');
    return this.documents;
  }
  private materialize(row:DocumentRecord<StoredCraft>):Craft {
    if(!row.value || !['default','personal'].includes(row.value.scope) ||
        typeof row.value.mdx!=='string')throw Error('Corrupt craft database record');
    const input=parseMdx(row.value.mdx);
    graphValid(input);
    return {...input,id:row.key,version:row.version,updatedAt:row.value.updatedAt,
      scope:row.value.scope,...(row.value.sourceCraftId?{sourceCraftId:row.value.sourceCraftId}:{})};
  }
  async initialize() {
    const docs=this.store();
    // Immutable MDX templates are imported into each tenant's real database.
    // A release may update a default without touching any personal variation.
    for(const item of defaults) {
      const source=await readFile(resolve(this.defaultRoot,item.slug+'.mdx'),'utf8');
      const input={...parseMdx(source),category:item.category,enabled:true};
      graphValid(input);
      const mdx=toMdx(input);
      const key=defaultKey(item.slug);
      const existing=await docs.get<StoredCraft>(docsNamespace,key);
      if(existing?.value.scope==='personal')throw Error('Default craft identity collision');
      if(!existing || existing.value.mdx!==mdx) {
        const value:StoredCraft={scope:'default',mdx,updatedAt:new Date().toISOString()};
        await docs.put(docsNamespace,key,value,existing?.version??0);
      }
    }
    // The historical single-user JSON library is imported once for local mode
    // only. Hosted accounts never read another user's legacy local files.
    if(!process.env.UTOMATOR_INTERNAL_OWNER_ID)await this.importLegacy();
  }
  private async importLegacy() {
    const docs=this.store();
    if(await docs.get(migrationNamespace,'legacy-json-v1'))return;
    let legacy:unknown;
    try {legacy=JSON.parse(await readFile(this.legacyFile,'utf8'));}
    catch(error) {
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
      await docs.put(migrationNamespace,'legacy-json-v1',{result:'no-source'},0);
      return;
    }
    if(!Array.isArray(legacy))throw Error('Legacy craft source is not an array');
    for(const old of legacy) {
      if(!old || typeof old!=='object')throw Error('Invalid legacy craft entry');
      const item=old as CraftProject;
      const input=asInput(item);
      graphValid(input);
      const base=defaults.find(entry=>entry.slug===input.slug);
      if(base) {
        const current=await this.get(defaultKey(base.slug));
        if(current && toMdx(current)===toMdx(input))continue;
      }
      const candidate=base?input.slug+'-imported':input.slug;
      let slug=candidate, suffix=2;
      while((await this.list()).some(c=>c.slug===slug))slug=candidate+'-'+suffix++;
      if(slug.length>65)throw Error('Legacy craft slug exceeds allowed length');
      await this.create({...input,slug,name:base?input.name+' (imported)':input.name},
        base?defaultKey(base.slug):undefined);
    }
    await docs.put(migrationNamespace,'legacy-json-v1',{result:'imported',count:legacy.length},0);
  }
  async list():Promise<Craft[]> {
    const records=await this.store().list<StoredCraft>(docsNamespace);
    return records.map(row=>this.materialize(row)).sort((a,b)=>
      (a.scope===b.scope?a.name.localeCompare(b.name):a.scope==='default'?-1:1));
  }
  async get(id:string):Promise<Craft|undefined> {
    const row=await this.store().get<StoredCraft>(docsNamespace,id);
    return row?this.materialize(row):undefined;
  }
  async create(input:unknown,sourceCraftId?:string):Promise<Craft> {
    graphValid(input);
    const docs=this.store();
    if((await this.list()).some(c=>c.slug===input.slug))throw Error('Craft slug already exists');
    const key=personalKey(input.slug);
    const value:StoredCraft={scope:'personal',mdx:toMdx(input),updatedAt:new Date().toISOString(),...(sourceCraftId?{sourceCraftId}:{})};
    const version=await docs.put(docsNamespace,key,value,0);
    return this.materialize({key,version,value});
  }
  async clone(id:string):Promise<Craft> {
    const original=await this.get(id);
    if(!original)throw Error('Craft not found');
    const base=original.slug.replace(/(?:-copy(?:-[0-9]+)?)?$/,'');
    for(let i=1;i<=100;i++){
      const suffix=i===1?'-copy':'-copy-'+i;
      const slug=base.slice(0,65-suffix.length)+suffix;
      try {return await this.create({...asInput(original),slug,
        name:(original.name+' (copy)').slice(0,100)},original.id);}
      catch(error){
        if(error instanceof Error && (/slug already exists|database document changed/i.test(error.message)))
          continue;
        throw error;
      }
    }
    throw Error('Too many craft variations');
  }
  async update(id:string,input:unknown,expectedVersion:number):Promise<Craft> {
    graphValid(input);
    const docs=this.store();
    const record=await docs.get<StoredCraft>(docsNamespace,id);
    if(!record)throw Error('Craft not found');
    if(record.value.scope==='default')throw Error('Default crafts are read-only; clone to customize');
    if(record.version!==expectedVersion)throw Error('Version conflict; reload before saving');
    if(personalKey(input.slug)!==id)throw Error('Craft slug cannot be changed');
    const value:StoredCraft={...record.value,mdx:toMdx(input),updatedAt:new Date().toISOString()};
    const version=await docs.put(docsNamespace,id,value,expectedVersion);
    return this.materialize({key:id,version,value});
  }
  async remove(id:string,expectedVersion:number) {
    const docs=this.store();
    const record=await docs.get<StoredCraft>(docsNamespace,id);
    if(!record)throw Error('Craft not found');
    if(record.value.scope==='default')throw Error('Default crafts are read-only; clone to customize');
    if(record.version!==expectedVersion)throw Error('Version conflict; reload before deleting');
    await docs.remove(docsNamespace,id,expectedVersion);
    return {deleted:true};
  }
}
