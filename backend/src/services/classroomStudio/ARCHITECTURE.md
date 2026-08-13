# Interactive Classroom Studio Architecture

## Overview
The Interactive Classroom Studio is a premium real-time teaching platform that allows instructors to teach from presentations (PowerPoint, Google Slides, PDF) while interacting with students through various engagement tools.

## Core Architecture

### 1. Presentation Engine
**Purpose**: Manage presentation lifecycle, import, and storage

**Responsibilities**:
- Import presentations from multiple sources (PPTX, Google Slides, PDF)
- Parse and extract slide content
- Generate slide thumbnails
- Store presentation metadata and content
- Version control for presentations

**Key Services**:
- `PresentationService` - CRUD operations for presentations
- `PresentationImportService` - Handle imports from different sources
- `ThumbnailGenerator` - Generate slide thumbnails using Puppeteer
- `PowerPointParser` - Parse .pptx files and extract slides
- `GoogleSlidesAdapter` - Integrate with Google Slides API
- `PdfParser` - Parse PDF files and extract pages as slides

### 2. Slide Engine
**Purpose**: Manage individual slide content and state

**Responsibilities**:
- Store slide content (text, images, shapes, media)
- Manage slide ordering and metadata
- Handle slide annotations and drawings
- Track slide state (locked, hidden, important)
- AI-powered content analysis and recommendations

**Key Services**:
- `SlideService` - CRUD operations for slides
- `SlideContentProcessor` - Process and normalize slide content
- `SlideAnnotationService` - Handle annotations and drawings
- `SlideAIAnalyzer` - AI analysis for content recommendations

### 3. Interaction Engine
**Purpose**: Manage interactive elements on slides

**Responsibilities**:
- Support 15+ interaction types (poll, MCQ, word cloud, etc.)
- Validate interaction configurations
- Track interaction state and timing
- Calculate scores and correctness
- Manage interaction lifecycle

**Key Services**:
- `InteractionService` - CRUD operations for interactions
- `InteractionValidator` - Validate interaction configurations
- `InteractionGrader` - Grade responses and calculate scores
- `InteractionStateManager` - Track interaction state during sessions

### 4. QR Code Engine
**Purpose**: Manage QR code generation and session connections

**Responsibilities**:
- Generate QR codes for presentations, slides, and interactions
- Manage session connection flow
- Handle QR code expiry and refresh
- Track scan analytics

**Key Services**:
- `QRCodeService` - Generate and manage QR codes
- `SessionConnectionService` - Handle student connections via QR
- `QRAnalyticsService` - Track QR scan data

### 5. Live Sync Engine
**Purpose**: Real-time synchronization between instructor and students

**Responsibilities**:
- WebSocket connection management
- Real-time slide synchronization
- Annotation synchronization (drawings, laser pointer)
- Participant state synchronization
- Response broadcasting
- Connection stability and reconnection handling

**Key Services**:
- `WebSocketManager` - Manage WebSocket connections
- `SlideSyncService` - Sync slide changes across clients
- `AnnotationSyncService` - Sync drawings and annotations
- `ParticipantSyncService` - Sync participant state
- `ResponseBroadcastService` - Broadcast responses in real-time
- `ConnectionManager` - Handle connection stability

### 6. Analytics Engine
**Purpose**: Real-time and post-class analytics

**Responsibilities**:
- Real-time response collection and aggregation
- Participation tracking
- Engagement scoring
- Accuracy calculations
- Heatmap generation
- Post-class report generation
- Export functionality (PDF, Excel)

**Key Services**:
- `RealTimeAnalyticsService` - Real-time analytics during sessions
- `SessionAnalyticsService` - Post-class analytics
- `EngagementCalculator` - Calculate engagement scores
- `ReportGenerator` - Generate reports and exports
- `HeatmapGenerator` - Generate engagement heatmaps

### 7. AI Recommendation Engine
**Purpose**: AI-powered insights and recommendations

**Responsibilities**:
- Analyze slide content for teaching opportunities
- Recommend interaction types based on content
- Generate quiz questions automatically
- Identify confusing concepts
- Provide teaching insights

**Key Services**:
- `SlideContentAnalyzer` - Analyze slide content
- `InteractionRecommender` - Recommend interaction types
- `QuestionGenerator` - Generate quiz questions
- `TeachingInsightService` - Provide teaching recommendations

### 8. Session Engine
**Purpose**: Manage live classroom sessions

**Responsibilities**:
- Session lifecycle (scheduled, active, completed)
- Room code generation and management
- Participant management
- Session settings and configuration
- Session recording and state persistence

**Key Services**:
- `ClassroomSessionService` - Session CRUD operations
- `RoomCodeManager` - Generate and manage room codes
- `ParticipantManager` - Manage participants
- `SessionSettingsService` - Handle session configuration

## Technology Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: WebSockets (ws library)
- **File Processing**: 
  - PPTX: `officegen` or custom parser
  - PDF: `pdf-parse` + `pdfjs-dist`
  - Google Slides: Google APIs
