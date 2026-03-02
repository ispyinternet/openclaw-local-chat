export { };

declare global {
  interface ChatDesktopSession {
    id: string;
    name: string;
    channel: string;
    preview: string;
    unread: number;
    chip: string;
    status: string;
  }

  interface ChatDesktopSection {
    id: string;
    title: string;
    sessions: ChatDesktopSession[];
  }

  interface ChatDesktopMessage {
    id: string;
    role: string;
    author: string;
    timestamp: string;
    content: string;
    reactions?: string[];
    meta?: { pill: string; detail: string };
  }

  interface ChatDesktopSearchResult {
    id: string;
    sessionId: string;
    sessionName: string;
    sessionChannel: string;
    author: string;
    role: string;
    timestamp: string;
    snippet: string;
  }

  interface Window {
    chatDesktop?: {
      getAppMeta: () => Promise<{ version: string; platform: string }>;
      data: {
        getInitialState: () => Promise<{ sections: ChatDesktopSection[]; selectedSessionId: string | null; messages: ChatDesktopMessage[] }>;
        getMessages: (sessionId: string) => Promise<ChatDesktopMessage[]>;
        searchMessages: (query: string) => Promise<ChatDesktopSearchResult[]>;
      };
    };
  }
}
