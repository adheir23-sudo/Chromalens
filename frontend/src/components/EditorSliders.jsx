import { Slider } from "./ui/slider";

export function ParamSlider({ label, value, min, max, step = 1, unit = "", onChange, testId }) {
  const isSigned = min < 0 && max > 0;
  const display = typeof value === "number" ? (value > 0 && isSigned ? `+${value}` : `${value}`) : "0";
  return (
    <div className="py-1.5" data-testid={testId}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="cl-label">{label}</span>
        <button
          type="button"
          onClick={() => onChange(0)}
          className="cl-data hover:text-amber-300 transition-colors"
          title="Reset"
        >
          {display}
          {unit}
        </button>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="editor-slider"
      />
    </div>
  );
}

export function TempSlider({ value, onChange }) {
  return (
    <div className="py-1.5" data-testid="slider-temperature">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="cl-label">Temperature</span>
        <button
          type="button"
          onClick={() => onChange(5500)}
          className="cl-data hover:text-amber-300 transition-colors"
        >
          {value} K
        </button>
      </div>
      <Slider
        value={[value]}
        min={2000}
        max={10000}
        step={50}
        onValueChange={(v) => onChange(v[0])}
        className="editor-slider"
      />
    </div>
  );
}
