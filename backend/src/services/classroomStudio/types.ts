/**
 * Interactive Classroom Studio Type Definitions
 */

export type PresentationSourceType = 'powerpoint' | 'google_slides' | 'pdf' | 'manual';
export type PresentationStatus = 'draft' | 'ready' | 'archived';
export type SessionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type ParticipantStatus = 'online' | 'offline' | 'left';

export type InteractionType = 
  | 'poll'
  | 'mcq'
  | 'multiple_select'
  | 'true_false'
  | 'word_cloud'
  | 'open_answer'
  | 'quiz'
  | 'rating'
  | 'reaction'
  | 'emoji_voting'
  | 'code_challenge'
  | 'image_annotation'
  | 'drawing'
  | 'file_upload'
  | 'discussion'
  | 'attendance_check'
  | 'exit_ticket'
  | 'reflection'
  | 'ai_question';

export interface Presentation {
  id: string;
  title: string;
  description?: string | null;
  sourceType: PresentationSourceType;
  sourceUrl?: string | null;
  thumbnail?: string | null;
  status: PresentationStatus;
  instructorId: string;
  courseId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  slides?: Slide[];
  instructor?: any;
  _count?: any;
}

export interface Slide {
  id: string;
  presentationId: string;
  order: number;
  title: string;
  content?: any;
  thumbnail?: string | null;
  notes?: string | null;
  isLocked: boolean;
  isHidden: boolean;
  isImportant: boolean;
  createdAt: Date;
  updatedAt: Date;
  interactions?: Interaction[];
}

export interface Interaction {
  id: string;
  slideId: string;
  type: InteractionType;
  title?: string | null;
  question?: string | null;
  options?: any;
  settings?: InteractionSettings;
  duration?: number | null;
  points: number;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InteractionSettings {
  anonymous?: boolean;
  multipleSelection?: boolean;
  showResults?: boolean;
  correctAnswer?: string | string[];
  timerEnabled?: boolean;
  allowRevote?: boolean;
  maxRating?: number;
  wordCloudMaxWords?: number;
  [key: string]: any;
}

export interface ClassroomSession {
  id: string;
  presentationId: string;
  instructorId: string;
  title?: string | null;
  roomCode: string;
  status: SessionStatus;
  scheduledAt?: Date | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  currentSlideId?: string | null;
  activeInteractionId?: string | null;
  settings?: any;
  createdAt: Date;
  updatedAt: Date;
  presentation?: any;
  instructor?: any;
  participants?: any[];
  analytics?: any;
  _count?: any;
}

export interface ClassroomParticipant {
  id: string;
  sessionId: string;
  userId: string;
  joinedAt: Date;
  lastSeenAt?: Date | null;
  status: ParticipantStatus;
  device?: string | null;
  browser?: string | null;
  raisedHand: boolean;
  user?: any;
}

export interface InteractionResponse {
  id: string;
  sessionId: string;
  interactionId: string;
  participantId: string;
  response: any;
  duration?: number | null;
  submittedAt: Date;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
}

export interface ClassroomSessionAnalytics {
  id: string;
  sessionId: string;
  totalParticipants: number;
  activeParticipants: number;
  totalResponses: number;
  averageResponseTime?: number | null;
  participationRate?: number | null;
  accuracyRate?: number | null;
  engagementScore?: number | null;
  mostEngagedSlide?: string | null;
  leastEngagedSlide?: string | null;
  data?: any;
  createdAt: Date;
  updatedAt: Date;
}

// Input types
export interface CreatePresentationInput {
  title: string;
  description?: string;
  sourceType: PresentationSourceType;
  sourceUrl?: string;
  courseId?: string;
}

export interface UpdatePresentationInput {
  title?: string;
  description?: string;
  thumbnail?: string;
  status?: PresentationStatus;
  courseId?: string;
}

export interface CreateSlideInput {
  presentationId: string;
  order: number;
  title: string;
  content?: any;
  notes?: string;
  isLocked?: boolean;
  isHidden?: boolean;
  isImportant?: boolean;
}

export interface UpdateSlideInput {
  title?: string;
  content?: any;
  notes?: string;
  isLocked?: boolean;
  isHidden?: boolean;
  isImportant?: boolean;
}

export interface CreateInteractionInput {
  slideId: string;
  type?: InteractionType;
  title?: string;
  question?: string;
  options?: any;
  settings?: InteractionSettings;
  duration?: number;
  points?: number;
  order?: number;
}

export interface UpdateInteractionInput {
  type?: InteractionType;
  title?: string;
  question?: string;
  options?: any;
  settings?: InteractionSettings;
  duration?: number;
  points?: number;
  order?: number;
}

export interface CreateSessionInput {
  presentationId: string;
  title?: string;
  scheduledAt?: Date;
  settings?: any;
}

export interface UpdateSessionInput {
  title?: string;
  scheduledAt?: Date;
  settings?: any;
}

// WebSocket event types
export interface WebSocketEvent {
  type: string;
  sessionId: string;
  data?: any;
  timestamp: Date;
}

export interface SlideChangeEvent {
  type: 'slide:change';
  data: {
    slideId: string;
    slideOrder: number;
  };
}

export interface AnnotationEvent {
  type: 'annotation:add' | 'annotation:remove' | 'annotation:clear';
  data: {
    slideId: string;
    annotation: any;
  };
}

export interface InteractionActivateEvent {
  type: 'interaction:activate' | 'interaction:deactivate';
  data: {
    interactionId: string;
  };
}

export interface ResponseSubmitEvent {
  type: 'response:submit';
  data: {
    interactionId: string;
    participantId: string;
    response: any;
  };
}

export interface ParticipantStateEvent {
  type: 'participant:state';
  data: {
    participantId: string;
    status: ParticipantStatus;
    raisedHand?: boolean;
  };
}

// Import types
export interface ImportResult {
  success: boolean;
  slides?: Array<{
    title: string;
    content: any;
    notes?: string;
  }>;
  stage?: string;
  slideNumber?: number;
  stack?: string;
  /** Package-level information retained so imports can be traced/re-synchronised. */
  metadata?: Record<string, unknown>;
  /** Internal only: binary package assets persisted by presentationImportService. */
  assets?: Array<{ path: string; data: Buffer; mimeType: string }>;
  error?: string;
}

export interface PowerPointImportOptions {
  extractNotes: boolean;
  generateThumbnails: boolean;
  preserveAnimations: boolean;
}

export interface GoogleSlidesImportOptions {
  extractNotes: boolean;
  generateThumbnails: boolean;
  syncChanges: boolean;
}
