"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cpu } from "lucide-react";

interface ProviderInfo {
  name: string;
  displayName: string;
  models: string[];
  available: boolean;
}

interface ProvidersResponse {
  providers: ProviderInfo[];
  defaultProvider: string | null;
}

interface ProviderSelectorProps {
  value?: string;
  onChange: (provider: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ProviderSelector({
  value,
  onChange,
  disabled,
  className,
}: ProviderSelectorProps) {
  const { data, isLoading } = useQuery<ProvidersResponse>({
    queryKey: ["/api/ai/providers"],
    queryFn: async () => {
      const res = await fetch("/api/ai/providers");
      if (!res.ok) throw new Error("Failed to fetch providers");
      return res.json();
    },
  });

  const availableProviders = data?.providers.filter((p) => p.available) || [];
  const isDisabled = disabled || isLoading || availableProviders.length <= 1;

  // Sync with localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("ai_provider");
    if (saved && !value) {
      onChange(saved);
    } else if (!saved && data?.defaultProvider && !value) {
      onChange(data.defaultProvider);
    }
  }, [data?.defaultProvider, onChange, value]);

  // Handle change
  const handleChange = (newValue: string) => {
    localStorage.setItem("ai_provider", newValue);
    onChange(newValue);
  };

  // Use first available provider as default if no value provided
  const selectedValue = value || localStorage.getItem("ai_provider") || data?.defaultProvider || availableProviders[0]?.name;

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Cpu className="h-4 w-4 animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  if (availableProviders.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Cpu className="h-4 w-4" />
        <span>No AI providers configured</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Cpu className="h-4 w-4 text-muted-foreground" />
      <Select
        value={selectedValue}
        onValueChange={handleChange}
        disabled={isDisabled}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue placeholder="Select provider" />
        </SelectTrigger>
        <SelectContent>
          {availableProviders.map((provider) => (
            <SelectItem key={provider.name} value={provider.name}>
              <div className="flex flex-col">
                <span className="font-medium">{provider.displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {provider.models[0]}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
