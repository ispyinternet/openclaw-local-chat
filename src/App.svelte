<script>
  const gateway = {
    name: 'Local Gateway',
    endpoint: 'http://localhost:4111',
    status: 'online',
    heartbeat: '13s ago',
    mode: 'Live',
  }

  const sections = [
    {
      title: 'Pins',
      sessions: [
        {
          id: 'alpha',
          name: 'Richard · Direct',
          channel: 'Slack DM',
          preview: 'Tool run finished · 2 attachments',
          unread: 3,
          chip: 'tool',
          status: 'live',
        },
      ],
    },
    {
      title: 'Active',
      sessions: [
        {
          id: 'ops-alerts',
          name: '#ops-alerts',
          channel: 'Slack',
          preview: 'Agent acknowledged incident-482',
          unread: 0,
          chip: 'alert',
          status: 'live',
        },
        {
          id: 'design-handoff',
          name: 'Design Handoff',
          channel: 'Telegram',
          preview: 'You: pushing desktop shell tonight',
          unread: 0,
          chip: 'dm',
          status: 'idle',
        },
      ],
    },
    {
      title: 'Recent',
      sessions: [
        {
          id: 'cron-heartbeat',
          name: 'Cron · Heartbeat',
          channel: 'System',
          preview: 'No drift detected in last 24h',
          unread: 0,
          chip: 'system',
          status: 'muted',
        },
        {
          id: 'node-lab',
          name: 'Node · Lab NUC',
          channel: 'Node',
          preview: 'Screen share ended — 17:21',
          unread: 5,
          chip: 'node',
          status: 'live',
        },
      ],
    },
  ]

  const selectedSession = sections[0].sessions[0]

  const messages = [
    {
      id: 1,
      role: 'system',
      author: 'Gateway',
      timestamp: '13:02',
      content: 'Run 7b1a kicked off · skill `slack` · expecting 2 tool calls.',
      meta: { pill: 'run', detail: 'Queued' },
    },
    {
      id: 2,
      role: 'agent',
      author: 'OpenClaw',
      timestamp: '13:03',
      content:
        'Pulled the latest figma handoff. Need confirmation on button radius before publishing desktop shell. Can you review the spec in `/docs/issue-02`?',
      reactions: ['👀', '👍'],
    },
    {
      id: 3,
      role: 'tool',
      author: 'Browser Tool',
      timestamp: '13:04',
      content:
        'GET https://figma.com/file/98231 spec → 200 OK (642ms)\nExtracted assets → stored at `~/Desktop/export/issue-02`',
      meta: { pill: 'log', detail: 'Streaming' },
    },
    {
      id: 4,
      role: 'user',
      author: 'You',
      timestamp: '13:05',
      content: 'Looks good. Proceed with the desktop shell stub and show me the layout once the wiring is ready.',
    },
  ]

  const contextItems = [
    { label: 'Channel', value: 'Slack DM' },
    { label: 'Session ID', value: 'sess_23ff901' },
    { label: 'Routing', value: 'Primary agent · tools:on' },
    { label: 'Safety', value: 'Live · elevated' },
    { label: 'Last activity', value: '13:05 GMT' },
  ]

  const runs = [
    {
      id: 'run-7b1a',
      title: 'Run 7b1a · slack skill',
      status: 'Streaming',
      lines: [
        'POST /slack.chat.postMessage',
        'Wrote preview attachment (2.1 kB)',
        'Waiting for ack…',
      ],
    },
    {
      id: 'run-7af9',
      title: 'Run 7af9 · browser',
      status: 'Complete',
      lines: ['Visited figma.com/file/98231', 'Captured 3 layers', 'Saved bundle → /tmp/figma-export.zip'],
    },
  ]

  const files = [
    { name: 'issue-02-wireframe.png', size: '412 kB', path: '~/Desktop/export/issue-02', type: 'image' },
    { name: 'desktop-shell.json', size: '9.8 kB', path: '~/Desktop/export/issue-02', type: 'json' },
  ]

  const tasks = [
    { label: 'Build desktop shell scaffold', status: 'in-progress' },
    { label: 'Wire composer to gateway', status: 'blocked' },
    { label: 'Document keyboard map', status: 'todo' },
  ]

  let activeRightTab = 'context'
  let composerValue = ''

  const rightTabs = [
    { id: 'context', label: 'Context' },
    { id: 'runs', label: 'Runs' },
    { id: 'files', label: 'Files' },
    { id: 'tasks', label: 'Tasks' },
  ]

  const statusPills = {
    online: { label: 'Online', tone: 'positive' },
    offline: { label: 'Offline', tone: 'critical' },
    degraded: { label: 'Degraded', tone: 'warning' },
  }
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
      <button class="ghost">Open logs</button>
      <button class="ghost">Pause agent</button>
      <button class="primary">New session</button>
    </div>
  </header>

  <div class="shell-grid">
    <aside class="session-rail" aria-label="Session list">
      {#each sections as section}
        <div class="session-section">
          <p class="section-label">{section.title}</p>
          {#each section.sessions as session}
            <button class={`session-tile ${session.id === selectedSession.id ? 'active' : ''}`}>
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
          <p class="eyebrow">Connected as</p>
          <h2>{selectedSession.name}</h2>
        </div>
        <div class="timeline-actions">
          <button class="ghost">Search ⌘F</button>
          <button class="ghost">Jump ⌘K</button>
        </div>
      </header>

      <div class="message-list">
        {#each messages as message}
          <article class={`message-card ${message.role}`}>
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

      <footer class="composer" aria-label="Message composer">
        <div class="composer-row">
          <textarea
            placeholder="Write a message, /command, or paste logs"
            bind:value={composerValue}
            rows="2"
          ></textarea>
          <div class="composer-controls">
            <button class="ghost" title="Add attachment">Attach</button>
            <button class="ghost" title="Insert macro">Macros</button>
            <button class="primary" disabled={!composerValue.trim()}>Send ⌘⏎</button>
          </div>
        </div>
        <div class="composer-meta">
          <span class="meta">Send as · Operator</span>
          <span class="meta">Gateway ready</span>
        </div>
      </footer>
    </section>

    <aside class="side-rail" aria-label="Session context">
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
  </div>
</div>
