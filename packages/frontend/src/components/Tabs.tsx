interface TabsProps {
  tabs: string[]
  active: number
  onChange: (index: number) => void
  size?: 'md' | 'sm'
}

export function Tabs({ tabs, active, onChange, size = 'md' }: TabsProps) {
  return (
    <div className="flex gap-0.5 bg-surface/80 rounded-xl p-1 border border-border-subtle">
      {tabs.map((tab, i) => (
        <button
          key={tab}
          onClick={() => onChange(i)}
          className={`relative ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-lg font-medium transition-all duration-200 ${
            i === active
              ? 'bg-primary text-white shadow-md shadow-primary/20'
              : 'text-text-muted hover:text-text hover:bg-surface-hover'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
