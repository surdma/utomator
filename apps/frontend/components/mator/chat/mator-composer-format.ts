import { cn } from '@/lib/utils';

export function supportedFile(file: File) {
  const name = file.name.toLowerCase();
  const images = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/bmp',
    'image/tiff',
    'image/heic',
    'image/heif',
  ];
  return (
    images.includes(file.type) ||
    ((['.txt', '.md', '.markdown', '.readme'].some((ext) =>
      name.endsWith(ext)
    ) ||
      /^readme(?:\.[a-z0-9_-]+)?$/.test(name)) &&
      (!file.type ||
        ['text/plain', 'text/markdown', 'application/octet-stream'].includes(
          file.type
        )))
  );
}

export function iconButton(
  tone: 'default' | 'active' | 'danger',
  extra?: string
): string {
  return cn(
    'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40',
    tone === 'default' &&
      'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
    tone === 'active' && 'bg-teal-700 text-white hover:bg-teal-600',
    tone === 'danger' && 'text-rose-600 hover:bg-rose-50',
    extra
  );
}

export function fileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
