import {
  Activity,
  Check,
  FileText,
  Lock,
  Pause,
  Play,
  ShieldCheck,
  Square,
  Timer,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { StepKind } from './workflow-types';

// Both saved plans and YAML-compiled tasks use the same recognizable icons.
export const stepIconFor: Record<StepKind, LucideIcon> = {
  start: Play,
  session: Lock,
  inspect: Activity,
  action: Zap,
  verify: ShieldCheck,
  note: FileText,
  delay: Timer,
  assess: ShieldCheck,
  evidence: FileText,
  approve: ShieldCheck,
  pause: Pause,
  stop: Square,
  finish: Check,
};
