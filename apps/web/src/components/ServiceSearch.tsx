"use client";

import { useState, useRef, useEffect } from "react";

interface Service {
  id: string;
  name: string;
}

interface Props {
  services: Service[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}

export default function ServiceSearch({ services, selectedId, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedService = services.find((s) => s.id === selectedId) ?? null;

  const filtered = query.trim()
    ? services.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : services;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(svc: Service) {
    onChange(svc.id);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-72">
      <div className="flex items-center bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 gap-2">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none"
          placeholder={selectedService ? selectedService.name : "Search service…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {selectedId && (
          <button
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-200 shrink-0"
            aria-label="Clear selection"
          >
            x
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {filtered.map((svc) => (
            <li
              key={svc.id}
              onClick={() => handleSelect(svc)}
              className={`px-3 py-2 text-sm cursor-pointer ${
                svc.id === selectedId
                  ? "bg-blue-600 text-white"
                  : "text-gray-200 hover:bg-gray-700"
              }`}
            >
              {svc.name}
            </li>
          ))}
        </ul>
      )}

      {open && filtered.length === 0 && query.trim() && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-md shadow-lg px-3 py-2 text-sm text-gray-500">
          No services match "{query}"
        </div>
      )}
    </div>
  );
}
