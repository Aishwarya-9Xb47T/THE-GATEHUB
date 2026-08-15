/**
 * Session Recovery Hook
 *
 * Handles automatic reconnection to classroom sessions with state restoration.
 * Prevents duplicate submissions and restores student state after disconnection.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useToastStore } from '@/store/toastStore';
import { apiUrl } from "@/lib/api";

export interface RecoveryState {
  currentSlideId: string | null;
  activeInteractionId: string | null;
  settings?: Record<string, unknown>;
  navigation?: string;
  submittedInteractions: Record<string, { response: unknown; submittedAt: string }>;
  status?: string;
}

interface UseSessionRecoveryOptions {
  sessionId: string;
  userId: string;
  onReconnect?: (state: RecoveryState) => void;
  onDisconnect?: () => void;
  onReconnectWebSocket?: () => void;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RECONNECT_ATTEMPTS = 10;

export function useSessionRecovery({
  sessionId,
  userId,
  onReconnect,
  onDisconnect,
  onReconnectWebSocket,
}: UseSessionRecoveryOptions) {
  const toast = useToastStore((s) => s.add);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryState, setRecoveryState] = useState<RecoveryState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'recovering'>('connected');

  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const isActiveRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);
  const submittedInteractionsRef = useRef<Record<string, { response: unknown; submittedAt: string }>>({});
  const isRecoveringRef = useRef(false);

  const fetchRecoveryState = useCallback(async (): Promise<RecoveryState | null> => {
    if (!sessionId) return null;
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/recovery-state`), {
        headers: { Authorization: `Bearer ${localStorage.getItem('lms_token')}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch recovery state');
      }

      const data = await response.json();
      return data as RecoveryState;
    } catch (error) {
      console.error('[SessionRecovery] Failed to fetch state:', error);
      return null;
    }
  }, [sessionId]);

  const startRecovery = useCallback(async () => {
    if (!isActiveRef.current || reconnectAttempt.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus('disconnected');
      onDisconnect?.();
      return;
    }

    if (isRecoveringRef.current) return;
    isRecoveringRef.current = true;
    setIsRecovering(true);
    setConnectionStatus('recovering');

    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)];

    reconnectTimer.current = window.setTimeout(async () => {
      reconnectAttempt.current += 1;

      const state = await fetchRecoveryState();

      if (state) {
        setRecoveryState(state);
        submittedInteractionsRef.current = state.submittedInteractions || {};
        onReconnect?.(state);
        onReconnectWebSocket?.();
        reconnectAttempt.current = 0;
        setIsRecovering(false);
        isRecoveringRef.current = false;
      } else {
        isRecoveringRef.current = false;
        setIsRecovering(false);
        startRecovery();
      }
    }, delay);
  }, [fetchRecoveryState, onReconnect, onDisconnect, onReconnectWebSocket]);

  const handleDisconnect = useCallback(() => {
    if (!isActiveRef.current) return;

    setConnectionStatus('disconnected');
    onDisconnect?.();
    startRecovery();
  }, [startRecovery, onDisconnect]);

  const registerWebSocket = useCallback((ws: WebSocket) => {
    wsRef.current = ws;

    const originalOnClose = ws.onclose;
    const originalOnError = ws.onerror;

    ws.onclose = (event) => {
      if (event.code === 1000) {
        originalOnClose?.call(ws, event);
        return;
      }
      handleDisconnect();
      originalOnClose?.call(ws, event);
    };

    ws.onerror = (error) => {
      console.error('[SessionRecovery] WebSocket error:', error);
      originalOnError?.call(ws, error);
    };

    ws.onopen = () => {
      reconnectAttempt.current = 0;
      setConnectionStatus('connected');
      setIsRecovering(false);
      isRecoveringRef.current = false;
    };
  }, [handleDisconnect]);

  const isInteractionSubmitted = useCallback((interactionId: string) => {
    return submittedInteractionsRef.current[interactionId] !== undefined;
  }, []);

  const getInteractionSubmission = useCallback((interactionId: string) => {
    return submittedInteractionsRef.current[interactionId] ?? null;
  }, []);

  const recordInteractionSubmission = useCallback((interactionId: string, response: unknown) => {
    submittedInteractionsRef.current[interactionId] = {
      response,
      submittedAt: new Date().toISOString(),
    };
  }, []);

  const manualReconnect = useCallback(async () => {
    reconnectAttempt.current = 0;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }
    isRecoveringRef.current = false;
    await startRecovery();
  }, [startRecovery]);

  useEffect(() => {
    isActiveRef.current = true;

    return () => {
      isActiveRef.current = false;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, []);

  return {
    isRecovering,
    recoveryState,
    connectionStatus,
    registerWebSocket,
    isInteractionSubmitted,
    getInteractionSubmission,
    recordInteractionSubmission,
    manualReconnect,
    fetchRecoveryState,
  };
}
