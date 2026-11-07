'use client';

const aims = [
  {
    name: 'Growth',
    detail:
      'The profile workflow is a Runner program of connected audit pipelines. Each pipeline records one part of the profile. A proposed edit stays a proposal until the owner approves a supported change.',
  },
  {
    name: 'Presence',
    detail:
      'The branding workflow is one Runner pipeline. It records the positioning that is already visible. Authority and a finished brand stay outside that read.',
  },
  {
    name: 'Visibility',
    detail:
      'Content, engagement, and network workflows use the same pipeline shape. They are owner-operated plans until a registered Runner action exists, so they do not claim reach.',
  },
] as const;

export default function WorkspaceModel() {
  return (
    <section
      aria-label="How a workflow is built"
      className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5"
    >
      <p className="text-xs font-bold tracking-widest text-teal-800 uppercase">
        Workspace
      </p>
      <h2 className="mt-1 text-base font-semibold text-slate-950">
        A workflow is one Runner program
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Pipelines inside it are connected nodes. Open a pipeline to see the
        tasks, steps, actions, and events that carry one part of the goal. Every
        Growth YAML file uses this shape, so a new aim grows by adding pipelines
        and registered Runner tasks.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {aims.map((aim) => (
          <li key={aim.name} className="rounded-xl bg-slate-50 px-3 py-3">
            <p className="text-sm font-semibold text-slate-950">{aim.name}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {aim.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
