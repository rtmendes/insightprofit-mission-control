# InsightProfit Mission Control

> CEO-level AI agent orchestration dashboard — real-time enterprise command center.

## Overview

Mission Control is the top-level operations dashboard for the InsightProfit enterprise AI infrastructure. It provides a single-pane-of-glass view across all AI agents, platforms, and automation workflows running across the business.

## Features

- **Live Agent Status** — Real-time monitoring of all AI agents across platforms
- **Multi-View Dashboard** — Tabbed interface for different operational views
- **Dark Theme UI** — Professional navy/purple design optimized for command center use
- **Responsive Layout** — Works on desktop, tablet, and mobile
- **Local State Persistence** — Remembers active view via localStorage
- **Zero Dependencies** — Pure HTML/CSS/JS, no build step required

## Architecture

```
Mission Control Dashboard (Single HTML)
  │
  ├── Polsio (agent metrics + task queues)
  ├── ThePopeBot (agent management + chat)
  ├── Viktor AI (Slack operations)
  ├── Claude Dispatch (orchestration)
  └── All enterprise AI agents
```

## Deployment

Hosted on Vercel at `command.insightprofit.live`. No build step — just push to main.

---
*Part of the InsightProfit Enterprise AI Infrastructure*