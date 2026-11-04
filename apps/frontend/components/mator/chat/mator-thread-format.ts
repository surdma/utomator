import type { MatorClarifyQuestion } from '../mator-chat-state';

export function threadWhen(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function clarifyCount(questions: MatorClarifyQuestion[]) {
  return questions.length;
}
