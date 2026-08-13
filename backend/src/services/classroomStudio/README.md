# Interactive Classroom Studio - Backend Implementation Guide

## Overview

The Interactive Classroom Studio is a premium real-time teaching platform that allows instructors to teach from presentations (PowerPoint, Google Slides, PDF) while interacting with students through various engagement tools.

## What Has Been Built

### 1. Database Schema
The database schema includes the following models:
- `Presentation` - Core presentation entity
- `Slide` - Individual slides with content and metadata
- `Interaction` - Interactive elements (polls, quizzes, word clouds, etc.)
- `ClassroomSession` - Live session management
- `ClassroomParticipant` - Student participation tracking
- `InteractionResponse` - Student responses to interactions
- `ClassroomSessionAnalytics` - Session analytics and metrics

### 2. Core Services

#### Presentation Engine (`presentationService.ts`)
- Create, update, delete presentations
- Duplicate presentations
- Get presentation statistics
- Status management (draft, ready, archived)

#### Slide Engine (`slideService.ts`)
- Create, update, delete slides
- Reorder slides
- Duplicate slides
- Thumbnail management
- Slide visibility and lock management

#### Interaction Engine (`interactionService.ts`)
- Support for 15+ interaction types:
  - poll, mcq, multiple_select, true_false
  - word_cloud, open_answer, quiz, rating
  - reaction, emoji_voting, code_challenge
  - image_annotation, drawing, file_upload
  - discussion, attendance_check, exit_ticket
  - reflection, ai_question
- Interaction validation and grading
- Response tracking

#### Session Engine (`sessionService.ts`)
- Create and manage live sessions
- Room code generation
- Session lifecycle (scheduled, active, completed, cancelled)
- Current slide and active interaction management
- Session settings and configuration

#### Participant Service (`participantService.ts`)
- Student join/leave management
- Real-time status tracking (online, offline, left)
- Raise hand functionality
- Device and browser tracking
- Participant statistics

#### Response Service (`responseService.ts`)
- Response submission and tracking
- Automatic grading for objective questions
- Response time tracking
- Response summaries and analytics

#### QR Code Engine (`qrCodeService.ts`)
- Generate QR codes for sessions, slides, and interactions
- QR code data parsing
- Custom QR code generation
- URL-based QR codes for easy joining

#### Analytics Engine (`analyticsService.ts`)
- Real-time session analytics
- Slide-by-slide performance metrics
- Participation and accuracy tracking
- Engagement scoring
- Post-class report generation
- Export to PDF, Excel, and JSON

#### AI Recommendation Engine (`aiRecommendationService.ts`)
- Slide content analysis
- Interaction type recommendations
- Quiz question generation
- Teaching insights and recommendations
- Confused topic identification
- Struggling student detection

#### Import Services
- **PowerPoint Parser** (`powerPointParser.ts`) - Parse .pptx files and extract slides
- **Google Slides Adapter** (`googleSlidesAdapter.ts`) - Import from Google Slides API
- **Presentation Import Service** (`presentationImportService.ts`) - Unified import interface

### 3. Real-Time Sync Engine (`classroomStudioServer.ts`)
WebSocket server for real-time synchronization:
- Slide change broadcasting
- Annotation synchronization
- Interaction activation/deactivation
- Response submission
- Participant state updates
- Connection management and heartbeat

### 4. API Routes (`classroomStudio.ts`)
Complete REST API with endpoints for:
- Presentations (`/api/classroom-studio/presentations`)
- Slides (`/api/classroom-studio/slides`)
- Interactions (`/api/classroom-studio/interactions`)
- Sessions (`/api/classroom-studio/sessions`)
- Participants (`/api/classroom-studio/sessions/:sessionId/participants`)
- Responses (`/api/classroom-studio/sessions/:sessionId/responses`)
- QR Codes (`/api/classroom-studio/sessions/:sessionId/qr`)
- Analytics (`/api/classroom-studio/sessions/:sessionId/analytics`)
- AI Recommendations (`/api/classroom-studio/slides/:slideId/analyze`)
- Import (`/api/classroom-studio/import`)

## Installation and Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

The following new dependencies have been added:
- `jszip` - For PowerPoint file parsing
- `@types/jszip` - TypeScript definitions

### 2. Database Migration
The database schema is already included in the main Prisma schema. Run:
```bash
npm run db:push
```

### 3. Environment Variables
Ensure the following environment variables are configured:
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_CLIENT_ID` - For Google Slides integration
- `GOOGLE_CLIENT_SECRET` - For Google Slides integration
- `GOOGLE_REDIRECT_URI` - OAuth callback URL
- `FRONTEND_URL` - Frontend application URL for QR code generation

## API Usage Examples

### Create a Presentation
```typescript
POST /api/classroom-studio/presentations
{
  "title": "Introduction to React",
  "description": "Basic React concepts",
  "sourceType": "manual"
}
```

### Import from PowerPoint
```typescript
POST /api/classroom-studio/import
Content-Type: multipart/form-data

