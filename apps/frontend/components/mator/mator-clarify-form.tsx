'use client';

import { useRef, useState, type FormEvent } from 'react';
import {
  formatClarifyReply,
  type MatorClarifyChoice,
  type MatorClarifyQuestion,
} from './mator-chat-state';
import { ATTACH_ACCEPT } from './mator-composer';
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from '@/components/ui/questionnaire';

type Props = {
  questions: MatorClarifyQuestion[];
  disabled?: boolean;
  onUploadFile?: (file: File) => Promise<string>;
  onSubmit?: (text: string, attachmentIds?: string[]) => Promise<boolean | void> | void;
  onAnswerData?: (answers: Record<string, string[]>, attachmentIds: string[]) => Promise<boolean | void> | void;
  className?: string;
};

/** The uploaded file IDs are sent in one clarification message, not an extra chat turn. */
export default function MatorClarifyForm({
  questions,
  disabled = false,
  onUploadFile,
  onSubmit,
  onAnswerData,
  className,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  // An input element survives retries even if FormData constructs a new File
  // wrapper (notably in WebKit). Its onChange handler invalidates the cached ID.
  const uploaded = useRef(new WeakMap<HTMLInputElement, string>());

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || disabled) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    void (async () => {
      try {
        const attachments: string[] = [];
        for (const question of questions) {
          const answer = form.get(question.name);
          if (
            question.inputType === 'text' &&
            question.required &&
            !form.getAll(question.name).some((value) =>
              typeof value === 'string' && Boolean(value.trim())
            )
          ) {
            throw new Error('Answer ' + question.prompt + ' before sending.');
          }
          if (question.inputType === 'url') {
            const value = typeof answer === 'string' ? answer.trim() : '';
            if (!value && !question.required) continue;
            let url: URL;
            try { url = new URL(value); }
            catch { throw new Error('Enter a valid website URL for ' + question.prompt); }
            if (!['http:', 'https:'].includes(url.protocol))
              throw new Error('Only HTTP and HTTPS website links are supported.');
            form.set(question.name, url.href);
          }
          if (question.inputType === 'file') {
            const control = formElement.elements.namedItem(question.name);
            const input = control instanceof HTMLInputElement ? control : null;
            const file = input?.files?.[0] ?? (answer instanceof File ? answer : null);
            if (!file?.size) {
              if (question.required) throw new Error('Attach a file for ' + question.prompt);
              form.delete(question.name);
              continue;
            }
            if (!input) throw new Error('Attachment input is unavailable. Please retry.');
            if (!onUploadFile) throw new Error('Attachment upload is unavailable. Please try again.');
            let id = uploaded.current.get(input);
            if (!id) {
              id = await onUploadFile(file);
              if (!id) throw new Error('Could not upload ' + file.name);
              uploaded.current.set(input, id);
            }
            attachments.push(id);
            form.set(question.name, file.name);
          }
        }
        const answers: Record<string, string[]> = {};
        for (const question of questions) {
          answers[question.name] = form.getAll(question.name)
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim()).filter(Boolean);
        }
        const sent = onAnswerData
          ? await onAnswerData(answers, attachments)
          : await onSubmit?.(formatClarifyReply(questions, form), attachments);
        if (sent === false) throw new Error('Mator could not send the answers. Please retry.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not submit answers.');
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    })();
  };


  // The shadcn questionnaire only registers choices and text inputs as answers.
  // A native file picker cannot satisfy that headless validation contract.
  // For a file request, use a real form and keep the same upload/send handler.
  if (questions.some((question) => question.inputType === 'file')) {
    return (
      <form
        className={className ? `flex min-w-0 flex-col gap-3 ${className}` : 'flex min-w-0 flex-col gap-3'}
        onSubmit={handleSubmit}
        noValidate
        data-testid="mator-clarify-form"
      >
        {questions.map((question) => (
          <fieldset
            key={question.name}
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 p-3"
            disabled={disabled || submitting}
          >
            <legend className="px-1 text-sm font-semibold text-slate-900">
              {question.prompt}
              {question.required && <span aria-label="required" className="ml-1 text-orange-700">*</span>}
            </legend>
            {question.description && <p className="text-xs leading-relaxed text-slate-600">{question.description}</p>}
            {question.inputType === 'file' ? (
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-700">
                Select attachment
                <input
                  type="file"
                  name={question.name}
                  accept={ATTACH_ACCEPT}
                  aria-label={question.prompt}
                  aria-required={question.required}
                  onChange={(event) => uploaded.current.delete(event.currentTarget)}
                  className="min-h-11 w-full min-w-0 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-teal-50 file:px-2 file:py-2 file:text-teal-800"
                />
              </label>
            ) : (
              <>
                {question.choices.map((choice) => (
                  <label key={choice.value} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs text-slate-700">
                    <input type={question.multiple ? 'checkbox' : 'radio'} name={question.name} value={choice.value} />
                    <span>{choice.label}</span>
                  </label>
                ))}
                {question.freeformLabel && (
                  <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-700">
                    {question.freeformLabel}
                    <input
                      type={question.inputType === 'url' ? 'url' : 'text'}
                      name={question.name}
                      aria-label={question.freeformLabel}
                      className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    />
                  </label>
                )}
              </>
            )}
          </fieldset>
        ))}
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={disabled || submitting}
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-xl bg-teal-800 px-4 text-xs font-semibold text-white hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
        >
          {submitting ? 'Sending…' : 'Send answers'}
        </button>
      </form>
    );
  }

  return (
    <Questionnaire
      className={className}
      items={questions.map((question) => ({
        name: question.name,
        required: question.required && question.inputType !== 'file',
        choices: question.choices.map((choice: MatorClarifyChoice) => ({ value: choice.value })),
      }))}
      onSubmit={handleSubmit}
      data-testid="mator-clarify-form"
    >
      <QuestionnaireProgress />
      {questions.map((question) => (
        <QuestionnaireItem
          key={question.name}
          name={question.name}
          required={question.required && question.inputType !== 'file'}
          multiple={question.multiple}
          disabled={disabled || submitting}
        >
          <QuestionnaireTitle>{question.prompt}</QuestionnaireTitle>
          {question.description && (
            <QuestionnaireDescription>{question.description}</QuestionnaireDescription>
          )}
          <QuestionnaireChoices>
            {question.choices.map((choice) => (
              <QuestionnaireChoice key={choice.value} value={choice.value}>
                <span className="block">{choice.label}</span>
                {choice.description && (
                  <span className="block text-[11px] font-normal text-slate-500">
                    {choice.description}
                  </span>
                )}
              </QuestionnaireChoice>
            ))}
            {question.inputType === 'file' ? (
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-700">
                Select attachment
                <input
                  type="file"
                  name={question.name}
                  accept={ATTACH_ACCEPT}
                  disabled={disabled || submitting}
                  aria-label={question.prompt}
                  className="min-h-11 w-full min-w-0 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-teal-50 file:px-2 file:py-2 file:text-teal-800"
                />
              </label>
            ) : question.freeformLabel && (
              <QuestionnaireInput
                type={question.inputType === 'url' ? 'url' : 'text'}
                aria-label={question.freeformLabel}
                placeholder={question.freeformLabel}
                disabled={disabled || submitting}
              />
            )}
          </QuestionnaireChoices>
          <QuestionnaireError>Choose an answer or use skip before moving on.</QuestionnaireError>
        </QuestionnaireItem>
      ))}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
      <QuestionnaireActions>
        <span className="flex items-center gap-2">
          <QuestionnairePrevious>Back</QuestionnairePrevious>
          <QuestionnaireSkip>Skip</QuestionnaireSkip>
        </span>
        <span className="flex items-center gap-2">
          <QuestionnaireNext>Next</QuestionnaireNext>
          <QuestionnaireSubmit disabled={disabled || submitting}>
            {submitting ? 'Sending…' : 'Send answers'}
          </QuestionnaireSubmit>
        </span>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
