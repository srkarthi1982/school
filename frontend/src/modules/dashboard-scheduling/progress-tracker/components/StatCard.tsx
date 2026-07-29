function StatCard({
  icon,
  label,
  value,
  color,
  percentage,
  subLabel,
  onClick
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
  percentage?: number
  subLabel?: string
  onClick?:(e:object) => void
}) {
  return (
    <div className="card px-4 py-4 flex items-center gap-3 flex-1 min-w-[180px] cursor-pointer" onClick={onClick}>
      <div
        className="w-11 h-11 rounded-[10px] flex items-center justify-center text-[20px] shrink-0"
        style={{ 
          background: `${color}30`, 
          color 
        }}        
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted font-medium mb-0.5">{label}</p>
        <p className="text-[22px] font-bold" style={{ color }}>{value}</p>
        {percentage !== undefined && (
          <div className="mt-1.5">
            <div className="w-full h-[4px] bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.min(percentage, 100)}%`, background: color }}
              />
            </div>
          </div>
        )}
        {subLabel && <p className="text-[10px] text-muted">{subLabel}</p>}
      </div>
    </div>
  )
}

export default StatCard
