# PRD: Shastack — Visual Application Architecture Brainstorming Tool

## Introduction

Shastack is a local-first web application for application designers to visually brainstorm, define, and iterate on application architectures. It combines an AI-powered conversational interview with an interactive node-based canvas to produce coherent, opinionated architecture diagrams.

The core workflow: the user creates a project, the AI conducts a guided interview to understand what they're building (app type, language preferences, scale, features, deployment, constraints), then generates a complete architecture diagram rendered as an interactive node graph. The user can then manually edit the canvas, lock specific nodes, and re-invoke the AI to modify the architecture while preserving locked components.

The application runs locally via Docker and is designed for eventual VPS deployment.

## Goals

- Provide a guided AI interview that produces coherent, opinionated architecture recommendations (not generic menus)
- Render architecture as an interactive, visually appealing node-based canvas with card-style nodes grouped by stack layer
- Allow manual editing of AI-generated architectures (drag, add, remove, reconnect)
- Support node locking so AI re-invocations preserve user-confirmed decisions
- Persist projects with full chat history and canvas state in SQLite
- Run reliably in Docker for both local development and production deployment
- Support per-user Claude model selection (Sonnet, Opus, Opus 4.1) with each user's Anthropic API key

## Tasks

### T-001: Project Scaffolding and Docker Setup

**Description:** As a developer, I need the foundational project structure with Next.js, TypeScript, Tailwind CSS, and Docker so that all subsequent tasks have a working build and dev environment.

**Technical Details:**

- Initialize Next.js 14+ with App Router, TypeScript, and Tailwind CSS using `create-next-app`
- Project location: `~/cloud/apps/mwm/shastack`
- Configure `tsconfig.json` with strict mode and path aliases (`@/` pointing to `src/`)
- Set up Tailwind with a custom color palette supporting both light and dark themes via CSS custom properties and the `class` dark mode strategy
- Create `Dockerfile` with multi-stage build: stage 1 installs dependencies and builds, stage 2 runs a minimal production image with `next start`
- Create `docker-compose.yml` with two profiles:
  - `dev`: mounts source code as volume, runs `next dev` with hot reload, exposes port 3000, mounts SQLite volume at `/app/data`
  - `prod`: builds the production image, runs `next start`, mounts SQLite volume at `/app/data`
- Environment variables via `.env.local` (gitignored): `DATABASE_URL` (default: `file:./data/shastack.db`) and application secret/auth configuration. Anthropic keys and model preferences are per-user settings, not server environment variables.
- Create `.env.example` with placeholder values
- Add `.gitignore` covering `.next/`, `node_modules/`, `.env.local`, `data/`
- Add `eslint` and `prettier` configuration matching Next.js defaults

**Acceptance Criteria:**

- [ ] `docker compose --profile dev up` starts the dev server accessible at `http://localhost:3000`
- [ ] `docker compose --profile prod up --build` builds and serves the production app
- [ ] Hot reload works in dev mode when editing source files
- [ ] SQLite data persists across container restarts via Docker volume
- [ ] TypeScript strict mode passes with no errors
- [ ] Typecheck/lint passes

### T-002: Testing Infrastructure

**Description:** As a developer, I need a complete testing setup so that all subsequent features can be developed with tests from the start.

**Technical Details:**

- Install and configure Vitest as the unit/integration test runner. Configure `vitest.config.ts` with path aliases matching `tsconfig.json`, and set the environment to `jsdom` for React component tests
- Install `@testing-library/react` and `@testing-library/jest-dom` for React component testing. Create a test setup file (`src/test/setup.ts`) that imports `@testing-library/jest-dom/vitest`
- Install Playwright for E2E tests. Initialize with `npx playwright install` and configure `playwright.config.ts` targeting `http://localhost:3000` with the `webServer` option pointing to `next dev`
- Create directory structure: `src/**/*.test.ts` for unit tests co-located with source, `e2e/` for Playwright tests
- Add npm scripts: `test` (vitest run), `test:watch` (vitest), `test:e2e` (playwright test), `test:coverage` (vitest --coverage)
- Write a single smoke test for each framework to verify setup works:
  - Vitest: test that 1+1=2
  - Testing Library: render a `<div>hello</div>` and assert text content
  - Playwright: navigate to localhost:3000 and assert page title

**Acceptance Criteria:**

- [ ] `npm run test` executes Vitest and passes
- [ ] `npm run test:e2e` executes Playwright and passes
- [ ] Test coverage reporting works via `npm run test:coverage`
- [ ] Typecheck/lint passes

### T-003: Database Schema and Drizzle ORM Setup

**Description:** As a developer, I need the database layer with Drizzle ORM and SQLite so that projects and chat messages can be persisted.

**Technical Details:**

- Install `drizzle-orm` and `better-sqlite3` (synchronous SQLite driver for Node.js) plus `drizzle-kit` as dev dependency
- Create schema file at `src/db/schema.ts` with these tables:

