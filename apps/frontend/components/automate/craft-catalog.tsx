"use client";

import type { ChangeEvent } from "react";
import { ArrowUpFromLine, BookOpen, FolderOpen, GitBranch, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/automate-card";
import StudioDialog from "@/components/ui/studio-dialog";
import type { Category, Craft } from "./crafts-library";

export const craftCategoryTitles:Record<Category,string> = {
  presence:"Personal presence",portfolio:"Portfolio","job-hunt":"Job hunting",
  applications:"Applications",content:"Content studio",engagement:"Social engagement",
};

type Props = {
  crafts:Craft[];
  filter:Category|"all";
  onFilter:(value:Category|"all")=>void;
  search:string;
  onSearch:(value:string)=>void;
  creating:boolean;
  onToggleCreate:()=>void;
  newName:string;
  onNameChange:(value:string)=>void;
  newCategory:Category;
  onCategoryChange:(value:Category)=>void;
  busy:boolean;
  error?:string;
  onCreate:()=>void;
  onImport:(event:ChangeEvent<HTMLInputElement>)=>void;
  onOpen:(id:string,slug:string)=>void;
};

export default function CraftCatalog({
  crafts,filter,onFilter,search,onSearch,creating,onToggleCreate,newName,onNameChange,
  newCategory,onCategoryChange,busy,error,onCreate,onImport,onOpen,
}:Props){
  return <div data-testid="crafts-catalogue" className="flex min-w-0 flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-950 p-3 text-white"><BookOpen className="size-5" /></div>
        <div><h2 className="text-base font-extrabold tracking-tight">Explore your crafts</h2>
          <p className="mt-1 text-xs text-slate-500">Reusable MDX workflows. Shared defaults cannot be edited; clone one to customize it.</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
          <ArrowUpFromLine className="size-4" />Import<input className="sr-only" aria-label="Import craft" type="file" accept=".mdx,.skill,.zip" onChange={onImport} />
        </label>
        <Button variant="primary" onClick={onToggleCreate}><Plus className="size-4" />New craft</Button>
      </div>
    </div>
    <StudioDialog open={creating} onDismiss={onToggleCreate} title="Create craft"
      description="Name the project and choose its category. You can build its graph after creating it."
      testId="create-craft-dialog">
      <form onSubmit={(event)=>{event.preventDefault();onCreate();}} className="flex flex-col gap-4">
        <label className="text-xs font-bold">Craft project title
          <input autoFocus required aria-label="New craft name" className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            value={newName} onChange={e=>onNameChange(e.target.value)} placeholder="e.g. Thought leadership posts" />
        </label>
        <label className="text-xs font-bold">Category
          <select aria-label="New craft category" value={newCategory} onChange={e=>onCategoryChange(e.target.value as Category)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">
            {Object.entries(craftCategoryTitles).map(([key,value])=><option key={key} value={key}>{value}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" onClick={onToggleCreate}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!newName.trim()||busy}>{busy?"Creating…":"Create project"}</Button>
        </div>
      </form>
    </StudioDialog>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(["all",...Object.keys(craftCategoryTitles)] as Array<Category|"all">).map(option=><button key={option} type="button"
          aria-pressed={filter===option}
          className={"min-h-9 rounded-lg px-3 text-xs font-semibold "+(filter===option?"bg-slate-950 text-white":"border border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}
          onClick={()=>onFilter(option)}>{option==="all"?"All projects":craftCategoryTitles[option]}</button>)}
      </div>
      <div className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="size-4 text-slate-400" />
        <input aria-label="Search crafts" className="w-44 bg-transparent text-xs outline-none sm:w-56" placeholder="Search crafts" value={search} onChange={event=>onSearch(event.target.value)}/></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {crafts.map(craft=><button type="button" key={craft.id} data-testid={"craft-card-"+craft.slug} onClick={()=>onOpen(craft.id,craft.slug)}
        className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-teal-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-teal-600">
        <div className="flex items-center justify-between gap-2"><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{craftCategoryTitles[craft.category]}</span>
          <span className={"text-[10px] font-semibold "+(craft.enabled?"text-emerald-700":"text-slate-500")}>{craft.enabled?"Enabled":"Disabled"}</span></div>
        <h3 className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-900"><FolderOpen className="size-4 text-teal-700" />{craft.name}</h3>
        <p className="mt-2 line-clamp-3 min-h-15 text-xs leading-5 text-slate-500">{craft.description}</p>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-500">
          <span><GitBranch className="mr-1 inline size-3.5" />{craft.steps.length} steps · {craft.links.length} links</span>
          <span>{craft.scope==="default"?"Shared default":"My craft"} · v{craft.version}</span>
        </div>
      </button>)}
      {crafts.length===0&&<p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No matching crafts. Create or import your own.</p>}
    </div>
  </div>;
}
