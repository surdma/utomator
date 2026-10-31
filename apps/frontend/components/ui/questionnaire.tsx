'use client';

import { cn } from '@/lib/utils';
import { Questionnaire as Headless } from '@shadcn/react/questionnaire';

/**
 * Styled composition over the @shadcn/react questionnaire engine.
 * Root is the <form>; item state, validation, progress, and keyboard
 * navigation live in the engine.
 */

function navClasses(variant: 'default' | 'ghost') {
  return cn(
    'inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none',
    variant === 'ghost'
      ? 'text-slate-600 hover:bg-slate-100'
      : 'bg-slate-900 text-white hover:bg-slate-700'
  );
}

export function Questionnaire(
  props: React.ComponentProps<typeof Headless.Root>
) {
  return (
    <Headless.Root
      noValidate
      className={cn('flex w-full flex-col gap-3', props.className)}
      {...props}
    />
  );
}

export function QuestionnaireProgress({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Progress>) {
  return (
    <Headless.Progress
      render={(state) => {
        const progress = state as { current: number; total: number };
        return (
          <p
            data-testid="questionnaire-progress"
            className={cn(
              'text-[11px] font-semibold tracking-wider text-slate-500 uppercase',
              className
            )}
          >
            Question {progress.current + 1} of {progress.total}
          </p>
        );
      }}
      {...props}
    />
  );
}

export function QuestionnaireItem({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Item>) {
  return (
    <Headless.Item
      className={cn('flex w-full flex-col gap-2 border-0 p-0', className)}
      {...props}
    />
  );
}

export function QuestionnaireTitle({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Title>) {
  return (
    <Headless.Title
      className={cn(
        'block w-full max-w-full px-0 pb-0.5 text-sm font-bold text-slate-900',
        className
      )}
      {...props}
    />
  );
}

export function QuestionnaireDescription({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Description>) {
  return (
    <Headless.Description
      className={cn('text-xs leading-5 text-slate-500', className)}
      {...props}
    />
  );
}

export function QuestionnaireChoices({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Choices>) {
  return (
    <Headless.Choices
      className={cn('flex w-full flex-col gap-1.5', className)}
      {...props}
    />
  );
}

export function QuestionnaireChoice({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Headless.Choice>) {
  return (
    <Headless.Choice
      className={cn(
        'grid w-full cursor-pointer grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-0.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal-700 hover:border-teal-500/60 hover:bg-slate-50 data-[invalid=true]:border-rose-300 motion-reduce:transition-none',
        className
      )}
      {...props}
    >
      <Headless.ChoiceInput className="mt-0.5 size-3.5 cursor-pointer self-start accent-teal-700" />
      <Headless.ChoiceLabel className="min-w-0 font-medium text-slate-800">
        {children}
      </Headless.ChoiceLabel>
    </Headless.Choice>
  );
}

export function QuestionnaireInput({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Input>) {
  return (
    <Headless.Input
      className={cn(
        'min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export function QuestionnaireError({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Error>) {
  return (
    <Headless.Error
      className={cn('text-[11px] font-semibold text-rose-600', className)}
      {...props}
    />
  );
}

export function QuestionnaireActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-1 flex items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

export function QuestionnairePrevious({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Previous>) {
  return <Headless.Previous className={cn(navClasses('ghost'), className)} {...props} />;
}

export function QuestionnaireSkip({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Skip>) {
  return <Headless.Skip className={cn(navClasses('ghost'), className)} {...props} />;
}

export function QuestionnaireNext({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Next>) {
  return <Headless.Next className={cn(navClasses('default'), className)} {...props} />;
}

export function QuestionnaireSubmit({
  className,
  ...props
}: React.ComponentProps<typeof Headless.Submit>) {
  return <Headless.Submit className={cn(navClasses('default'), className)} {...props} />;
}
