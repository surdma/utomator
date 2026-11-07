import type { MatorClarifyQuestion } from './mator-chat-state.ts';

/** A single clarify event is one logical submission, even if Mator asks many questions. */
export type MatorQuestionFlow = {
  eventId: string;
  questions: MatorClarifyQuestion[];
  index: number;
  answers: Record<string, string[]>;
  attachmentIds: string[];
};

export function beginQuestionFlow(
  eventId: string,
  questions: MatorClarifyQuestion[],
): MatorQuestionFlow {
  if (
    !eventId ||
    !questions.length ||
    new Set(questions.map((q) => q.name)).size !== questions.length
  ) {
    throw new Error('Clarification questions must have distinct IDs.');
  }
  return { eventId, questions, index: 0, answers: {}, attachmentIds: [] };
}

export function currentQuestion(
  flow: MatorQuestionFlow,
): MatorClarifyQuestion | null {
  return flow.questions[flow.index] ?? null;
}

export function requiresVisualAnswer(question: MatorClarifyQuestion): boolean {
  return (
    question.inputType === 'file' ||
    question.inputType === 'url' ||
    question.multiple ||
    question.choices.length > 4
  );
}

export function provideQuestionAnswer(
  flow: MatorQuestionFlow,
  value: string[],
  attachmentIds: string[] = [],
): MatorQuestionFlow {
  const question = currentQuestion(flow);
  if (!question) throw new Error('All questions were already answered.');
  const answer = value.map((v) => v.trim()).filter(Boolean);
  if (question.required && answer.length === 0)
    throw new Error(`Answer ${question.prompt} first.`);
  if (!question.multiple && answer.length > 1)
    throw new Error('Only one answer is allowed.');
  if (
    question.choices.length &&
    answer.some((v) => !question.choices.some((c) => c.value === v)) &&
    !question.freeformLabel
  ) {
    throw new Error(`Choose one of the listed options for ${question.prompt}.`);
  }
  if (question.inputType === 'url' && answer.length) {
    let url: URL;
    try {
      url = new URL(answer[0]!);
    } catch {
      throw new Error(`Enter a valid URL for ${question.prompt}.`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error('Only HTTP and HTTPS URLs are accepted.');
    answer[0] = url.href;
  }
  if (
    question.inputType === 'file' &&
    question.required &&
    !attachmentIds.length
  ) {
    throw new Error(`Upload a file for ${question.prompt}.`);
  }
  return {
    ...flow,
    index: flow.index + 1,
    answers: { ...flow.answers, [question.name]: answer },
    attachmentIds: [...new Set([...flow.attachmentIds, ...attachmentIds])],
  };
}

export function questionFlowSubmission(flow: MatorQuestionFlow): {
  text: string;
  attachmentIds: string[];
} {
  if (flow.index !== flow.questions.length)
    throw new Error('The clarification is not complete.');
  const text = flow.questions
    .map((question) => {
      const answer = flow.answers[question.name] ?? [];
      return `${question.prompt} ${answer.length ? answer.join(', ') : 'Skipped'}`;
    })
    .join('\n');
  return { text, attachmentIds: flow.attachmentIds };
}

export function spokenQuestionAnswer(
  question: MatorClarifyQuestion,
  utterance: string,
): string[] {
  const spoken = utterance.trim();
  if (!spoken || (/^(skip|pass)$/i.test(spoken) && !question.required))
    return [];
  if (question.choices.length) {
    const match = question.choices.find(
      (choice) =>
        choice.label.localeCompare(spoken, undefined, {
          sensitivity: 'base',
        }) === 0 ||
        choice.value.localeCompare(spoken, undefined, {
          sensitivity: 'base',
        }) === 0,
    );
    if (!match)
      throw new Error(
        `I didn't recognize a listed choice for ${question.prompt}.`,
      );
    return [match.value];
  }
  return [spoken];
}
