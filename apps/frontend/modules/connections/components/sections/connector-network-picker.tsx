'use client';

import { type ProviderKey, providerMeta } from '../provider-meta';

export default function ConnectorNetworkPicker({
  network,
  setNetwork,
  setSelected,
  setConfirming,
  setError,
  setMessage,
}: {
  network: ProviderKey;
  setNetwork: (key: ProviderKey) => void;
  setSelected: (id: string | null) => void;
  setConfirming: (value: boolean) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
}) {
  return (
    <section
      aria-labelledby="connector-network-heading"
      data-testid="network-picker"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3
          id="connector-network-heading"
          className="text-sm font-semibold text-slate-900"
        >
          Select a network
        </h3>
      </div>
      <div aria-label="Social networks" className="grid grid-cols-2 gap-2">
        {(['linkedin', 'x'] as const).map((key) => {
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
                'flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-2.5 py-2.5 text-sm font-semibold transition-[border-color] duration-[180ms] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 ' +
                (network === key
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50')
              }
            >
              <Icon className="size-5! shrink-0" aria-hidden="true" />
              <span className={key === 'x' ? 'sr-only' : 'min-w-0'}>
                {providerMeta[key].name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
