import { useState, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

interface Citation {
  id: string;
  text: string;
  sourceUrl: string;
  sourceDomain: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export function useChat(threadId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/threads/${id}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }, []);

  const sendMessage = useCallback(async (query: string) => {
    if (!threadId || isSending) return;

    setIsSending(true);
    
    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: query,
    };
    setMessages((prev) => [...prev, userMessage]);
    setStreamingContent("");

    try {
      // Get preferred provider from localStorage if not specified in thread
      // Note: backend will default if we send nothing, but we prefer local override
      const savedProvider = localStorage.getItem("ai_provider") || undefined;
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          threadId, 
          query,
          provider: savedProvider 
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let citations: Citation[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.content) {
                fullContent += data.content;
                setStreamingContent(fullContent);
              }
              
              if (data.citations) {
                citations = data.citations;
              }
              
              if (data.done) {
                // Finalize the assistant message
                const assistantMessage: ChatMessage = {
                  id: `assistant-${Date.now()}`,
                  role: "assistant",
                  content: fullContent,
                  citations,
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingContent("");
              }
              
              if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I couldn't process your request. Please try again.",
        },
      ]);
    } finally {
      setIsSending(false);
      setStreamingContent("");
      // Invalidate thread to refresh messages
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId] });
    }
  }, [threadId, isSending]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent("");
  }, []);

  return {
    messages,
    streamingContent,
    isSending,
    sendMessage,
    loadMessages,
    clearMessages,
  };
}
