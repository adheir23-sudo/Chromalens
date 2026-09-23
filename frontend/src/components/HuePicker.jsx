/** Hue picker with a rainbow gradient track. */
export default function HuePicker({ value, onChange, testId }) {
  return (
    <div className="w-full" data-testid={testId}>
      <div className="relative">
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="hue-picker w-full appearance-none bg-transparent h-7 cursor-pointer"
          style={{
            background:
              "linear-gradient(90deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
            borderRadius: "999px",
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5 font-mono-tech text-[10px] text-slate-500">
        <span>0°</span>
        <span className="text-amber-300">{value}°</span>
        <span>360°</span>
      </div>
    </div>
  );
}
