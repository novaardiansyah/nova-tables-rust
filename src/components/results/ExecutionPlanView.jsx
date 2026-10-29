import { useState } from 'react'
import Icon from '../common/Icon.jsx'

function OperatorCard({ node, selected, onSelect }) {
  const isSelected = selected?.nodeId === node.nodeId

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={`w-56 rounded-lg border p-2.5 text-left transition-all ${
          isSelected
            ? 'border-accent bg-accent/10 shadow-md shadow-accent/10 ring-1 ring-accent'
            : 'border-line-strong bg-panel hover:border-accent/50 hover:bg-tint/[0.04]'
        }`}
      >
        <div className="flex items-start justify-between gap-1.5">
          <span className="truncate text-[length:var(--app-text-12)] font-semibold text-text-strong">
            {node.physicalOp}
          </span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[length:var(--app-text-10)] font-semibold ${
              node.costPct > 50
                ? 'bg-danger/20 text-danger'
                : node.costPct > 20
                ? 'bg-warning/20 text-warning'
                : 'bg-tint/[0.08] text-text-muted'
            }`}
            title="Estimated subtree cost percentage"
          >
            {node.costPct}%
          </span>
        </div>

        {node.targetObject?.table ? (
          <p className="mt-1 truncate font-mono text-[length:var(--app-text-11)] text-accent">
            {node.targetObject.table}
            {node.targetObject.index ? ` · ${node.targetObject.index}` : ''}
          </p>
        ) : null}

        <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-1.5 text-[length:var(--app-text-10)] text-text-faint">
          <span>Est. Rows: <strong className="text-text-muted">{(node.estimateRows ?? 0).toLocaleString()}</strong></span>
          <span>Cost: <strong className="text-text-muted">{(node.subtreeCost ?? 0).toFixed(4)}</strong></span>
        </div>
      </button>

      {node.children && node.children.length > 0 ? (
        <div className="flex flex-col items-center">
          <div className="h-4 w-px bg-line-strong" />
          <div className="flex items-start gap-4">
            {node.children.map((child) => (
              <div key={child.nodeId} className="relative flex flex-col items-center">
                <OperatorCard node={child} selected={selected} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function ExecutionPlanView({ plan, onCopyXml }) {
  const [selectedNode, setSelectedNode] = useState(plan?.rootNode ?? null)
  const [tab, setTab] = useState('tree')

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[length:var(--app-text-12)] text-text-muted">
        No execution plan available.
      </div>
    )
  }

  const { summary, rootNode, rawXml } = plan

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-panel px-3 py-2">
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="flex items-center gap-1.5 text-[length:var(--app-text-12)] font-semibold text-text-strong">
            <Icon name="plan" size={14} className="text-accent" />
            Estimated Execution Plan
          </span>
          <span className="text-[length:var(--app-text-11)] text-text-muted">
            Cost: <strong className="text-text">{(summary.statementSubTreeCost ?? 0).toFixed(5)}</strong>
          </span>
          <span className="text-[length:var(--app-text-11)] text-text-muted">
            Est. Rows: <strong className="text-text">{(summary.statementEstRows ?? 0).toLocaleString()}</strong>
          </span>
          {summary.statementOptmLevel ? (
            <span className="rounded border border-line bg-tint/[0.04] px-1.5 py-0.5 text-[length:var(--app-text-10)] uppercase text-text-faint">
              {summary.statementOptmLevel}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={`h-6 rounded px-2 text-[length:var(--app-text-11)] font-medium transition-colors ${
              tab === 'tree' ? 'bg-tint/[0.08] text-text-strong' : 'text-text-muted hover:text-text'
            }`}
            onClick={() => setTab('tree')}
          >
            Visual Tree
          </button>
          <button
            type="button"
            className={`h-6 rounded px-2 text-[length:var(--app-text-11)] font-medium transition-colors ${
              tab === 'xml' ? 'bg-tint/[0.08] text-text-strong' : 'text-text-muted hover:text-text'
            }`}
            onClick={() => setTab('xml')}
          >
            Raw XML
          </button>
        </div>
      </div>

      {tab === 'xml' ? (
        <div className="relative flex-1 overflow-auto p-4 font-mono text-[length:var(--app-text-11)] text-text">
          <button
            type="button"
            className="btn-soft absolute right-6 top-6 h-7 px-2.5 text-[length:var(--app-text-11)]"
            onClick={() => onCopyXml?.(rawXml)}
          >
            <Icon name="copy" size={12} />
            Copy XML
          </button>
          <pre className="whitespace-pre-wrap break-all">{rawXml}</pre>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] overflow-hidden">
          <div className="overflow-auto p-6">
            <div className="inline-block min-w-full pb-8">
              {rootNode ? (
                <OperatorCard
                  node={rootNode}
                  selected={selectedNode}
                  onSelect={setSelectedNode}
                />
              ) : (
                <p className="text-[length:var(--app-text-12)] text-text-faint">No operator tree found.</p>
              )}
            </div>
          </div>

          <div className="overflow-y-auto border-l border-line bg-panel p-3">
            <h3 className="text-[length:var(--app-text-11)] font-semibold uppercase tracking-wider text-text-muted">
              Operator Properties
            </h3>

            {selectedNode ? (
              <div className="mt-3 space-y-2.5 text-[length:var(--app-text-11)]">
                <div>
                  <span className="field-label block">Physical Operation</span>
                  <span className="font-semibold text-text-strong">{selectedNode.physicalOp}</span>
                </div>
                <div>
                  <span className="field-label block">Logical Operation</span>
                  <span className="text-text">{selectedNode.logicalOp}</span>
                </div>
                {selectedNode.targetObject?.table ? (
                  <div>
                    <span className="field-label block">Target Object</span>
                    <span className="font-mono text-accent">{selectedNode.targetObject.table}</span>
                    {selectedNode.targetObject.index ? (
                      <p className="font-mono text-text-muted">{selectedNode.targetObject.index}</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 border-t border-line pt-2">
                  <div>
                    <span className="field-label block">Estimated Rows</span>
                    <span className="text-text">{(selectedNode.estimateRows ?? 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="field-label block">Subtree Cost</span>
                    <span className="text-text">{(selectedNode.subtreeCost ?? 0).toFixed(5)}</span>
                  </div>
                  <div>
                    <span className="field-label block">Estimated I/O</span>
                    <span className="text-text">{(selectedNode.estimateIO ?? 0).toFixed(5)}</span>
                  </div>
                  <div>
                    <span className="field-label block">Estimated CPU</span>
                    <span className="text-text">{(selectedNode.estimateCPU ?? 0).toFixed(5)}</span>
                  </div>
                  <div>
                    <span className="field-label block">Avg Row Size</span>
                    <span className="text-text">{selectedNode.avgRowSize ?? 0} bytes</span>
                  </div>
                  <div>
                    <span className="field-label block">Parallel</span>
                    <span className="text-text">{selectedNode.parallel ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[length:var(--app-text-11)] text-text-faint">
                Select an operator card to inspect its cost and execution details.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