{
  "title": "Imported Presentation",
  "sourceType": "powerpoint",
  "file": <binary file>
}
```

### Import from Google Slides
```typescript
POST /api/classroom-studio/import
{
  "title": "Google Slides Presentation",
  "sourceType": "google_slides",
  "sourceUrl": "presentation-id-from-google"
}
```

### Create a Session
```typescript
POST /api/classroom-studio/sessions
{
  "presentationId": "presentation-id",
  "title": "Live Session",
  "scheduledAt": "2024-01-15T10:00:00Z"
}
```

### Start a Session
```typescript
POST /api/classroom-studio/sessions/:id/start
```

### Join as Student
```typescript
POST /api/classroom-studio/sessions/:sessionId/join
{
  "device": "mobile",
  "browser": "chrome"
}
```

### Submit Response
```typescript
POST /api/classroom-studio/sessions/:sessionId/interactions/:interactionId/responses
{
  "participantId": "participant-id",
  "response": "option-a",
  "duration": 15
}
```

### Get Real-Time Analytics
```typescript
GET /api/classroom-studio/sessions/:sessionId/analytics/realtime
```

### Generate Session Report
```typescript
GET /api/classroom-studio/sessions/:sessionId/analytics/report
```

### Export Report
```typescript
GET /api/classroom-studio/sessions/:sessionId/analytics/export?format=pdf
```

## WebSocket Integration

### Connection URL
```
ws://localhost:5000/ws/classroom-studio?sessionId=xxx&userId=xxx&role=instructor
```

### Message Types

#### From Client
```typescript
// Change slide
{
  "type": "slide:change",
  "data": {
    "slideId": "slide-id",
    "slideOrder": 1
  }
}

// Add annotation
{
  "type": "annotation:add",
  "data": {
    "slideId": "slide-id",
    "annotation": { ... }
  }
}

// Activate interaction
{
  "type": "interaction:activate",
  "data": {
    "interactionId": "interaction-id"
  }
}

// Submit response
{
  "type": "response:submit",
  "data": {
    "interactionId": "interaction-id",
    "participantId": "participant-id",
    "response": "option-a"
  }
}

// Update participant state
{
  "type": "participant:state",
  "data": {
    "participantId": "participant-id",
    "status": "online",
    "raisedHand": true
  }
}
```

#### From Server
```typescript
// Connection established
{
  "type": "connected",
  "data": {
    "sessionId": "session-id",
    "currentSlideId": "slide-id",
    "activeInteractionId": "interaction-id"
  }
}

// Participant joined
{
  "type": "participant:joined",
  "data": {
    "userId": "user-id",
    "role": "student"
  }
}

// Slide changed
{
  "type": "slide:change",
  "data": {
    "slideId": "slide-id",
    "slideOrder": 1
  }
}

// Response received (instructor only)
{
  "type": "response:submit",
  "data": {
    "interactionId": "interaction-id",
    "participantId": "participant-id",
    "response": "option-a"
  }
}
```

## Frontend Integration Guide

### 1. API Client
Create a TypeScript client for the API:

```typescript
// classroomStudioApi.ts
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/classroom-studio',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const classroomStudioApi = {
  // Presentations
  createPresentation: (data) => api.post('/presentations', data),
  getPresentations: (params) => api.get('/presentations', { params }),
  getPresentation: (id) => api.get(`/presentations/${id}`),
  updatePresentation: (id, data) => api.put(`/presentations/${id}`, data),
  deletePresentation: (id) => api.delete(`/presentations/${id}`),
  
  // Slides
  createSlide: (data) => api.post('/slides', data),
  getSlides: (presentationId) => api.get(`/presentations/${presentationId}/slides`),
  updateSlide: (id, data) => api.put(`/slides/${id}`, data),
  deleteSlide: (id) => api.delete(`/slides/${id}`),
  reorderSlides: (presentationId, slides) => 
    api.post(`/presentations/${presentationId}/slides/reorder`, { slides }),
  
  // Interactions
  createInteraction: (data) => api.post('/interactions', data),
  getInteractions: (slideId) => api.get(`/slides/${slideId}/interactions`),
  updateInteraction: (id, data) => api.put(`/interactions/${id}`, data),
  deleteInteraction: (id) => api.delete(`/interactions/${id}`),
  
  // Sessions
  createSession: (data) => api.post('/sessions', data),
  getSessions: (params) => api.get('/sessions', { params }),
  getSession: (id) => api.get(`/sessions/${id}`),
  startSession: (id) => api.post(`/sessions/${id}/start`),
  endSession: (id) => api.post(`/sessions/${id}/end`),
  updateCurrentSlide: (id, slideId) => 
    api.post(`/sessions/${id}/current-slide`, { slideId }),
  
  // Analytics
  getRealTimeAnalytics: (sessionId) => 
    api.get(`/sessions/${sessionId}/analytics/realtime`),
  getSessionReport: (sessionId) => 
    api.get(`/sessions/${sessionId}/analytics/report`),
  
  // Import
  importPresentation: (data) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      formData.append(key, data[key]);
    });
    return api.post('/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
};
```

### 2. WebSocket Client
```typescript
// classroomStudioSocket.ts
class ClassroomStudioSocket {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private userId: string;
  private role: 'instructor' | 'student';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(sessionId: string, userId: string, role: 'instructor' | 'student') {
    this.sessionId = sessionId;
    this.userId = userId;
    this.role = role;
  }

