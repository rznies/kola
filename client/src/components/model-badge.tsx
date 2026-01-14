"use client";

import { cn } from "@/lib/utils";

const providerColors: Record<string, string> = {
  openai: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  groq: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  gemini: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const providerDisplayNames: Record<string, string> = {
  openai: "OpenAI",
  groq: "Groq",
  gemini: "Gemini",
};

interface ModelBadgeProps {
  provider?: string | null;
  className?: string;
}

export function ModelBadge({ provider, className }: ModelBadgeProps) {
  if (!provider) return null;

  const colorClass = providerColors[provider] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  const displayName = providerDisplayNames[provider] || provider;

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide",
        colorClass,
        className
      )}
    >
      {displayName}
    </span>
  );
}
