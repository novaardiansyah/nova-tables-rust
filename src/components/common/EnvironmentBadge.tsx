import { environmentById, EnvironmentTone } from '@/environments'

const TONE_CLASSES: Record<EnvironmentTone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
}

export interface EnvironmentBadgeProps {
  environment?: string | null
}

export default function EnvironmentBadge({ environment }: EnvironmentBadgeProps) {
  const item = environmentById(environment)
  if (!item) return null

  return (
    <span
      title={item.label}
      className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[length:var(--app-text-9)] font-medium leading-[calc(var(--app-text-9)+4px)] ${
        TONE_CLASSES[item.tone]
      }`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {item.label}
    </span>
  )
}
