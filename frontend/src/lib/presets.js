const KEY = "chromalens_presets_v1";

export function loadPresets() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePreset(name, params) {
  const list = loadPresets();
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const entry = {
    id,
    name: (name || "Untitled Preset").slice(0, 60),
    params,
    created_at: new Date().toISOString(),
  };
  const next = [entry, ...list].slice(0, 100);
  localStorage.setItem(KEY, JSON.stringify(next));
  return entry;
}

export function deletePreset(id) {
  const next = loadPresets().filter((p) => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
