import React from 'react'

export default function ConnectionsSkeleton() {
  return (
    <>
      <div className="mb-4 flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="skeleton-shimmer h-5 w-28 shrink max-w-[40%] rounded-md" />
          <div className="skeleton-shimmer-subtle mt-1.5 h-3 w-56 shrink max-w-[70%] rounded" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="skeleton-shimmer-subtle h-4 w-16 rounded" />
          <span className="text-text-faint/30">·</span>
          <div className="skeleton-shimmer-subtle h-4 w-16 rounded" />
        </div>
      </div>

      <div className="mb-4 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="skeleton-shimmer h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="skeleton-shimmer h-3.5 w-24 shrink-0 rounded-full" />
              <div className="skeleton-shimmer-subtle h-3.5 w-16 shrink-0 rounded-full" />
              <div className="skeleton-shimmer-subtle h-3 w-14 shrink-0 rounded" />
            </div>
            <div className="flex min-w-0 items-baseline gap-2">
              <div className="skeleton-shimmer h-3.5 w-36 shrink max-w-[40%] rounded" />
              <div className="skeleton-shimmer-subtle h-3 w-48 shrink max-w-[55%] rounded" />
            </div>
          </div>
        </div>
        <div className="skeleton-shimmer h-8 w-28 shrink-0 rounded-lg" />
      </div>

      <div className="rounded-xl border border-line bg-panel p-2 space-y-px">
        {[
          { nameWidth: 120, subWidth: 170, secondBadge: true },
          { nameWidth: 160, subWidth: 210, secondBadge: false },
          { nameWidth: 140, subWidth: 190, secondBadge: true },
          { nameWidth: 180, subWidth: 230, secondBadge: false },
          { nameWidth: 130, subWidth: 180, secondBadge: true },
        ].map((item, index) => (
          <div
            key={index}
            className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5"
          >
            <div className="skeleton-shimmer-subtle h-3.5 w-3.5 shrink-0 rounded" />
            <div className="skeleton-shimmer-subtle h-3.5 w-2 shrink-0 rounded" />
            <div className="skeleton-shimmer h-[7px] w-[7px] shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="skeleton-shimmer h-3.5 shrink rounded"
                  style={{ width: `${item.nameWidth}px`, maxWidth: '45%' }}
                />
                <div className="skeleton-shimmer-subtle h-3.5 w-16 shrink-0 rounded-full" />
                {item.secondBadge ? (
                  <div className="skeleton-shimmer-subtle h-3.5 w-12 shrink-0 rounded-full" />
                ) : null}
              </div>
              <div
                className="skeleton-shimmer-subtle h-2.5 shrink rounded"
                style={{ width: `${item.subWidth}px`, maxWidth: '70%' }}
              />
            </div>
            <div className="skeleton-shimmer-subtle h-6 w-6 shrink-0 rounded" />
          </div>
        ))}
      </div>
    </>
  )
}
