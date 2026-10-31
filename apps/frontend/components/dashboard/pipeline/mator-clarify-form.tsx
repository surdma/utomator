'use client';

import type { FormEvent } from 'react';
import {
  formatClarifyReply,
  type MatorClarifyChoice,
  type MatorClarifyQuestion,
} from './mator-chat-state';
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
  /** Receives the deterministic formatted reply text. */
  onSubmit: (text: string) => void;
  className?: string;
};

/**
 * Mator's clarify step as a styled questionnaire.
 * Answers are joined by formatClarifyReply — identical shape to the
 * previous plain form so the interpreter contract is unchanged.
 */
export default function MatorClarifyForm({
  questions,
  disabled = false,
  onSubmit,
  className,
}: Props) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(formatClarifyReply(questions, new FormData(event.currentTarget)));
  };

  return (
    <Questionnaire
      className={className}
      items={questions.map((question) => ({
        name: question.name,
        required: question.required,
        choices: question.choices.map((choice: MatorClarifyChoice) => ({
          value: choice.value,
        })),
      }))}
      onSubmit={handleSubmit}
      data-testid="mator-clarify-form"
    >
      <QuestionnaireProgress />
      {questions.map((question) => (
        <QuestionnaireItem
          key={question.name}
          name={question.name}
          required={question.required}
          multiple={question.multiple}
          disabled={disabled}
        >
          <QuestionnaireTitle>{question.prompt}</QuestionnaireTitle>
          {question.description && (
            <QuestionnaireDescription>
              {question.description}
            </QuestionnaireDescription>
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
            {question.freeformLabel && (
              <QuestionnaireInput
                aria-label={question.freeformLabel}
                placeholder={question.freeformLabel}
                disabled={disabled}
              />
            )}
          </QuestionnaireChoices>
          <QuestionnaireError>
            Choose an answer, or use skip, before moving on.
          </QuestionnaireError>
        </QuestionnaireItem>
      ))}
      <QuestionnaireActions>
        <span className="flex items-center gap-2">
          <QuestionnairePrevious>Back</QuestionnairePrevious>
          <QuestionnaireSkip>Skip</QuestionnaireSkip>
        </span>
        <span className="flex items-center gap-2">
          <QuestionnaireNext>Next</QuestionnaireNext>
          <QuestionnaireSubmit>Send answers</QuestionnaireSubmit>
        </span>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