- **Thumbnail Generation**: Puppeteer
- **QR Codes**: `qrcode` library
- **AI Integration**: OpenAI API

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Components**: Radix UI + Tailwind CSS
- **Real-time**: WebSocket client
- **QR Codes**: `qrcode.react`
- **State Management**: Zustand
- **Charts**: Recharts
- **Presentation Rendering**: Custom slide renderer

## Data Flow

### Presentation Import Flow
1. Instructor uploads file or selects Google Slides
2. PresentationImportService processes the source
3. Content is extracted and normalized
4. Slides are created with thumbnails
5. AI analyzes content for recommendations
6. Presentation is marked as "ready"

### Live Session Flow
1. Instructor creates session from presentation
2. Room code and QR codes are generated
3. Students scan QR code to join
4. WebSocket connections established
5. Instructor controls slides
6. Changes sync to all students in real-time
7. Students respond to interactions
8. Responses aggregated and displayed
9. Analytics updated continuously
10. Session ends, reports generated

### Real-time Sync Flow
1. Instructor makes change (slide, annotation, etc.)
2. Change captured by respective service
3. WebSocketManager broadcasts to all connected clients
4. Clients receive and apply changes
5. State conflict resolution if needed
6. Acknowledgment sent back

## API Design

### Presentation APIs
- `POST /api/classroom/presentations` - Create presentation
- `POST /api/classroom/presentations/:id/import` - Import from source
- `GET /api/classroom/presentations` - List presentations
- `GET /api/classroom/presentations/:id` - Get presentation details
- `PUT /api/classroom/presentations/:id` - Update presentation
- `DELETE /api/classroom/presentations/:id` - Delete presentation

### Slide APIs
- `GET /api/classroom/presentations/:id/slides` - List slides
- `GET /api/classroom/slides/:id` - Get slide details
- `PUT /api/classroom/slides/:id` - Update slide
- `DELETE /api/classroom/slides/:id` - Delete slide
- `POST /api/classroom/slides/:id/reorder` - Reorder slides

### Interaction APIs
- `POST /api/classroom/slides/:id/interactions` - Create interaction
- `GET /api/classroom/slides/:id/interactions` - List interactions
- `PUT /api/classroom/interactions/:id` - Update interaction
- `DELETE /api/classroom/interactions/:id` - Delete interaction

### Session APIs
- `POST /api/classroom/sessions` - Create session
- `GET /api/classroom/sessions` - List sessions
- `GET /api/classroom/sessions/:id` - Get session details
- `POST /api/classroom/sessions/:id/start` - Start session
- `POST /api/classroom/sessions/:id/end` - End session
- `GET /api/classroom/sessions/:id/analytics` - Get analytics

### WebSocket Events
- `session:join` - Join session
- `session:leave` - Leave session
- `slide:change` - Change current slide
- `annotation:add` - Add annotation
- `annotation:remove` - Remove annotation
- `interaction:activate` - Activate interaction
- `response:submit` - Submit response
- `participant:state` - Update participant state

## Frontend Architecture

### Instructor View
- **PresentationDashboardPage** - List and manage presentations
- **PresentationEditorPage** - Edit slides and interactions
- **ClassroomSessionPage** - Live session interface
- **SessionAnalyticsPage** - Post-session analytics

### Student View
- **StudentJoinPage** - Join session via room code
- **StudentSessionPage** - Participate in live session
- **MobileSessionPage** - Mobile-optimized participation

### Shared Components
- **SlideTimeline** - Thumbnail-based slide navigation
- **SlideRenderer** - Render slide content
- **InteractionRenderer** - Render interaction types
- **ResponsePanel** - Show real-time responses
- **AnalyticsPanel** - Display session analytics
- **QRCodeDisplay** - Show QR codes for joining

## Security Considerations
- Room code expiration and regeneration
- Participant authentication via JWT
- WebSocket connection validation
- Rate limiting on API endpoints
- Content sanitization for uploaded files
- CSRF protection for state-changing operations

## Performance Optimization
- Thumbnail generation in background jobs
- WebSocket connection pooling
- Response aggregation and batching
- Lazy loading for large presentations
- Caching for frequently accessed data
- Database query optimization

## Scalability Considerations
- Horizontal scaling for WebSocket servers
- Redis for shared session state
- CDN for static assets (thumbnails, media)
- Database read replicas for analytics queries
- Background job processing for heavy operations

## Monitoring and Observability
- WebSocket connection metrics
- Session participation tracking
- API response time monitoring
- Error rate tracking
- Performance profiling for heavy operations
- User engagement analytics

## Testing Strategy
- Unit tests for all service methods
- Integration tests for API endpoints
- E2E tests for critical user flows
- Load testing for WebSocket performance
- Manual testing for UI/UX validation

## Rollout Plan
1. Phase 1: Core backend services (Presentation, Slide, Interaction engines)
2. Phase 2: Session management and real-time sync
3. Phase 3: Instructor UI and basic student view
4. Phase 4: Advanced interactions and analytics
5. Phase 5: AI recommendations and advanced features
6. Phase 6: Mobile optimization and polish

## Success Metrics
- Session creation success rate
- Average session participation rate
- WebSocket connection stability
- API response time < 200ms
- User satisfaction score
- Feature adoption rate
