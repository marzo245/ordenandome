'use client';

import { useState } from 'react';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
}

export default function TagsMultiSelect({ value, onChange }: Props) {
  const [input, setInput] = useState('');

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (value.includes(tag)) {
      setInput('');
      return;
    }
    onChange([...value, tag]);
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      e.preventDefault();
      removeTag(value[value.length - 1]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 bg-[#e9e9e7] text-[#37352f] px-2 py-0.5 rounded text-xs"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="cursor-pointer hover:opacity-60"
            aria-label={`Quitar ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Añadir tag..."
        className="flex-1 min-w-[80px] bg-transparent outline-none text-xs placeholder:text-[var(--muted)]"
      />
    </div>
  );
}
