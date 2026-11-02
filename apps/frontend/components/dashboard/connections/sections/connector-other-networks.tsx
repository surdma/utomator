'use client';

import { providerMeta, type ProviderKey } from '../provider-meta';

export default function ConnectorOtherNetworks({
  network,
  showOtherNetworks,
  setShowOtherNetworks,
  setNetwork,
  setSelected,
  setConfirming,
  setError,
  setMessage,
}: {
  network: ProviderKey;
  showOtherNetworks: boolean;
  setShowOtherNetworks: (value: boolean | ((v: boolean) => boolean)) => void;
  setNetwork: (key: ProviderKey) => void;
  setSelected: (id: string | null) => void;
  setConfirming: (value: boolean) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
}) {
  return (
    <section
      aria-label="Additional social networks"
      className="rounded-xl border border-slate-200"
    >
      <button
        type="button"
        aria-expanded={showOtherNetworks}
        aria-controls="other-network-options"
        onClick={() => setShowOtherNetworks((value) => !value)}
        className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-4 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
      >
        <span>Other networks</span>
        <span className="text-xs font-normal text-slate-500">Coming soon</span>
      </button>
      <div
        id="other-network-options"
        className={
          showOtherNetworks
            ? 'grid grid-cols-1 gap-2 border-t border-slate-200 p-2 sm:grid-cols-3'
            : 'hidden'
        }
      >
        {(['instagram', 'github', 'devto'] as const).map((key) => {
          const Icon = providerMeta[key].icon;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={network === key}
              onClick={() => {
                setNetwork(key);
                setSelected(null);
                setConfirming(false);
                setError('');
                setMessage('');
              }}
              className={
                'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 ' +
                (network === key
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
              }
            >
              <Icon className="size-5! shrink-0" aria-hidden="true" />
              <span>{providerMeta[key].name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
