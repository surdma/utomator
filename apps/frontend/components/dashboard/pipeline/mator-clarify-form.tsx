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
  onSubmit: (text: string, attachmentIds?: string[]) => Promise<boolean | void> | void;
  className?: string;
};

/** The uploaded file IDs are sent in one clarification message, not an extra chat turn. */
export default function MatorClarifyForm({
  questions,
  disabled = false,
  onUploadFile,
  onSubmit,
  className,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const uploaded = useRef(new WeakMap<File, string>());

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || disabled) return;
    const form = new FormData(event.currentTarget);
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    void (async () => {
      try {
        const attachments: string[] = [];
        for (const question of questions) {
          const answer = form.get(question.name);
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
            if (!(answer instanceof File) || !answer.size) {
              if (question.required) throw new Error('Attach a file for ' + question.prompt);
              form.delete(question.name);
              continue;
            }
            if (!onUploadFile) throw new Error('Attachment upload is unavailable. Please try again.');
            let id = uploaded.current.get(answer);
            if (!id) {
              id = await onUploadFile(answer);
              if (!id) throw new Error('Could not upload ' + answer.name);
              uploaded.current.set(answer, id);
            }
            attachments.push(id);
            form.set(question.name, answer.name);
          }
        }
        const sent = await onSubmit(formatClarifyReply(questions, form), attachments);
        if (sent === false) throw new Error('Mator could not send the answers. Please retry.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not submit answers.');
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    })();
  };

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
