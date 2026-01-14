import { useRef, useEffect } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ThreadSelector } from "./thread-selector";
import { ProviderSelector } from "./provider-selector";
import { SettingsDialog } from "./settings-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, AlertCircle } from "lucide-react";
import type { Thread, Message } from "@shared/schema";

interface ChatInterfaceProps {
  threads: Thread[];
  activeThreadId: string | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    provider?: string;
    citations?: Array<{
      id: string;
      text: string;
      sourceUrl: string;
      sourceDomain: string;
    }>;
  }>;
  streamingContent?: string;
  streamingProvider?: string;
  selectedProvider?: string;
  isLoadingThreads: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  hasSnippets: boolean;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  onDeleteThread: (threadId: string) => void;
  onSendMessage: (message: string) => void;
  onProviderChange?: (provider: string) => void;
}

export function ChatInterface({
  threads,
  activeThreadId,
  messages,
  streamingContent,
  streamingProvider,
  selectedProvider,
  isLoadingThreads,
  isLoadingMessages,
  isSending,
  hasSnippets,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onSendMessage,
  onProviderChange,
}: ChatInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  return (
    <div className="flex flex-col h-full">
      {/* Thread selector header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <ThreadSelector
            threads={threads}
            activeThreadId={activeThreadId}
            onSelect={onSelectThread}
            onCreate={onCreateThread}
            onDelete={onDeleteThread}
            isLoading={isLoadingThreads}
          />
          <SettingsDialog />
        </div>
        {onProviderChange && (
          <ProviderSelector
            value={selectedProvider}
            onChange={onProviderChange}
          />
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        {!activeThreadId ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">
              Start a conversation
            </h3>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              Create a new thread to start chatting with your saved knowledge.
            </p>
          </div>
        ) : !hasSnippets ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">
              No knowledge saved yet
            </h3>
            <p className="text-xs text-muted-foreground max-w-[220px]">
              Save some snippets first, then you can chat with your knowledge vault.
            </p>
          </div>
        ) : isLoadingMessages ? (
          <div className="space-y-4 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-16 flex-1 rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <ScrollArea className="h-[300px]" ref={scrollRef}>
            <div className="space-y-4 p-4">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Ask a question about your saved knowledge...
                </div>
              ) : (
                messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    role={message.role}
                    content={message.content}
                    citations={message.citations}
                    provider={message.provider}
                  />
                ))
              )}
              {streamingContent && (
                <ChatMessage
                  role="assistant"
                  content={streamingContent}
                  provider={streamingProvider}
                  isStreaming
                />
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Chat input */}
      <ChatInput
        onSend={onSendMessage}
        isLoading={isSending}
        disabled={!activeThreadId || !hasSnippets}
      />
    </div>
  );
}