  connect() {
    const wsUrl = `ws://localhost:5000/ws/classroom-studio?sessionId=${this.sessionId}&userId=${this.userId}&role=${this.role}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to Classroom Studio');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('Disconnected from Classroom Studio');
      this.attemptReconnect();
    };
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'connected':
        console.log('Session connected:', message.data);
        break;
      case 'slide:change':
        console.log('Slide changed:', message.data);
        break;
      case 'response:submit':
        console.log('Response received:', message.data);
        break;
      // Handle other message types
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Reconnection attempt ${this.reconnectAttempts}`);
        this.connect();
      }, 1000 * this.reconnectAttempts);
    }
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
```

### 3. React Hooks
```typescript
// useClassroomSession.ts
import { useState, useEffect } from 'react';
import { classroomStudioApi } from './classroomStudioApi';
import { ClassroomStudioSocket } from './classroomStudioSocket';

export function useClassroomSession(sessionId: string) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<ClassroomStudioSocket | null>(null);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    try {
      const response = await classroomStudioApi.getSession(sessionId);
      setSession(response.data);
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectWebSocket = (userId: string, role: 'instructor' | 'student') => {
    const ws = new ClassroomStudioSocket(sessionId, userId, role);
    ws.connect();
    setSocket(ws);
  };

  const changeSlide = async (slideId: string) => {
    await classroomStudioApi.updateCurrentSlide(sessionId, slideId);
    socket?.send({
      type: 'slide:change',
      data: { slideId },
    });
  };

  return {
    session,
    loading,
    connectWebSocket,
    changeSlide,
  };
}
```

## Testing the Backend

### 1. Start the Backend Server
```bash
npm run dev
```

### 2. Test API Endpoints
Use Postman or curl to test the endpoints:

```bash
# Create a presentation
curl -X POST http://localhost:5000/api/classroom-studio/presentations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Presentation","sourceType":"manual"}'

# Get presentations
curl http://localhost:5000/api/classroom-studio/presentations \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create a session
curl -X POST http://localhost:5000/api/classroom-studio/sessions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"presentationId":"PRESENTATION_ID"}'
```

### 3. Test WebSocket Connection
Use a WebSocket client to connect to:
```
ws://localhost:5000/ws/classroom-studio?sessionId=SESSION_ID&userId=USER_ID&role=instructor
```

## Next Steps for Frontend Development

### Priority 1: Core Instructor UI
1. **Presentation Dashboard** - List and manage presentations
2. **Presentation Editor** - Edit slides and add interactions
3. **Session Management** - Create and start sessions
4. **Live Session Interface** - Real-time teaching interface

### Priority 2: Core Student UI
1. **Join Session** - Room code or QR code entry
2. **Session View** - View current slide and interactions
3. **Response Interface** - Submit responses to interactions
4. **Mobile Optimization** - Ensure great mobile experience

### Priority 3: Advanced Features
1. **Analytics Dashboard** - Real-time and post-class analytics
2. **AI Recommendations** - Display AI-powered insights
3. **Import Interface** - File upload and Google Slides integration
4. **Export Features** - Report generation and download

## Security Considerations

1. **Authentication** - All endpoints require JWT authentication
2. **Authorization** - Role-based access control (instructor vs student)
3. **Session Validation** - WebSocket connections validate session access
4. **Rate Limiting** - Implement rate limiting for API endpoints
5. **Input Validation** - Validate all user inputs

## Performance Optimization

1. **Database Indexing** - Ensure proper indexes on frequently queried fields
2. **Caching** - Cache presentation and session data
3. **WebSocket Pooling** - Manage WebSocket connections efficiently
4. **Background Jobs** - Process heavy operations (thumbnail generation) in background
5. **CDN** - Serve static assets through CDN

## Monitoring and Observability

1. **Logging** - Implement comprehensive logging
2. **Metrics** - Track API response times, WebSocket connections
3. **Error Tracking** - Monitor and alert on errors
4. **Performance Monitoring** - Track system performance

## Support and Maintenance

For issues or questions:
1. Check the architecture documentation: `ARCHITECTURE.md`
2. Review the type definitions: `types.ts`
3. Examine service implementations for detailed logic
4. Test API endpoints using the provided examples

## Conclusion

The Interactive Classroom Studio backend is now fully implemented with all core engines, services, and APIs. The system is ready for frontend integration and testing. The modular architecture allows for easy extension and maintenance of individual components.