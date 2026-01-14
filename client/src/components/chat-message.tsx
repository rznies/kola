import { useState } from "react";
import { ChevronDown, ChevronUp, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CitationCard } from "./snippet-card";
import { Badge } from "@/components/ui/badge";
import { ModelBadge } from "./model-badge";

interface Citation {
  id: string;
  text: string;
  sourceUrl: string;
  sourceDomain: string;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  provider?: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, citations = [], provider, isStreaming }: ChatMessageProps) {
  const [showCitations, setShowCitations] = useState(false);
  const hasCitations = citations.length > 0;

  return (
    <div 
      className={`flex gap-3 ${role === "user" ? "justify-end" : "justify-start"}`}
      data-testid={`message-${role}`}
    >
      {role === "assistant" && (
        <div className="flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          {provider && <ModelBadge provider={provider} className="mt-1" />}
        </div>
      )}
      
      <div className={`max-w-[85%] space-y-2 ${role === "user" ? "items-end" : "items-start"}`}>
        <div 
          className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
            role === "user" 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted text-foreground"
          }`}
        >
          {content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse" />
          )}
        </div>
        
        {role === "assistant" && hasCitations && (
          <div className="w-full">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground gap-1"
              onClick={() => setShowCitations(!showCitations)}
              data-testid="button-toggle-citations"
            >
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {citations.length}
              </Badge>
              <span>source{citations.length !== 1 ? "s" : ""}</span>
              {showCitations ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
            
            {showCitations && (
              <div className="mt-2 space-y-2 pl-2 border-l-2 border-primary/20">
                {citations.map((citation) => (
                  <CitationCard key={citation.id} snippet={citation} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {role === "user" && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
          <User className="h-4 w-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}
