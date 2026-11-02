'use client';

import { Workflow } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export function AssistantAvatar() {
  return (
    <Avatar className="size-8 bg-gradient-to-br from-teal-700 to-teal-800 text-white">
      <AvatarFallback>
        <Workflow className="size-4" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
