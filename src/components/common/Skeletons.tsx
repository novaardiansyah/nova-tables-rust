import React from 'react'

export function ErdSkeleton() {
  const leftFields = [
    { nameWidth: 'w-24', typeWidth: 'w-10', isPk: true },
    { nameWidth: 'w-28', typeWidth: 'w-16', isPk: false },
    { nameWidth: 'w-20', typeWidth: 'w-12', isPk: false },
    { nameWidth: 'w-32', typeWidth: 'w-14', isPk: false },
    { nameWidth: 'w-24', typeWidth: 'w-10', isPk: false },
    { nameWidth: 'w-20', typeWidth: 'w-12', isPk: false },
    { nameWidth: 'w-36', typeWidth: 'w-16', isPk: false },
    { nameWidth: 'w-28', typeWidth: 'w-14', isPk: false },
    { nameWidth: 'w-24', typeWidth: 'w-12', isPk: false },
  ]

  const rightFields = [
    { nameWidth: 'w-20', typeWidth: 'w-10', isPk: true },
    { nameWidth: 'w-32', typeWidth: 'w-12', isPk: false, isFk: true },
    { nameWidth: 'w-24', typeWidth: 'w-16', isPk: false },
    { nameWidth: 'w-28', typeWidth: 'w-14', isPk: false },
    { nameWidth: 'w-20', typeWidth: 'w-10', isPk: false },
    { nameWidth: 'w-36', typeWidth: 'w-16', isPk: false },
    { nameWidth: 'w-24', typeWidth: 'w-12', isPk: false },
    { nameWidth: 'w-28', typeWidth: 'w-14', isPk: false },
  ]

  return (
    <div className="flex h-full w-full items-center justify-center p-6 bg-base select-none">
      <div className="relative flex items-center justify-center gap-12 sm:gap-20">
        {/* Card 1 */}
        <div className="w-64 rounded-lg border border-line bg-panel shadow-sm">
          <div className="flex items-center justify-between border-b border-line bg-surface/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="skeleton-shimmer h-3.5 w-3.5 shrink-0 rounded" />
              <div className="skeleton-shimmer h-3.5 w-28 rounded" />
            </div>
            <div className="flex items-center gap-1">
              <div className="skeleton-shimmer-subtle h-4 w-4 rounded" />
              <div className="skeleton-shimmer-subtle h-4 w-4 rounded" />
            </div>
          </div>
          <div className="divide-y divide-line/40 px-1 py-1">
            {leftFields.map((field, idx) => (
              <div key={idx} className="flex items-center justify-between px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {field.isPk ? (
                    <div className="skeleton-shimmer h-2.5 w-2.5 shrink-0 rounded-full" />
                  ) : (
                    <div className="skeleton-shimmer-subtle h-2 w-2 shrink-0 rounded-full" />
                  )}
                  <div className={`skeleton-shimmer h-3 ${field.nameWidth} rounded`} />
                </div>
                <div className={`skeleton-shimmer-subtle h-2.5 ${field.typeWidth} rounded`} />
              </div>
            ))}
          </div>
        </div>

        {/* Relation line container */}
        <div className="pointer-events-none absolute inset-x-0 inset-y-0 flex items-center justify-center">
          <svg className="h-full w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
            {/* Primary connection line */}
            <path
              d="M calc(50% - 100px) 110 C calc(50% - 30px) 110, calc(50% + 30px) 76, calc(50% + 100px) 76"
              fill="none"
              stroke="currentColor"
              className="text-line-strong/60 stroke-[1.5] [stroke-dasharray:4_4] animate-pulse"
            />
            {/* Secondary connection line */}
            <path
              d="M calc(50% - 100px) 140 C calc(50% - 20px) 140, calc(50% + 20px) 180, calc(50% + 100px) 180"
              fill="none"
              stroke="currentColor"
              className="text-line-strong/40 stroke-[1.5] [stroke-dasharray:4_4] animate-pulse"
            />
            {/* Endpoint dots */}
            <circle cx="calc(50% - 100px)" cy="110" r="3" fill="currentColor" className="text-line-strong" />
            <circle cx="calc(50% + 100px)" cy="76" r="3" fill="currentColor" className="text-line-strong" />
            <circle cx="calc(50% - 100px)" cy="140" r="2.5" fill="currentColor" className="text-line-strong/60" />
            <circle cx="calc(50% + 100px)" cy="180" r="2.5" fill="currentColor" className="text-line-strong/60" />
          </svg>
        </div>

        {/* Card 2 */}
        <div className="w-64 rounded-lg border border-line bg-panel shadow-sm">
          <div className="flex items-center justify-between border-b border-line bg-surface/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="skeleton-shimmer h-3.5 w-3.5 shrink-0 rounded" />
              <div className="skeleton-shimmer h-3.5 w-24 rounded" />
            </div>
            <div className="flex items-center gap-1">
              <div className="skeleton-shimmer-subtle h-4 w-4 rounded" />
              <div className="skeleton-shimmer-subtle h-4 w-4 rounded" />
            </div>
          </div>
          <div className="divide-y divide-line/40 px-1 py-1">
            {rightFields.map((field, idx) => (
              <div key={idx} className="flex items-center justify-between px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {field.isPk ? (
                    <div className="skeleton-shimmer h-2.5 w-2.5 shrink-0 rounded-full" />
                  ) : field.isFk ? (
                    <div className="skeleton-shimmer h-2 w-2 shrink-0 rounded-full" />
                  ) : (
                    <div className="skeleton-shimmer-subtle h-2 w-2 shrink-0 rounded-full" />
                  )}
                  <div className={`skeleton-shimmer h-3 ${field.nameWidth} rounded`} />
                </div>
                <div className={`skeleton-shimmer-subtle h-2.5 ${field.typeWidth} rounded`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function TableDesignerSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-base select-none">
      {/* Designer Header Bar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-3.5">
        <div className="skeleton-shimmer h-3.5 w-3.5 shrink-0 rounded" />
        <div className="skeleton-shimmer-subtle h-3.5 w-12 rounded" />
        <div className="skeleton-shimmer h-4 w-32 rounded" />
        <div className="ml-auto flex items-center gap-2">
          <div className="skeleton-shimmer-subtle h-8 w-16 rounded" />
          <div className="skeleton-shimmer-subtle h-8 w-24 rounded" />
          <div className="skeleton-shimmer h-8 w-20 rounded" />
        </div>
      </div>

      {/* Designer Content Body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-40 pt-3">
        {/* Table Name and Schema Input fields */}
        <div className="flex items-start gap-3 w-[50%]">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="skeleton-shimmer-subtle h-3 w-16 rounded" />
            <div className="skeleton-shimmer h-9 w-full rounded border border-line-strong bg-base" />
          </div>
          <div className="w-44 shrink-0 space-y-1.5">
            <div className="skeleton-shimmer-subtle h-3 w-12 rounded" />
            <div className="skeleton-shimmer h-9 w-full rounded border border-line-strong bg-base" />
          </div>
        </div>

        {/* Column Editor Container */}
        <div className="rounded-xl border border-line bg-panel p-3 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <div className="skeleton-shimmer h-4 w-28 rounded" />
            <div className="skeleton-shimmer-subtle h-7 w-24 rounded" />
          </div>
          {/* Column Rows */}
          <div className="space-y-1">
            {[
              { nameWidth: 'w-32', typeWidth: 'w-24', isPk: true },
              { nameWidth: 'w-44', typeWidth: 'w-28', isPk: false },
              { nameWidth: 'w-36', typeWidth: 'w-24', isPk: false },
              { nameWidth: 'w-28', typeWidth: 'w-20', isPk: false },
              { nameWidth: 'w-40', typeWidth: 'w-28', isPk: false },
            ].map((col, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 hover:bg-tint/[0.02]"
              >
                <div className="skeleton-shimmer-subtle h-3 w-3 shrink-0 rounded" />
                {col.isPk ? (
                  <div className="skeleton-shimmer h-3.5 w-3.5 shrink-0 rounded-full" />
                ) : (
                  <div className="skeleton-shimmer-subtle h-3.5 w-3.5 shrink-0 rounded-full" />
                )}
                <div className={`skeleton-shimmer h-3.5 ${col.nameWidth} rounded`} />
                <div className={`skeleton-shimmer-subtle h-3.5 ${col.typeWidth} rounded`} />
                <div className="skeleton-shimmer-subtle h-3.5 w-16 rounded" />
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="skeleton-shimmer-subtle h-5 w-5 rounded" />
                  <div className="skeleton-shimmer-subtle h-5 w-5 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