```typescript
// projects table
projects {
  id: text (UUID, primary key)
  name: text (not null)
  description: text (nullable)
  canvasState: text (JSON stringified React Flow state: nodes + edges)
  createdAt: integer (unix timestamp)
  updatedAt: integer (unix timestamp)
}

// messages table (per-project chat history)
messages {
  id: text (UUID, primary key)
  projectId: text (foreign key → projects.id, cascade delete)
  role: text ('user' | 'assistant')
  content: text (not null)
  createdAt: integer (unix timestamp)
}

// settings table (key-value store for app settings)
settings {
  key: text (primary key)
  value: text (not null)
}
```

- Create `src/db/index.ts` that initializes the Drizzle client with `better-sqlite3`, pointing to the `DATABASE_URL` env var path. Export the `db` instance
- Configure `drizzle.config.ts` for migrations with `dialect: 'sqlite'`
- Generate initial migration with `drizzle-kit generate`
- Create a migration runner that runs on app startup (`src/db/migrate.ts`) using `drizzle-kit migrate`
- Write unit tests for: inserting a project, querying projects, inserting messages for a project, cascade deleting messages when project is deleted, CRUD on settings

**Acceptance Criteria:**

- [ ] Database file is created at the configured path on first run
- [ ] Migrations run automatically on app startup
- [ ] All CRUD operations work: create/read/update/delete projects, insert/query messages, set/get settings
- [ ] Cascade delete removes messages when a project is deleted
- [ ] Unit tests pass for all database operations
- [ ] Typecheck/lint passes

### T-004: Domain Model and TypeScript Types

**Description:** As a developer, I need a shared type system defining the node categories, connection types, and canvas structures so that the AI output schema, React Flow components, and database layer all share the same type definitions.

**Technical Details:**

- Create `src/types/stack.ts` with these type definitions:

```typescript
// Node categories and their subtypes
type NodeCategory = "client" | "api" | "services" | "data" | "infrastructure" | "external";

// Each category has specific subtypes
type ClientSubtype = "web-app" | "mobile-app" | "desktop-app" | "cli";
type ApiSubtype = "rest-api" | "graphql" | "grpc" | "websocket-server";
type ServicesSubtype =
  | "auth"
  | "payments"
  | "notifications"
  | "search"
  | "file-processing"
  | "custom";
type DataSubtype = "sql-db" | "nosql-db" | "cache" | "message-queue" | "object-storage";
type InfraSubtype = "cdn" | "load-balancer" | "api-gateway" | "dns" | "reverse-proxy";
type ExternalSubtype = "third-party-api" | "oauth-provider" | "email-sms-service";

// Union of all subtypes
type NodeSubtype =
  | ClientSubtype
  | ApiSubtype
  | ServicesSubtype
  | DataSubtype
  | InfraSubtype
  | ExternalSubtype;

// Connection types between nodes
type ConnectionType = "http" | "websocket" | "grpc" | "tcp" | "pub-sub" | "file-io";

// A stack node as the AI generates it (before React Flow positioning)
interface StackNode {
  id: string;
  category: NodeCategory;
  subtype: NodeSubtype;
  name: string; // e.g., "PostgreSQL Database"
  technology: string; // e.g., "PostgreSQL 16"
  description: string; // What this component does in this architecture
  reasoning: string; // Why the AI chose this component
  locked: boolean; // Whether AI should preserve this on re-invocation
}

// A connection between two nodes
interface StackEdge {
  id: string;
  source: string; // source node id
  target: string; // target node id
  connectionType: ConnectionType;
  label: string; // e.g., "REST API calls", "Publishes events"
}

// The complete architecture state
interface StackArchitecture {
  nodes: StackNode[];
  edges: StackEdge[];
}
```

