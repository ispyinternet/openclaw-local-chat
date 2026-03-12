<script>
  import { onMount, tick } from 'svelte';
  import seedData from '../shared/initial-data.json';

  let gateway = {
    name: 'Local Gateway',
    endpoint: 'http://localhost:4111',
    status: 'degraded',
    heartbeat: 'Never',
    mode: 'Live'
  };

  let routingAgentId = 'main';
  let routingAgentDisplayName = 'Primary';
  let routingSaving = false;
  let availableAgents = [];
  let agentsLoading = false;

  const runs = [
    {
      id: 'run-7b1a',
      title: 'Run 7b1a · slack skill',
      status: 'Streaming',
      lines: ['POST /slack.chat.postMessage', 'Wrote preview attachment (2.1 kB)', 'Waiting for ack…']
    },
    {
      id: 'run-7af9',
      title: 'Run 7af9 · browser',
      status: 'Complete',
      lines: ['Visited figma.com/file/98231', 'Captured 3 layers', 'Saved bundle → /tmp/figma-export.zip']
    }
  ];

  const files = [
    { name: 'issue-02-wireframe.png', size: '412 kB', path: '~/Desktop/export/issue-02', type: 'image' },
    { name: 'desktop-shell.json', size: '9.8 kB', path: '~/Desktop/export/issue-02', type: 'json' }
  ];

  const tasks = [
    { label: 'Build desktop shell scaffold', status: 'in-progress' },
    { label: 'Wire composer to gateway', status: 'blocked' },
    { label: 'Document keyboard map', status: 'todo' }
  ];

  const rightTabs = [
    { id: 'context', label: 'Context' },
    { id: 'runs', label: 'Runs' },
    { id: 'files', label: 'Files' },
    { id: 'tasks', label: 'Tasks' }
  ];

  const statusPills = {
    online: { label: 'Online', tone: 'positive' },
    offline: { label: 'Offline', tone: 'critical' },
    degraded: { label: 'Degraded', tone: 'warning' }
  };

  let sections = buildSectionsFromSeed();
  let selectedSessionId = sections[0]?.sessions[0]?.id ?? null;
  let messages = buildMessagesFromSeed(selectedSessionId);
  maybeHydrateChatTitleFromMessages(selectedSessionId, messages);
  let selectedSession = findSession(selectedSessionId);
  let activeRightTab = 'context';
  let composerValue = '';
  let sessionDrafts = {};
  let loading = true;
  let errorMessage = '';
  let searchQuery = '';
  let searchResults = [];
  let searchStatus = 'idle';
  let searchError = '';
  let highlightedMessageId = null;
  let searchDebounce;
  let highlightTimeout;
  let draftPersistTimer;
  let showSettings = false;
  let sideRailOpen = true;
  let settingsSaving = false;
  let resettingData = false;
  let sendingMessage = false;
  let searchInputEl;
  let appMeta = { version: '0.0.0', platform: 'unknown' };
  let preferences = { gatewayUrl: 'http://localhost:4111', theme: 'system' };
  let syncInFlight = false;
  let lastSyncedAt = null;
  let heartbeatTimer;

  const chatDesktop = typeof window !== 'undefined' ? window.chatDesktop : undefined;
  const dataClient = chatDesktop?.data;

  onMount(async () => {
    const removeKeydown = bindKeyboardShortcuts();
    await Promise.all([
      hydrateFromDatabase(),
      hydrateAppMeta(),
      hydratePreferences(),
      hydrateComposerDrafts(),
      hydrateAvailableAgents()
    ]);
    await hydrateGatewaySessions({ silentError: true });
    heartbeatTimer = setInterval(() => {
      refreshHeartbeatLabel();
      void hydrateGatewaySessions({ silentError: true });
    }, 30000);

    return () => {
      if (searchDebounce) clearTimeout(searchDebounce);
      if (highlightTimeout) clearTimeout(highlightTimeout);
      if (draftPersistTimer) clearTimeout(draftPersistTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      removeKeydown?.();
    };
  });

  async function hydrateFromDatabase() {
    if (!dataClient) {
      loading = false;
      return;
    }

    try {
      const payload = await dataClient.getInitialState();
      sections = payload.sections.length ? payload.sections : buildSectionsFromSeed();
      selectedSessionId = payload.selectedSessionId ?? sections[0]?.sessions[0]?.id ?? null;
      messages = payload.messages?.length ? payload.messages : buildMessagesFromSeed(selectedSessionId);
      selectedSession = findSession(selectedSessionId);
      restoreDraftForSession(selectedSessionId);
      maybeHydrateChatTitleFromMessages(selectedSessionId, messages);
    } catch (error) {
      console.error('Failed to read persisted conversations', error);
      errorMessage = 'Unable to open the stored SQLite cache. Showing demo data instead.';
      sections = buildSectionsFromSeed();
      selectedSessionId = sections[0]?.sessions[0]?.id ?? null;
      messages = buildMessagesFromSeed(selectedSessionId);
      restoreDraftForSession(selectedSessionId);
      maybeHydrateChatTitleFromMessages(selectedSessionId, messages);
    } finally {
      loading = false;
    }
  }

  async function hydrateAppMeta() {
    if (!chatDesktop?.getAppMeta) return;
    try {
      appMeta = await chatDesktop.getAppMeta();
    } catch (error) {
      console.error('Unable to load app metadata', error);
    }
  }

  async function hydratePreferences() {
    if (!chatDesktop?.settings?.get) {
      applyTheme(preferences.theme);
      gateway = { ...gateway, endpoint: preferences.gatewayUrl };
      return;
    }

    try {
      preferences = await chatDesktop.settings.get();
      gateway = { ...gateway, endpoint: preferences.gatewayUrl };
      applyTheme(preferences.theme);
    } catch (error) {
      console.error('Unable to load preferences', error);
      applyTheme(preferences.theme);
    }
  }

  async function hydrateComposerDrafts() {
    if (!dataClient?.getComposerDrafts) return;

    try {
      sessionDrafts = await dataClient.getComposerDrafts();
      restoreDraftForSession(selectedSessionId);
    } catch (error) {
      console.error('Unable to load composer drafts', error);
    }
  }

  async function hydrateAvailableAgents() {
    agentsLoading = true;

    if (!dataClient?.listAgents) {
      availableAgents = [{ id: 'main', displayName: 'Primary', model: '' }];
      agentsLoading = false;
      return;
    }

    try {
      const rows = await dataClient.listAgents();
      if (Array.isArray(rows) && rows.length) {
        availableAgents = rows;
      } else {
        availableAgents = [{ id: 'main', displayName: 'Primary', model: '' }];
      }
    } catch (error) {
      console.error('Unable to load agents list', error);
      availableAgents = [{ id: 'main', displayName: 'Primary', model: '' }];
    } finally {
      agentsLoading = false;
    }
  }

  async function hydrateGatewaySessions({ silentError = false } = {}) {
    if (!dataClient?.syncGatewaySessions || syncInFlight) return;

    syncInFlight = true;
    try {
      const nextSections = await dataClient.syncGatewaySessions();
      if (Array.isArray(nextSections) && nextSections.length) {
        sections = nextSections;

        const activeExists = sections.some((section) =>
          section.sessions.some((session) => session.id === selectedSessionId)
        );

        if (!activeExists) {
          selectedSessionId = sections[0]?.sessions[0]?.id ?? null;
        }

        selectedSession = findSession(selectedSessionId);
        restoreDraftForSession(selectedSessionId);

        if (selectedSessionId) {
          const client = dataClient ?? fallbackAdapter;
          messages = await client.getMessages(selectedSessionId);
          maybeHydrateChatTitleFromMessages(selectedSessionId, messages);
        } else {
          messages = [];
        }
      }

      lastSyncedAt = new Date();
      gateway = { ...gateway, status: 'online' };
      refreshHeartbeatLabel();
      if (!silentError) {
        errorMessage = '';
      }
    } catch (error) {
      console.error('Unable to sync gateway sessions', error);
      gateway = { ...gateway, status: 'offline' };
      if (!silentError) {
        errorMessage = error?.message || 'Unable to sync gateway chats.';
      }
    } finally {
      syncInFlight = false;
    }
  }

  function refreshHeartbeatLabel() {
    if (!lastSyncedAt) {
      gateway = { ...gateway, heartbeat: 'Never' };
      return;
    }

    const seconds = Math.max(0, Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000));
    if (seconds < 60) {
      gateway = { ...gateway, heartbeat: `${seconds}s ago` };
      return;
    }

    const minutes = Math.floor(seconds / 60);
    gateway = { ...gateway, heartbeat: `${minutes}m ago` };
  }

  async function openLogsFolder() {
    if (!chatDesktop?.openLogs) return;
    try {
      await chatDesktop.openLogs();
    } catch (error) {
      console.error('Unable to open logs folder', error);
      errorMessage = 'Failed to open logs folder.';
    }
  }

  async function retryGatewaySync() {
    await hydrateGatewaySessions();
  }

  function applyTheme(theme) {
    if (typeof document === 'undefined') return;
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.dataset.theme = resolved;
  }

  async function saveSettings() {
    if (!chatDesktop?.settings?.set) return;
    settingsSaving = true;
    try {
      preferences = await chatDesktop.settings.set(preferences);
      gateway = { ...gateway, endpoint: preferences.gatewayUrl };
      applyTheme(preferences.theme);
      showSettings = false;
    } catch (error) {
      console.error('Unable to save settings', error);
      errorMessage = 'Failed to save settings.';
    } finally {
      settingsSaving = false;
    }
  }

  async function resetLocalData() {
    if (!dataClient?.reset || resettingData) return;
    resettingData = true;
    try {
      const payload = await dataClient.reset();
      sections = payload.sections;
      selectedSessionId = payload.selectedSessionId;
      messages = payload.messages;
      selectedSession = findSession(selectedSessionId);
      sessionDrafts = {};
      queuePersistDrafts();
      restoreDraftForSession(selectedSessionId);
      maybeHydrateChatTitleFromMessages(selectedSessionId, messages);
      errorMessage = '';
      searchQuery = '';
      searchResults = [];
      showSettings = false;
    } catch (error) {
      console.error('Unable to reset local data', error);
      errorMessage = 'Failed to reset local data.';
    } finally {
      resettingData = false;
    }
  }

  async function selectSession(sessionId) {
    if (!sessionId || sessionId === selectedSessionId) {
      return;
    }

    persistDraftForSession(selectedSessionId, composerValue);
    selectedSessionId = sessionId;
    selectedSession = findSession(sessionId);
    syncRoutingDraftFromSession(selectedSession);
    try {
      const client = dataClient ?? fallbackAdapter;
      messages = await client.getMessages(sessionId);
      maybeHydrateChatTitleFromMessages(sessionId, messages);
    } catch (error) {
      console.error('Failed to load messages', error);
      errorMessage = 'Unable to load messages for that chat. Showing offline data if available.';
      messages = buildMessagesFromSeed(sessionId);
      maybeHydrateChatTitleFromMessages(sessionId, messages);
    }

    searchQuery = '';
    searchResults = [];
    highlightedMessageId = null;
    restoreDraftForSession(sessionId);
  }

  function syncRoutingDraftFromSession(session) {
    routingAgentId = session?.agentId || 'main';
    routingAgentDisplayName = session?.agentDisplayName || 'Primary';
  }

  async function saveSessionRouting() {
    if (!selectedSessionId || !dataClient?.setSessionAgent || routingSaving) return;

    routingSaving = true;
    errorMessage = '';

    const matchingAgent = availableAgents.find((agent) => agent.id === normalizedRoutingAgentId);

    try {
      const updated = await dataClient.setSessionAgent({
        sessionId: selectedSessionId,
        agentId: normalizedRoutingAgentId,
        agentDisplayName: normalizedRoutingDisplayName || matchingAgent?.displayName || normalizedRoutingAgentId
      });

      sections = sections.map((section) => ({
        ...section,
        sessions: section.sessions.map((session) => (
          session.id === selectedSessionId
            ? {
              ...session,
              agentId: updated?.agentId || normalizedRoutingAgentId,
              agentDisplayName: updated?.agentDisplayName || normalizedRoutingDisplayName
            }
            : session
        ))
      }));
    } catch (error) {
      console.error('Unable to save chat routing', error);
      errorMessage = 'Failed to save chat routing.';
    } finally {
      routingSaving = false;
    }
  }

  function generateChatTitle(input) {
    const trimmed = typeof input === 'string' ? input.trim() : '';
    return trimmed ? trimmed.slice(0, 72) : 'New chat';
  }

  function isUntitledChat(name) {
    const normalized = typeof name === 'string' ? name.trim().toLowerCase() : '';
    return !normalized || normalized === 'new chat';
  }

  function updateSessionTitle(sessionId, messageContent) {
    const generatedTitle = generateChatTitle(messageContent);
    sections = sections.map((section) => {
      const hasSession = section.sessions.some((session) => session.id === sessionId);
      if (!hasSession) return section;

      const nextSessions = section.sessions.map((session) => (
        session.id === sessionId && isUntitledChat(session.name)
          ? { ...session, name: generatedTitle }
          : session
      ));

      return { ...section, sessions: nextSessions };
    });
  }

  function updateSessionPreview(sessionId, preview) {
    sections = sections.map((section) => {
      const hasSession = section.sessions.some((session) => session.id === sessionId);
      if (!hasSession) return section;

      const nextSessions = section.sessions.map((session) => (
        session.id === sessionId
          ? { ...session, preview: preview.slice(0, 160) }
          : session
      ));

      return { ...section, sessions: nextSessions };
    });
  }

  function deriveChatTitleFromMessages(messageList = []) {
    if (!Array.isArray(messageList)) {
      return null;
    }

    const firstUserMessage = messageList.find(
      (message) =>
        message &&
        typeof message.content === 'string' &&
        message.content.trim() &&
        typeof message.role === 'string' &&
        message.role.toLowerCase() === 'user'
    );

    return firstUserMessage ? generateChatTitle(firstUserMessage.content) : null;
  }

  function maybeHydrateChatTitleFromMessages(sessionId, messageList) {
    if (!sessionId || !Array.isArray(messageList) || !messageList.length) {
      return;
    }

    const session = findSession(sessionId);
    if (!session || !isUntitledChat(session.name)) {
      return;
    }

    const generatedTitle = deriveChatTitleFromMessages(messageList);
    if (!generatedTitle) {
      return;
    }

    updateSessionTitle(sessionId, generatedTitle);
  }

  async function sendCurrentMessage() {
    const content = composerValue.trim();
    if (!selectedSessionId || !content || sendingMessage) return;

    if (isGatewaySessionId(selectedSessionId) && gateway.status === 'offline') {
      errorMessage = 'Gateway is offline. Reconnect or sync chats before sending.';
      return;
    }

    sendingMessage = true;
    errorMessage = '';

    try {
      const client = dataClient ?? fallbackAdapter;
      const delivery = await client.sendMessage({
        sessionId: selectedSessionId,
        content,
        role: 'user',
        author: 'Operator'
      });

      const outgoing = delivery?.userMessage ?? delivery;
      const incoming = delivery?.assistantMessage;
      messages = incoming ? [...messages, outgoing, incoming] : [...messages, outgoing];
      composerValue = '';
      persistDraftForSession(selectedSessionId, '');
      updateSessionTitle(selectedSessionId, content);
      updateSessionPreview(selectedSessionId, incoming?.content || content);
      await tick();
      highlightMessage((incoming || outgoing)?.id);
    } catch (error) {
      console.error('Failed to send message', error);
      errorMessage = 'Unable to send message right now.';
    } finally {
      sendingMessage = false;
    }
  }

  function handleComposerInput(event) {
    const nextValue = event.currentTarget.value;
    composerValue = nextValue;
    persistDraftForSession(selectedSessionId, nextValue);
  }

  function queuePersistDrafts() {
    if (!dataClient?.setComposerDrafts) return;
    if (draftPersistTimer) {
      clearTimeout(draftPersistTimer);
    }

    draftPersistTimer = setTimeout(async () => {
      try {
        await dataClient.setComposerDrafts(sessionDrafts);
      } catch (error) {
        console.error('Unable to persist composer drafts', error);
      }
    }, 200);
  }

  function persistDraftForSession(sessionId, value) {
    if (!sessionId) return;
    const nextValue = value ?? '';
    if (!nextValue.trim()) {
      const { [sessionId]: _removed, ...rest } = sessionDrafts;
      sessionDrafts = rest;
      queuePersistDrafts();
      return;
    }

    sessionDrafts = {
      ...sessionDrafts,
      [sessionId]: nextValue
    };
    queuePersistDrafts();
  }

  function restoreDraftForSession(sessionId) {
    composerValue = sessionId ? (sessionDrafts[sessionId] ?? '') : '';
  }

  function handleComposerKeydown(event) {
    const isSubmit = event.key === 'Enter' && (event.metaKey || event.ctrlKey);
    if (!isSubmit) return;
    event.preventDefault();
    sendCurrentMessage();
  }

  function focusSearchInput() {
    if (!searchInputEl) return;
    searchInputEl.focus();
    searchInputEl.select();
  }

  function selectAdjacentSession(direction = 1) {
    const allSessions = sections.flatMap((section) => section.sessions);
    if (!allSessions.length) return;

    const currentIndex = allSessions.findIndex((session) => session.id === selectedSessionId);
    const startIndex = currentIndex === -1 ? 0 : currentIndex;
    const wrappedIndex = (startIndex + direction + allSessions.length) % allSessions.length;
    const target = allSessions[wrappedIndex];
    if (target?.id) {
      void selectSession(target.id);
    }
  }

  function bindKeyboardShortcuts() {
    if (typeof window === 'undefined') return null;

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        if (showSettings) {
          event.preventDefault();
          showSettings = false;
          return;
        }

        if (sideRailOpen) {
          event.preventDefault();
          sideRailOpen = false;
        }
        return;
      }

      const hasPrimaryModifier = event.metaKey || event.ctrlKey;
      if (!hasPrimaryModifier) return;

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearchInput();
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        focusSearchInput();
        return;
      }

      if (event.shiftKey && event.key === '[') {
        event.preventDefault();
        selectAdjacentSession(-1);
        return;
      }

      if (event.shiftKey && event.key === ']') {
        event.preventDefault();
        selectAdjacentSession(1);
      }
    };

    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }

  function buildSectionsFromSeed() {
    return seedData.sections.map((section) => ({
      id: section.id,
      title: section.title,
      sessions: seedData.sessions.filter((session) => session.groupId === section.id)
    }));
  }

  function buildMessagesFromSeed(sessionId) {
    return seedData.messages
      .filter((message) => (sessionId ? message.sessionId === sessionId : true))
      .map(adaptSeedMessage);
  }

  function adaptSeedMessage(message) {
    return {
      id: message.id,
      role: message.role,
      author: message.author,
      timestamp: message.timestamp,
      content: message.content,
      reactions: message.reactions ? message.reactions.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
      meta: message.meta_pill ? { pill: message.meta_pill, detail: message.meta_detail ?? '' } : undefined
    };
  }

  function isGatewaySessionId(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
  }

  function findSession(id) {
    if (!id) return null;
    for (const section of sections) {
      const match = section.sessions.find((session) => session.id === id);
      if (match) return match;
    }
    return null;
  }

  const fallbackAdapter = {
    async getInitialState() {
      const fallbackSections = buildSectionsFromSeed();
      const fallbackSessionId = fallbackSections[0]?.sessions[0]?.id ?? null;
      return {
        sections: fallbackSections,
        selectedSessionId: fallbackSessionId,
        messages: buildMessagesFromSeed(fallbackSessionId)
      };
    },
    async getMessages(sessionId) {
      return buildMessagesFromSeed(sessionId);
    },
    async sendMessage(payload) {
      const now = new Date();
      const timestamp = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/London'
      }).format(now);

      return {
        id: `local-${now.getTime()}`,
        role: payload.role ?? 'user',
        author: payload.author ?? 'Operator',
        timestamp,
        content: payload.content
      };
    },
    async searchMessages(query) {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return [];
      return seedData.messages
        .filter((message) => message.content.toLowerCase().includes(normalized))
        .map((message) => {
          const session = seedData.sessions.find((session) => session.id === message.sessionId);
          return {
            id: message.id,
            sessionId: message.sessionId,
            sessionName: session?.name ?? 'Chat',
            sessionChannel: session?.channel ?? 'Channel',
            author: message.author,
            role: message.role,
            timestamp: message.timestamp,
            snippet: buildHighlightedSnippet(message.content, normalized)
          };
        });
    }
  };

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
  }

  function buildHighlightedSnippet(content, query) {
    const lower = content.toLowerCase();
    const index = lower.indexOf(query);
    if (index === -1) {
      return escapeHtml(content);
    }
    const radius = 32;
    const start = Math.max(0, index - radius);
    const end = Math.min(content.length, index + query.length + radius);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < content.length ? '…' : '';
    const segment = content.slice(start, end);
    const safeSegment = escapeHtml(segment);
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return `${prefix}${safeSegment.replace(pattern, (match) => `<mark>${match}</mark>`)}${suffix}`;
  }

  function handleSearchInput(event) {
    searchQuery = event.currentTarget.value;
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }
    searchDebounce = setTimeout(runSearch, 200);
  }

  async function runSearch() {
    if (!searchQuery.trim()) {
      searchResults = [];
      searchError = '';
      return;
    }

    searchStatus = 'loading';
    searchError = '';
    const client = dataClient ?? fallbackAdapter;
    try {
      searchResults = await client.searchMessages(searchQuery);
    } catch (error) {
      console.error('Search failed', error);
      searchError = 'Unable to search messages right now.';
      searchResults = [];
    } finally {
      searchStatus = 'idle';
    }
  }

  async function jumpToSearchResult(result) {
    await selectSession(result.sessionId);
    await tick();
    highlightMessage(result.id);
  }

  function highlightMessage(messageId) {
    if (!messageId) return;
    highlightedMessageId = messageId;
    if (highlightTimeout) {
      clearTimeout(highlightTimeout);
    }
    highlightTimeout = setTimeout(() => {
      highlightedMessageId = null;
    }, 4000);

    if (typeof document === 'undefined') return;
    const selector = `[data-message-id="${cssEscape(messageId)}"]`;
    const node = document.querySelector(selector);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  $: selectedSession = findSession(selectedSessionId);
  $: syncRoutingDraftFromSession(selectedSession);
  $: normalizedRoutingAgentId = (routingAgentId || '').trim() || 'main';
  $: normalizedRoutingDisplayName = (routingAgentDisplayName || '').trim() || normalizedRoutingAgentId;
  $: routingDirty = Boolean(selectedSession) && (
    normalizedRoutingAgentId !== (selectedSession?.agentId || 'main') ||
    normalizedRoutingDisplayName !== (selectedSession?.agentDisplayName || 'Primary')
  );
  $: selectedSessionIsGateway = isGatewaySessionId(selectedSessionId);
  $: sendDisabled = !composerValue.trim() || sendingMessage || (selectedSessionIsGateway && gateway.status === 'offline');
  $: composerGatewayStatus = selectedSessionIsGateway
    ? (gateway.status === 'offline' ? 'Gateway offline' : `Gateway ${gateway.status}`)
    : 'Local chat';
  $: contextItems = [
    { label: 'Channel', value: selectedSession?.channel || 'Unknown' },
    { label: 'Chat ID', value: selectedSession?.id || '—' },
    {
      label: 'Routing',
      value: `${selectedSession?.agentDisplayName || 'Primary'} · ${selectedSession?.agentId || 'main'}`
    },
    { label: 'Safety', value: selectedSessionIsGateway ? 'Live · gateway' : 'Local cache' },
    { label: 'Last activity', value: selectedSession?.lastMessageAt || 'Unknown' }
  ];
</script>

<div class="app-frame">
  <header class="top-bar">
    <div class="gateway">
      <div>
        <p class="eyebrow">Gateway</p>
        <strong>{gateway.name}</strong>
      </div>
      <div class="gateway-meta">
        <span class={`pill ${statusPills[gateway.status].tone}`}>{statusPills[gateway.status].label}</span>
        <span class="meta">{gateway.endpoint}</span>
        <span class="meta">Last heartbeat · {gateway.heartbeat}</span>
      </div>
    </div>
    <div class="top-actions">
      <button class="ghost" on:click={() => (showSettings = true)}>Settings</button>
      <button class="ghost" on:click={openLogsFolder}>Open logs</button>
      <button class="primary" on:click={() => hydrateGatewaySessions()} disabled={syncInFlight}>
        {syncInFlight ? 'Syncing…' : 'Sync chats'}
      </button>
    </div>
  </header>

  <div class={`shell-grid ${sideRailOpen ? '' : 'rail-collapsed'}`}>
    <aside class="chat-rail" aria-label="Chat list">
      {#each sections as section}
        <div class="chat-section">
          <p class="section-label">{section.title}</p>
          {#each section.sessions as session}
            <button
              class={`chat-tile ${session.id === selectedSessionId ? 'active' : ''}`}
              on:click={() => selectSession(session.id)}
            >
              <div class="tile-main">
                <div>
                  <div class="name-row">
                    <span class="name">{session.name}</span>
                    {#if session.unread}
                      <span class="badge">{session.unread}</span>
                    {/if}
                  </div>
                  <p class="preview">{session.preview}</p>
                </div>
                <span class={`chip ${session.chip}`}>{session.channel}</span>
              </div>
              <span class={`status-dot ${session.status}`}></span>
            </button>
          {/each}
        </div>
      {/each}
    </aside>

    <section class="timeline-area" aria-label="Conversation timeline">
      <header class="timeline-header">
        <div>
          <p class="eyebrow">Current chat</p>
          <h2>{selectedSession?.name ?? 'Chat'}</h2>
        </div>
        <div class="timeline-actions">
          <input
            class="search-input"
            type="search"
            aria-label="Search messages"
            placeholder="Search messages"
            value={searchQuery}
            bind:this={searchInputEl}
            on:input={handleSearchInput}
          />
          <button class="ghost" on:click={focusSearchInput}>Jump ⌘K</button>
          <button class="ghost" on:click={() => (sideRailOpen = !sideRailOpen)}>
            {sideRailOpen ? 'Hide panel' : 'Show panel'}
          </button>
        </div>
      </header>

      {#if searchQuery.trim()}
        <section class="search-results" aria-live="polite">
          {#if searchStatus === 'loading'}
            <p class="meta">Searching “{searchQuery}”…</p>
          {:else if searchError}
            <p class="meta error">{searchError}</p>
          {:else if !searchResults.length}
            <p class="meta">No matches for “{searchQuery}”.</p>
          {:else}
            {#each searchResults as result}
              <button class="search-hit" on:click={() => jumpToSearchResult(result)}>
                <span class="hit-chat">{result.sessionName} · {result.sessionChannel}</span>
                <span class="hit-excerpt" aria-label={`Snippet from ${result.author}`}>
                  {@html result.snippet}
                </span>
                <span class="hit-meta">{result.author} · {result.timestamp}</span>
              </button>
            {/each}
          {/if}
        </section>
      {/if}

      {#if errorMessage}
        <div class="inline-banner">
          <span>{errorMessage}</span>
          {#if dataClient?.syncGatewaySessions}
            <button class="ghost" on:click={retryGatewaySync} disabled={syncInFlight}>
              {syncInFlight ? 'Retrying…' : 'Retry sync'}
            </button>
          {/if}
        </div>
      {/if}

      {#if loading}
        <div class="loading-state">Loading conversation…</div>
      {:else if !messages.length}
        <div class="empty-state">No messages in this chat yet.</div>
      {:else}
        <div class="message-list">
          {#each messages as message}
            <article
              class={`message-card ${message.role} ${message.id === highlightedMessageId ? 'highlight' : ''}`}
              data-message-id={message.id}
            >
              <header>
                <div>
                  <span class="author">{message.author}</span>
                  <span class="timestamp">{message.timestamp}</span>
                </div>
                {#if message.meta}
                  <span class={`pill subtle ${message.meta.pill}`}>{message.meta.detail}</span>
                {/if}
              </header>
              <pre>{message.content}</pre>
              {#if message.reactions}
                <div class="reactions">
                  {#each message.reactions as reaction}
                    <span>{reaction}</span>
                  {/each}
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/if}

      <footer class="composer" aria-label="Message composer">
        <div class="composer-row">
          <textarea
            placeholder="Write a message, /command, or paste logs"
            value={composerValue}
            rows="2"
            on:input={handleComposerInput}
            on:keydown={handleComposerKeydown}
          ></textarea>
          <div class="composer-controls">
            <button class="ghost" title="Add attachment">Attach</button>
            <button class="ghost" title="Insert macro">Macros</button>
            <button class="primary" on:click={sendCurrentMessage} disabled={sendDisabled}>
              {sendingMessage ? 'Sending…' : 'Send ⌘⏎'}
            </button>
          </div>
        </div>
        <div class="composer-meta">
          <span class="meta">Send as · Operator</span>
          <span class="meta">{composerGatewayStatus}</span>
        </div>
      </footer>
    </section>

    {#if sideRailOpen}
      <aside class="side-rail" aria-label="Chat context">
        <div class="tab-strip">
          {#each rightTabs as tab}
            <button
              class={tab.id === activeRightTab ? 'active' : ''}
              on:click={() => (activeRightTab = tab.id)}
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <div class="tab-body">
          {#if activeRightTab === 'context'}
            <dl class="context-grid">
              {#each contextItems as item}
                <div>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              {/each}
            </dl>
            {#if selectedSession}
              <div class="routing-form">
                <label>
                  <span>Agent display name</span>
                  <input type="text" bind:value={routingAgentDisplayName} placeholder="Primary" />
                </label>
                <label>
                  <span>Agent ID</span>
                  <input type="text" bind:value={routingAgentId} placeholder="main" list="agent-id-suggestions" />
                </label>
                <datalist id="agent-id-suggestions">
                  {#each availableAgents as agent}
                    <option value={agent.id}>{agent.displayName}</option>
                  {/each}
                </datalist>
                {#if availableAgents.length}
                  <p class="meta">Available agents: {availableAgents.map((agent) => agent.id).join(', ')}</p>
                {/if}
                <div class="composer-controls">
                  <button class="ghost" on:click={() => hydrateAvailableAgents()} disabled={agentsLoading}>
                    {agentsLoading ? 'Refreshing…' : 'Refresh agents'}
                  </button>
                  <button
                    class="ghost"
                    on:click={() => syncRoutingDraftFromSession(selectedSession)}
                    disabled={!routingDirty || routingSaving}
                  >
                    Revert
                  </button>
                  <button class="primary" on:click={saveSessionRouting} disabled={routingSaving || !routingDirty}>
                    {routingSaving ? 'Saving…' : 'Save routing'}
                  </button>
                </div>
              </div>
            {/if}
          {:else if activeRightTab === 'runs'}
            <div class="runs-stack">
              {#each runs as run}
                <section class="run-card">
                  <header>
                    <strong>{run.title}</strong>
                    <span class="meta">{run.status}</span>
                  </header>
                  <pre>
{run.lines.join('\n')}
                  </pre>
                </section>
              {/each}
            </div>
          {:else if activeRightTab === 'files'}
            <ul class="file-list">
              {#each files as file}
                <li>
                  <div>
                    <strong>{file.name}</strong>
                    <span class="meta">{file.size} · {file.type}</span>
                  </div>
                  <span class="path">{file.path}</span>
                </li>
              {/each}
            </ul>
          {:else if activeRightTab === 'tasks'}
            <ul class="task-list">
              {#each tasks as task}
                <li>
                  <span class={`pill subtle ${task.status}`}>{task.status.replace('-', ' ')}</span>
                  <p>{task.label}</p>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </aside>
    {/if}
  </div>

  {#if showSettings}
    <div
      class="settings-backdrop"
      role="presentation"
      on:click={(event) => {
        if (event.target === event.currentTarget) showSettings = false;
      }}
    >
      <div class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <header>
          <h3>Settings</h3>
          <button class="ghost" on:click={() => (showSettings = false)}>Close</button>
        </header>

        <label class="settings-field">
          <span>OpenClaw gateway URL</span>
          <input type="url" bind:value={preferences.gatewayUrl} placeholder="http://localhost:4111" />
        </label>

        <label class="settings-field">
          <span>Theme</span>
          <select bind:value={preferences.theme}>
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <div class="settings-actions">
          <button class="ghost danger" on:click={resetLocalData} disabled={resettingData}>
            {resettingData ? 'Resetting…' : 'Reset local cache'}
          </button>
          <button class="primary" on:click={saveSettings} disabled={settingsSaving}>
            {settingsSaving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <footer class="about-meta">
          <strong>About</strong>
          <span class="meta">Version {appMeta.version} · {appMeta.platform}</span>
        </footer>
      </div>
    </div>
  {/if}
</div>
