interface TabsProps {
  tabs: string[]
  active: number
  onChange: (index: number) => void
  size?: 'md' | 'sm'
}

export function Tabs({ tabs, active, onChange, size = 'md' }: TabsProps) {
  return (
    <div className="flex gap-1 bg-surface rounded-lg p-1">
      {tabs.map((tab, i) => (
        <button
          key={tab}
          onClick={() => onChange(i)}
          className={`${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-md font-medium transition-colors ${
            i === active
              ? 'bg-primary text-white'
              : 'text-text-muted hover:text-text hover:bg-surface-alt'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