- Create `src/types/canvas.ts` that maps `StackNode` to React Flow's `Node` type and `StackEdge` to React Flow's `Edge` type, with converter functions `toReactFlowNodes()` and `toReactFlowEdges()` and reverse converters `fromReactFlowNodes()` and `fromReactFlowEdges()`
- Create `src/types/chat.ts` for message types used in the chat sidebar
- Create `src/lib/node-config.ts` with a configuration object mapping each `NodeCategory` to: display name, color (for both light and dark themes), icon name (from a set we'll use — lucide-react icons), and list of subtypes with their display names. This drives all visual rendering consistently.
- Write unit tests validating the converter functions round-trip correctly (StackNode → ReactFlowNode → StackNode produces identical output)

**Acceptance Criteria:**

- [ ] All types are exported and importable across the codebase
- [ ] Converter functions correctly map between domain types and React Flow types
- [ ] Node config provides color, icon, and display name for every category and subtype
- [ ] Round-trip conversion tests pass
- [ ] Typecheck/lint passes

### T-005: API Routes — Project CRUD

**Description:** As a user, I need API endpoints to create, list, read, update, and delete projects so that the frontend can manage project data.

**Technical Details:**

- Create Next.js App Router API routes:
  - `GET /api/projects` — returns all projects ordered by `updatedAt` descending. Each project in the list includes `id`, `name`, `description`, `createdAt`, `updatedAt` (NOT the full `canvasState` — that's too heavy for a list)
  - `POST /api/projects` — creates a new project with `name` and optional `description`. Generates a UUID for `id`, sets timestamps, initializes `canvasState` as `null`
  - `GET /api/projects/[id]` — returns a single project with full `canvasState` parsed from JSON
  - `PATCH /api/projects/[id]` — updates project fields. Accepts partial updates: `name`, `description`, `canvasState` (stringified JSON). Updates `updatedAt` timestamp
  - `DELETE /api/projects/[id]` — deletes the project (messages cascade-delete via schema)
- Create `GET /api/projects/[id]/messages` — returns all messages for a project ordered by `createdAt` ascending
- All routes return proper HTTP status codes: 200 (success), 201 (created), 404 (not found), 400 (bad request with validation errors)
- Use Zod for request body validation on POST and PATCH routes
- Write Vitest integration tests for all routes using Next.js test utilities, with a test database

**Acceptance Criteria:**

- [ ] All CRUD operations work via HTTP requests
- [ ] Invalid requests return 400 with descriptive error messages
- [ ] Nonexistent project IDs return 404
- [ ] Deleting a project also removes its messages
- [ ] Integration tests pass for all routes and error cases
- [ ] Typecheck/lint passes

### T-006: API Route — Settings

**Description:** As a user, I need an API endpoint to store and retrieve application settings (API key, model preference) so that configuration persists across sessions.

**Technical Details:**

- Create API routes:
  - `GET /api/settings` — returns `{ hasAnthropicKey, model, theme, role, isAdmin }`; the API key itself is never returned
  - `PATCH /api/settings` — accepts `apiKey`, `clearApiKey`, `model`, and `theme`
- Store each user's API key encrypted at rest and isolate it by authenticated user
- Default model value if unset: `claude-sonnet-4-20250514`
- Do not fall back to a server-managed API key or model
- Write integration tests

**Acceptance Criteria:**

- [ ] Settings persist across app restarts
- [ ] API keys are encrypted, write-only, and isolated per user
- [ ] Clearing a key preserves the user&apos;s model preference
- [ ] Invalid keys are rejected with 400
- [ ] Integration tests pass
- [ ] Typecheck/lint passes

### T-007: Project Dashboard Page

**Description:** As a user, I want a dashboard listing all my projects so that I can create new ones or open existing ones.

**Technical Details:**

- Create the main page at `src/app/page.tsx` as the project dashboard
- Layout: centered content area with a header showing "Shastack" branding and a settings gear icon (links to `/settings`)
- Project list: grid of project cards showing name, description (truncated), last modified date. Clicking a card navigates to `/project/[id]`
- "New Project" button prominently displayed — navigates to `/project/new`
- Delete button on each project card with a confirmation dialog (use a simple modal, no library needed)
- Empty state: when no projects exist, show a friendly message and prominent "Create your first project" CTA
- Use React Server Components for the project list (data fetched server-side)
- Responsive: single column on mobile, 2-3 columns on larger screens
- Implement light/dark theme toggle in the header using `next-themes` (reads system preference by default, stores choice in settings)
- Write Testing Library tests for: rendering project list, empty state, delete confirmation

**Acceptance Criteria:**

- [ ] Dashboard displays all projects with name, description, and date
- [ ] "New Project" button navigates to project creation
- [ ] Clicking a project card opens it
- [ ] Delete button removes project after confirmation
- [ ] Empty state renders when no projects exist
- [ ] Light/dark theme toggle works and persists
- [ ] Component tests pass
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-008: Settings Page

**Description:** As a user, I want a settings page to configure my Anthropic API key and preferred Claude model so that the AI features work with my account.

**Technical Details:**

- Create settings page at `src/app/settings/page.tsx`
- Form fields:
  - **API Key**: password-type input with show/hide toggle. Displays masked value if already set. "Save" button triggers PATCH to `/api/settings`
  - **Model**: dropdown select with options: `claude-sonnet-4-20250514` (Sonnet), `claude-opus-4-20250514` (Opus), `claude-opus-4-1-20250805` (Opus 4.1). Shows which is currently selected from settings
  - **Theme**: radio group for Light / Dark / System
- "Back to Dashboard" link at the top
- Show a status indicator: green checkmark if API key is set, red warning if missing
- Form validation: API key must start with `sk-ant-` (basic Anthropic key format check)
- On save: display success/error toast notification (simple CSS-only toast, no library)
- Write component tests for form rendering and validation

**Acceptance Criteria:**

- [ ] API key can be saved and persists
- [ ] API key displays masked when already set
- [ ] Model selection saves and persists
- [ ] Theme preference saves and applies immediately
- [ ] Invalid API key format shows validation error
- [ ] Success/error feedback shown on save
- [ ] Component tests pass
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-009: Canvas Component with React Flow

**Description:** As a user, I need the interactive canvas where architecture diagrams are displayed, so that I can visualize and manipulate my application's stack.

**Technical Details:**

- Install `reactflow` (v11+) package
- Create the project page at `src/app/project/[id]/page.tsx` with a two-panel layout:
  - **Left panel (collapsible):** Chat sidebar (placeholder for now — just a div with "Chat" text)
  - **Right panel (main area):** React Flow canvas filling remaining space
- The canvas uses `ReactFlow` component with these configurations:
  - `fitView` enabled (auto-zoom to fit all nodes)
  - Background: `<Background variant="dots" />` with subtle color matching theme
  - `<Controls />` component for zoom in/out/fit buttons
  - `<MiniMap />` in bottom-right corner showing node positions
  - Selection, multi-select (shift+click), drag-to-select
  - Snap to grid: 20px grid
- Canvas state management: use React state (`useState`) initialized from the project's `canvasState` loaded via API. On every change (node drag, connection made, node added/removed), debounce-save to the API via `PATCH /api/projects/[id]` with the serialized React Flow state (500ms debounce)
- Register custom node types and custom edge types (implementations in T-010 and T-011)
- Toolbar above canvas with: project name (editable inline), "Add Node" dropdown button, and "Lock/Unlock" toggle info
- If canvas is empty (new project), show a centered message: "Start a conversation to generate your architecture" pointing to the chat sidebar
- Write component tests for: canvas rendering, empty state, toolbar rendering

**Acceptance Criteria:**

- [ ] Canvas renders with zoom, pan, minimap, and controls
- [ ] Canvas loads existing state from database on page load
- [ ] Canvas auto-saves on changes (debounced)
- [ ] Grid snapping works
- [ ] Empty state message shows when no nodes exist
- [ ] Two-panel layout with collapsible sidebar
- [ ] Component tests pass
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-010: Custom Node Components

**Description:** As a user, I want architecture nodes displayed as visually distinct cards with icons and colors per category, so that I can quickly understand the architecture at a glance.

**Technical Details:**

- Create a custom React Flow node component at `src/components/canvas/StackNode.tsx`
- Visual design (card-style):
  - Rounded rectangle (12px radius) with subtle shadow (`shadow-md`)
  - Left border accent: 4px solid in the category color (from `node-config.ts`)
  - Header: icon (lucide-react, mapped per subtype) + node name in bold
  - Subtitle: technology name in muted text (e.g., "PostgreSQL 16")
  - Category badge: small pill showing category name in category color
  - Dimensions: min-width 200px, auto-height based on content
- Connection handles:
  - Top handle (target): for incoming connections
  - Bottom handle (source): for outgoing connections
  - Handles styled as small circles in category color
- Lock indicator: when `data.locked` is true, show a small lock icon in the top-right corner. Locked nodes have a subtle dashed border
- Selection state: when selected, show a blue outline (2px solid)
- Dark mode: adjust background, text, and shadow colors for dark theme
- Clicking a node opens the detail panel (T-012)
- Right-click context menu on a node: "Lock/Unlock", "Delete", "Edit" (implemented via a simple positioned div, no library)
- Register this component as a custom node type `stackNode` in the React Flow instance
- Write component tests for: rendering with different categories, lock indicator visibility, dark mode styling

**Acceptance Criteria:**

- [ ] Nodes display with correct icon, color, name, and technology per category
- [ ] Locked nodes show lock icon and dashed border
- [ ] Connection handles are visible and correctly positioned
- [ ] Right-click context menu works with Lock/Unlock and Delete options
- [ ] Nodes render correctly in both light and dark mode
- [ ] Component tests pass
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-011: Custom Edge Components

**Description:** As a user, I want connections between nodes to be visually distinct by type (HTTP, WebSocket, gRPC, etc.) so that I can understand data flow at a glance.

**Technical Details:**

- Create a custom React Flow edge component at `src/components/canvas/StackEdge.tsx`
- Visual distinction per `ConnectionType`:
  - `http`: solid line, blue
  - `websocket`: dashed line, green
  - `grpc`: solid line, purple, slightly thicker (3px)
  - `tcp`: dotted line, gray
  - `pub-sub`: dash-dot line, orange
  - `file-io`: dotted line, brown
- Each edge renders as a `BezierEdge` (React Flow's default curved path) with:
  - Animated flow dots (React Flow's `animated` prop) for active-looking connections
  - A label badge at the midpoint showing the connection label text (e.g., "REST API") in a small rounded pill
  - Arrow marker at the target end indicating direction
- Edge thickness: 2px default, 3px on hover
- Selected edge: brighter color + thicker (3px)
- Create an edge legend component (`src/components/canvas/EdgeLegend.tsx`) — a small floating panel in the bottom-left showing all connection types with their visual style. Togglable visibility.
- Register as custom edge type `stackEdge` in React Flow
- Write component tests for: rendering each connection type with correct style, label display

**Acceptance Criteria:**

- [ ] Each connection type has a visually distinct line style and color
- [ ] Edge labels display at the midpoint
- [ ] Directional arrows show on target end
- [ ] Edge legend component shows all connection types
- [ ] Edges render correctly in both light and dark mode
- [ ] Component tests pass
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-012: Node Detail Panel

**Description:** As a user, I want to click a node and see its full details (name, type, technology, description, reasoning) in a side panel so that I can understand and edit each component.

**Technical Details:**

- Create `src/components/canvas/NodeDetailPanel.tsx` — a slide-out panel from the right side of the canvas (400px width, overlays the canvas, does not push content)
- Opens when a node is clicked (React Flow's `onNodeClick` callback)
- Closes with an X button or clicking outside the panel
- Panel contents:
  - **Header:** category icon + node name (editable text input)
  - **Technology:** editable text input (e.g., "PostgreSQL 16")
  - **Category:** dropdown to change category (updates icon and color)
  - **Subtype:** dropdown to change subtype (options filtered by selected category)
  - **Description:** editable textarea — what this component does
  - **Reasoning:** read-only text block — why the AI chose this (styled with a subtle background, italic)
  - **Lock toggle:** switch to lock/unlock the node
  - **Delete button:** red, with confirmation
- All edits save immediately to the canvas state (which debounce-saves to DB via T-009's mechanism)
- Animated slide-in/out (CSS transition, 200ms ease)
- Write component tests for: rendering with data, editing fields, lock toggle

**Acceptance Criteria:**

- [ ] Panel opens on node click with correct data
- [ ] All editable fields save changes to canvas state
- [ ] Category change updates the node's visual appearance on canvas
- [ ] Lock toggle changes node's locked state and visual indicator
- [ ] Delete removes node and its connections from canvas
- [ ] Panel closes on X click or outside click
- [ ] Component tests pass
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-013: Manual Node Addition

**Description:** As a user, I want to manually add nodes to the canvas without AI, so that I can build or extend architectures by hand.

**Technical Details:**

- Implement the "Add Node" button in the canvas toolbar (from T-009) as a dropdown menu
- Dropdown structure: grouped by category (Client, API Layer, Services, Data, Infrastructure, External), each category expandable, showing subtypes as clickable items
- When a subtype is clicked:
  - Create a new `StackNode` with the selected category and subtype
  - Set default name to the subtype's display name (e.g., "REST API")
  - Set technology to empty string (user fills in)
  - Set description to empty string
  - Set reasoning to "Manually added"
  - Set locked to false
  - Place the node at the center of the current viewport (use React Flow's `project()` function to convert screen center to flow coordinates)
- New node immediately appears on canvas and the detail panel opens for editing
- Manual connections: user can drag from a source handle to a target handle. When a connection is made, prompt with a small popover to select the `ConnectionType` (dropdown with the 6 types). Default to `http`.
- Write component tests for: dropdown rendering, node creation

**Acceptance Criteria:**

- [ ] Add Node dropdown shows all categories and subtypes
- [ ] Clicking a subtype adds a node at viewport center
- [ ] Detail panel opens for the new node
- [ ] Manual connections prompt for connection type selection
- [ ] New nodes and connections are saved to canvas state
- [ ] Component tests pass
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-014: Auto-Layout with Dagre

**Description:** As a developer, I need an auto-layout algorithm so that AI-generated architectures are arranged in a clear, readable directed graph instead of random positions.

**Technical Details:**

- Install `dagre` package (and `@types/dagre`)
- Create `src/lib/layout.ts` with a function `applyDagreLayout(nodes: StackNode[], edges: StackEdge[]): ReactFlowNode[]`
- Layout configuration:
  - Direction: top-to-bottom (`rankdir: 'TB'`)
  - Group by category using Dagre's rank assignment: Client nodes at rank 0 (top), API Layer at rank 1, Services at rank 2, Data at rank 3, Infrastructure at rank 4, External at rank 5 (side)
  - Node separation: 80px horizontal, 100px vertical
  - Edge separation: 20px
- The function takes abstract `StackNode[]` (no positions) and returns React Flow nodes with `position: { x, y }` set by Dagre
- Handle edge cases: single node (centered), disconnected subgraphs (laid out side by side), circular dependencies (Dagre handles these but log a warning)
- Create a "Re-layout" button in the canvas toolbar that re-runs Dagre on the current nodes/edges (useful after manual rearranging makes things messy)
- Write unit tests for: basic layout produces non-overlapping positions, category ordering is respected, single node case, empty input

**Acceptance Criteria:**

- [ ] AI-generated nodes are automatically positioned in a readable top-to-bottom graph
- [ ] Nodes are grouped by category layer (clients at top, data at bottom)
- [ ] No node overlapping
- [ ] "Re-layout" button rearranges existing nodes
- [ ] Unit tests pass
- [ ] Typecheck/lint passes

### T-015: Chat Sidebar UI

**Description:** As a user, I need a chat sidebar where I can converse with the AI to describe my application and receive architecture recommendations.

**Technical Details:**

- Create `src/components/chat/ChatSidebar.tsx` — replaces the placeholder from T-009
- Layout: full height of the project page, 400px width, collapsible to 0px with a toggle button visible on the canvas edge
- Structure top to bottom:
  - **Header:** "Architecture Assistant" title + collapse button
  - **Message area:** scrollable list of messages. User messages right-aligned with blue background. Assistant messages left-aligned with gray background. Messages support markdown rendering (use `react-markdown` with minimal config — paragraphs, bold, italic, lists, code blocks)
  - **Input area:** textarea (auto-growing, max 4 lines) + send button. Send on Enter (Shift+Enter for newline)
- Messages loaded from `/api/projects/[id]/messages` on mount
- New messages sent via the AI chat API route (T-016)
- While AI is responding, show a typing indicator (three animated dots)
- Auto-scroll to bottom on new messages
- When AI generates/updates architecture, the canvas updates simultaneously (handled in T-017)
- On new project (`/project/new`): the first AI message is the opening interview question (triggered automatically on page load)
- Write component tests for: message rendering, input behavior, collapse toggle, markdown rendering

**Acceptance Criteria:**

- [ ] Chat sidebar displays message history with correct alignment and styling
- [ ] Messages support markdown formatting
- [ ] Input sends on Enter, supports Shift+Enter for newlines
- [ ] Typing indicator shows during AI response
- [ ] Auto-scrolls to latest message
- [ ] Sidebar collapses and expands
- [ ] Chat loads persisted messages on page load
- [ ] Component tests pass
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-016: AI System Prompt and Structured Output Schema

**Description:** As a developer, I need a comprehensive system prompt and JSON output schema so that Claude can conduct architecture interviews and generate valid, coherent stack architectures.

**Technical Details:**

- Create `src/lib/ai/system-prompt.ts` containing the system prompt as a template literal
- The system prompt must instruct Claude to:
  1. Act as a senior application architect with deep knowledge of modern tech stacks
  2. Conduct an interview by asking one focused question at a time (not all at once)
  3. Cover these topics during the interview (in natural order, adapting based on answers):
     - What the user is building (app type, target audience, core problem being solved)
     - Language/ecosystem preference and any existing tech commitments
     - Scale expectations (users, data volume, team size)
     - Key features needed (auth, real-time, file handling, payments, search, etc.)
     - Deployment preferences (cloud provider, self-hosted, serverless, containers)
     - Constraints (budget, team expertise, timeline, compliance)
     - Non-functional requirements (performance, availability, security, offline support)
  4. After gathering enough information (typically 5-8 exchanges), generate the architecture
  5. When generating architecture, provide a `<stack>` JSON block embedded in the response containing the `StackArchitecture` structure
  6. Be opinionated: recommend specific technologies, not categories. Say "PostgreSQL 16" not "a SQL database". Explain why each choice fits.
  7. Ensure coherence: all technology choices should work well together (e.g., don't mix a Python backend with a TypeScript ORM)
  8. Respect language/ecosystem preferences: if the user prefers TypeScript, recommend Node.js/Express or Next.js, Prisma/Drizzle, etc.
  9. When re-invoked on an existing canvas, receive the current `StackArchitecture` JSON with `locked` flags. Preserve all locked nodes exactly. Modify/add/remove only unlocked nodes.
  10. Explain every architectural decision in the response text (not just in the JSON)

- Create `src/lib/ai/output-parser.ts` with a function `parseAIResponse(text: string): { message: string, architecture: StackArchitecture | null }`
  - Extracts `<stack>...</stack>` JSON block from the response if present
  - Validates the JSON against the `StackArchitecture` type using Zod
  - Returns the text with the `<stack>` block removed (for display in chat) and the parsed architecture (or null if no architecture in this message)

- Create `src/lib/ai/context-builder.ts` with a function `buildMessages(chatHistory: Message[], currentArchitecture: StackArchitecture | null): AnthropicMessage[]`
  - Converts chat history to Anthropic API message format
  - If `currentArchitecture` is not null, prepends a system-level context block describing the current canvas state (nodes with their locked status, edges) so the AI knows what exists
  - Marks locked nodes clearly: "The following nodes are LOCKED and must not be modified or removed: [list]"

- Write unit tests for: output parser extracting valid JSON, output parser handling no-architecture messages, output parser handling malformed JSON gracefully, context builder including locked nodes

**Acceptance Criteria:**

- [ ] System prompt covers all interview topics and generation rules
- [ ] Output parser correctly extracts `<stack>` JSON from AI responses
- [ ] Output parser handles responses without architecture (pure chat)
- [ ] Output parser validates architecture JSON against Zod schema
- [ ] Context builder correctly represents current canvas state including lock status
- [ ] Unit tests pass for parser and context builder
- [ ] Typecheck/lint passes

### T-017: AI Chat API Route and Anthropic Integration

**Description:** As a user, I need the backend API route that sends messages to Claude and streams responses back, so that the chat sidebar can communicate with the AI in real-time.

**Technical Details:**

- Install `@anthropic-ai/sdk` package
- Create API route `POST /api/projects/[id]/chat` that:
  1. Receives `{ message: string }` in the request body
  2. Loads the project from DB (404 if not found)
  3. Loads all existing messages for the project
  4. Loads the authenticated user's encrypted API key and model preference
  5. If no API key is configured, return the standard `AI_NOT_CONFIGURED` error
  6. Saves the user message to the `messages` table
  7. Builds the Anthropic API request using `buildMessages()` from T-016 with the system prompt
  8. Calls the Anthropic API with streaming enabled (`stream: true`). Use the model from settings.
  9. Streams the response back to the client using Server-Sent Events (SSE) via Next.js `ReadableStream` response
  10. As the stream completes, saves the full assistant message to the `messages` table
  11. If the response contains a `<stack>` block, parses it and saves the architecture to the project's `canvasState` via `PATCH`

- Create `POST /api/projects/[id]/chat/init` that:
  1. Checks if the project has any messages
  2. If no messages exist, triggers the AI to send the first interview message (no user input needed — sends a system instruction "Begin the architecture interview for a new project")
  3. Returns the AI's opening message via SSE stream

- SSE format: send events as `data: {"type": "text", "content": "..."}` for text chunks and `data: {"type": "architecture", "content": {...}}` for parsed architecture, and `data: {"type": "done"}` on completion

- Error handling: if Anthropic API returns an error, stream `data: {"type": "error", "content": "..."}` with a user-friendly message

- Write integration tests with a mocked Anthropic client: test message flow, architecture extraction, error handling

**Acceptance Criteria:**

- [ ] Chat messages stream back in real-time via SSE
- [ ] User messages and AI responses are persisted to the database
- [ ] Architecture JSON is extracted from responses and saved to project canvas state
- [ ] New projects automatically trigger the first AI interview message
- [ ] Missing API key returns a clear error
- [ ] Anthropic API errors are handled gracefully
- [ ] Integration tests pass
- [ ] Typecheck/lint passes

### T-018: Chat-to-Canvas Integration

**Description:** As a user, when the AI generates or updates an architecture in the chat, I want the canvas to update in real-time showing the new/modified nodes and connections.

**Technical Details:**

- In the project page component, create a shared state between the chat sidebar and the canvas
- When the chat SSE stream emits an `architecture` event:
  1. Parse the `StackArchitecture` from the event
  2. If this is the first architecture (canvas was empty): convert all nodes/edges to React Flow format using converters from T-004, run Dagre layout from T-014, set the entire canvas state
  3. If this is an update to an existing architecture:
     - Identify locked nodes in the current canvas (they have `data.locked === true`)
     - Preserve locked nodes' positions and all their properties exactly
     - For edges connected to locked nodes: preserve if both endpoints are locked, otherwise let AI's edge definition take precedence
     - For new/modified unlocked nodes: apply Dagre layout to position them, but use the locked nodes' positions as fixed constraints in the Dagre graph (set their positions as fixed points)
     - Animate the transition: nodes should smoothly move to their new positions over 300ms (use React Flow's `nodesDraggable` + CSS transitions on the node wrapper)
  4. After canvas update, trigger `fitView` with padding to show all nodes
- Handle edge case: AI removes all unlocked nodes (user locked everything and asked to "remove the rest") — canvas shows only locked nodes
- Handle edge case: AI response has malformed architecture — show a toast error "Failed to update canvas" and keep existing state

- Write unit tests for: merge logic (locked preservation), layout with fixed constraints

**Acceptance Criteria:**

- [ ] New architecture renders on canvas with auto-layout
- [ ] Updated architecture preserves locked nodes' positions exactly
- [ ] Unlocked nodes reposition smoothly with animation
- [ ] Canvas fits view after update
- [ ] Malformed architecture responses don't break the canvas
- [ ] Unit tests pass for merge logic
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-019: New Project Flow

**Description:** As a user, I want to click "New Project" on the dashboard and be taken through the complete flow: name the project, then start the AI interview.

**Technical Details:**

- Create page at `src/app/project/new/page.tsx`
- Step 1: Simple form asking for project name (required) and optional description. "Create" button.
- On submit: `POST /api/projects` to create the project, then redirect to `/project/[new-id]`
- On the project page (`/project/[id]`), on mount:
  - Load project data and messages
  - If messages array is empty (new project): call `POST /api/projects/[id]/chat/init` to trigger the AI's first message
  - The AI's first message should be a friendly greeting and the first interview question (e.g., "Welcome! Let's design your application architecture. What are you building? Tell me about the type of application and the problem it solves.")
- The chat sidebar is open by default for new projects (since the canvas is empty)
- Write E2E test with Playwright: create a new project, verify chat opens with first AI message

**Acceptance Criteria:**

- [ ] New project form validates name is required
- [ ] Creating a project redirects to the project page
- [ ] AI automatically sends the first interview message for new projects
- [ ] Chat sidebar is open by default on new projects
- [ ] E2E test passes
- [ ] Typecheck/lint passes
- [ ] Verify in browser

### T-020: Full E2E Interview-to-Canvas Flow

**Description:** As a developer, I need to verify the complete end-to-end flow works: creating a project, going through the AI interview, seeing architecture generated on the canvas, then modifying it via follow-up chat.

**Technical Details:**

- Write a comprehensive Playwright E2E test that:
  1. Creates a new project from the dashboard
  2. Verifies the AI sends the first interview message
  3. Sends a user message describing an app (e.g., "I want to build a real-time chat application")
  4. Continues the conversation for 2-3 more exchanges answering AI questions
  5. Eventually triggers architecture generation using an intercepted mock response in automated tests
  6. Verifies nodes appear on the canvas with correct categories
  7. Verifies edges connect the nodes
  8. Clicks a node and verifies the detail panel opens with data
  9. Locks a node via the detail panel
  10. Sends a follow-up message asking to modify the architecture
  11. Verifies the locked node remains unchanged while other nodes update
  12. Returns to dashboard and verifies the project appears in the list
  13. Reopens the project and verifies canvas state and chat history are preserved

- Automated tests intercept the `/api/projects/[id]/chat` route and return canned SSE responses. Optional manual validation uses the signed-in tester's saved Anthropic key; there is no server key fallback.

- Also write E2E tests for error paths:
  - No API key configured → settings page prompt
  - API error during chat → error toast shown

**Acceptance Criteria:**

- [ ] Full flow E2E test passes with mock AI backend
- [ ] Full flow E2E test passes with real API (when key provided)
- [ ] Error path E2E tests pass
- [ ] All previously created unit and component tests still pass
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: Users can create, list, open, and delete projects from a dashboard
- FR-2: Each project has a persistent chat sidebar and an interactive node-based canvas
- FR-3: The AI conducts a guided interview asking about app type, language preference, scale, features, deployment, constraints, and non-functional requirements
- FR-4: The AI generates a complete `StackArchitecture` (nodes + edges) rendered on the canvas after gathering sufficient information
- FR-5: Architecture nodes are displayed as card-style elements with category-specific colors, icons, and connection handles
- FR-6: Connections between nodes are visually distinct by type (HTTP, WebSocket, gRPC, TCP, Pub/Sub, File I/O)
- FR-7: Users can click nodes to view/edit details: name, technology, description, category, subtype, and lock status
- FR-8: Users can manually add nodes from a categorized dropdown and create connections by dragging between handles
- FR-9: Nodes can be locked to prevent AI from modifying them on re-invocation
- FR-10: Users can send follow-up messages to modify the architecture; AI preserves locked nodes and updates unlocked ones
- FR-11: Auto-layout (Dagre) arranges nodes top-to-bottom grouped by stack layer
- FR-12: Canvas state and chat history persist in SQLite across sessions
- FR-13: API key and Claude model are configurable via a settings page
- FR-14: Application supports light and dark themes with system preference detection
- FR-15: Application runs in Docker for both development and production

## Non-Goals (Out of Scope)

- User authentication or multi-user support
- Visual export (PNG, SVG, PDF)
- Undo/redo on canvas
- Real-time collaboration
- Version history or stack snapshots
- Pre-built architecture templates (AI generates from scratch each time)
- Node-level AI expansion ("break this node into sub-components")
- Mobile-responsive canvas (desktop-first, canvas tools don't work well on mobile)

## Design Considerations

- Card-style nodes with rounded corners, subtle shadows, left-border accent color by category, and lucide-react icons per subtype
- Color palette per category (both light and dark variants):
  - Client: blue (#3B82F6)
  - API Layer: green (#10B981)
  - Services: purple (#8B5CF6)
  - Data: amber (#F59E0B)
  - Infrastructure: slate (#64748B)
  - External: rose (#F43F5E)
- Chat sidebar: clean, messaging-app feel with markdown support
- Dashboard: minimal card grid, no clutter
- Theme: system preference default, toggle in header and settings

## Technical Considerations

- React Flow v11+ with custom node/edge types for full visual control
- Dagre for automatic graph layout with fixed-position constraints for locked nodes
- Drizzle ORM with better-sqlite3 for zero-config local persistence
- Anthropic streaming API for real-time chat responses
- SSE (Server-Sent Events) for streaming AI responses from Next.js API routes
- Zod for validating AI output JSON and API request bodies
- `next-themes` for light/dark mode with system detection
- `react-markdown` for chat message formatting
- Debounced canvas saves (500ms) to avoid excessive DB writes
- Docker multi-stage build for optimized production image

## Success Metrics

- AI interview produces a coherent architecture within 5-8 exchanges
- Generated architectures render with no overlapping nodes
- Locked nodes are never modified by AI re-invocations
- Canvas state and chat history persist correctly across page reloads and container restarts
- All tests pass: unit, component, and E2E

## Open Questions

- Should the AI suggest architecture alternatives ("Option A: monolith, Option B: microservices") or always commit to one recommendation?
- Should there be a "regenerate" button that restarts the architecture from scratch (clearing unlocked nodes) vs the current approach of incremental modification via chat?
- What is the maximum number of nodes the canvas should comfortably handle before performance degrades? (React Flow handles ~200 nodes well)
