"use client";

import * as React from "react";
import { Settings, Eye, EyeOff, Trash2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const API_KEY_STORAGE_KEYS = {
  groq: "sk_groq_api_key",
  gemini: "sk_gemini_api_key",
  openai: "sk_openai_api_key",
} as const;

interface ApiKeyInputProps {
  label: string;
  storageKey: string;
  placeholder: string;
}

function ApiKeyInput({ label, storageKey, placeholder }: ApiKeyInputProps) {
  const [value, setValue] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [hasStoredKey, setHasStoredKey] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      setValue(stored);
      setHasStoredKey(true);
    }
  }, [storageKey]);

  const handleSave = () => {
    if (value.trim()) {
      localStorage.setItem(storageKey, value.trim());
      setHasStoredKey(true);
      toast({
        title: "API Key Saved",
        description: `${label} API key has been saved.`,
      });
    }
  };

  const handleClear = () => {
    localStorage.removeItem(storageKey);
    setValue("");
    setHasStoredKey(false);
    toast({
      title: "API Key Removed",
      description: `${label} API key has been removed.`,
    });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={storageKey}>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={storageKey}
            type={showKey ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleSave}
          disabled={!value.trim()}
        >
          <Save className="h-4 w-4" />
        </Button>
        {hasStoredKey && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleClear}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      {hasStoredKey && (
        <p className="text-xs text-muted-foreground">
          Key is stored locally in your browser.
        </p>
      )}
    </div>
  );
}

interface SettingsDialogProps {
  children?: React.ReactNode;
}

export function SettingsDialog({ children }: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI Provider Settings</DialogTitle>
          <DialogDescription>
            Configure your own API keys to use different AI providers.
            Keys are stored locally in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <ApiKeyInput
            label="Groq"
            storageKey={API_KEY_STORAGE_KEYS.groq}
            placeholder="gsk_..."
          />
          <ApiKeyInput
            label="Gemini"
            storageKey={API_KEY_STORAGE_KEYS.gemini}
            placeholder="AIza..."
          />
          <ApiKeyInput
            label="OpenAI"
            storageKey={API_KEY_STORAGE_KEYS.openai}
            placeholder="sk-..."
          />
        </div>
        <div className="text-xs text-muted-foreground">
          <p>
            <strong>Note:</strong> Server-configured providers will be used if available.
            Your custom keys are stored only in this browser.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
