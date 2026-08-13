import { useEffect, useRef, useState } from "react";

interface ProctoringOptions {
  sessionId: string;
  participantId: string | null;
  settings: any;
  enabled: boolean;
  send: (msg: object) => boolean;
}

export function useLiveStudentProctoring({
  sessionId,
  participantId,
  settings,
  enabled,
  send,
}: ProctoringOptions) {
  const [hasCameraAccess, setHasCameraAccess] = useState<boolean | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [privateMessages, setPrivateMessages] = useState<Array<{ text: string; time: Date }>>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hasCameraAccessRef = useRef<boolean | null>(null);

  const captureScreenshot = () => {
    if (!videoRef.current || !canvasRef.current || !streamRef.current) return null;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState === "ended" || !videoTrack.enabled) return null;
    
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.4);
      }
    } catch (err: any) {
      console.warn("Failed to capture snapshot:", err);
    }
    return null;
  };

  // Keep ref in sync with state
  useEffect(() => {
    hasCameraAccessRef.current = hasCameraAccess;
  }, [hasCameraAccess]);

  // 1. Setup Camera Access if Camera is required
  useEffect(() => {
    if (!enabled || !participantId || !settings?.cameraRequired) return;

    let active = true;
    let trackEndedListener: (() => void) | null = null;
    let trackMuteListener: (() => void) | null = null;
    let trackUnmuteListener: (() => void) | null = null;

    const handleTrackChange = () => {
      if (!active) return;
      const videoTrack = streamRef.current?.getVideoTracks()[0];
      const isCameraOn = !!(videoTrack && videoTrack.readyState !== "ended" && videoTrack.enabled);
      
      if (hasCameraAccessRef.current !== isCameraOn) {
        setHasCameraAccess(isCameraOn);
        send({
          type: "client:media_state",
          cameraOn: isCameraOn,
          micOn: false,
        });
        
        if (!isCameraOn) {
          send({
            type: "client:violation",
            violationType: "camera_blocked",
            details: "Camera track ended or disabled",
          });
        }
      }
    };

    async function initCamera() {
      try {
        const constraints = {
          video: { width: 160, height: 120, facingMode: "user" },
          audio: false, // only video frames for proctoring snapshots
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!active) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(mediaStream);
        streamRef.current = mediaStream;
        setHasCameraAccess(true);

        // Send media state update
        send({
          type: "client:media_state",
          cameraOn: true,
          micOn: false,
        });

        // Bind stream to hidden video element
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }

        // Add track event listeners
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          trackEndedListener = () => handleTrackChange();
          trackMuteListener = () => handleTrackChange();
          trackUnmuteListener = () => handleTrackChange();
          
          videoTrack.addEventListener("ended", trackEndedListener);
          videoTrack.addEventListener("mute", trackMuteListener);
          videoTrack.addEventListener("unmute", trackUnmuteListener);
        }
      } catch (err: any) {
        console.error("Camera access failed:", err);
        if (active) {
          setHasCameraAccess(false);
          send({
            type: "client:media_state",
            cameraOn: false,
            micOn: false,
          });
          send({
            type: "client:violation",
            violationType: "camera_blocked",
            details: "Webcam access denied by student or system",
          });
        }
      }
    }

    initCamera();

    return () => {
      active = false;
      const videoTrack = streamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        if (trackEndedListener) videoTrack.removeEventListener("ended", trackEndedListener);
        if (trackMuteListener) videoTrack.removeEventListener("mute", trackMuteListener);
        if (trackUnmuteListener) videoTrack.removeEventListener("unmute", trackUnmuteListener);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [enabled, participantId, settings?.cameraRequired, send]);

  // Periodic Snapshot upload and verification
  useEffect(() => {
    if (!enabled || !participantId || !settings?.cameraRequired || !hasCameraAccess) return;

    const interval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current || !streamRef.current) return;

      // Ensure tracks are still enabled and running
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState === "ended" || !videoTrack.enabled) {
        send({
          type: "client:violation",
          violationType: "camera_blocked",
          details: "Student disabled webcam track",
        });
        return;
      }

      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.4); // compressed JPEG snapshot
        send({
          type: "client:snapshot",
          frame: dataUrl,
        });
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [enabled, participantId, settings?.cameraRequired, hasCameraAccess, send]);

  // AI Proctoring Checks (Simulated)
  useEffect(() => {
    if (!enabled || !participantId || !settings?.cameraRequired || !hasCameraAccess) return;

    const aiInterval = setInterval(() => {
      if (Math.random() < 0.15) {
        const alerts = [
          { type: "multiple_faces", details: "AI Alert: Multiple faces detected in front of screen" },
          { type: "no_face", details: "AI Alert: No face detected in camera viewport" },
          { type: "phone_detected", details: "AI Alert: Mobile phone device detected in student hand" },
        ];
        const alert = alerts[Math.floor(Math.random() * alerts.length)];
        send({
          type: "client:violation",
          violationType: alert.type,
          details: alert.details,
          screenshot: captureScreenshot(),
        });
      }
    }, 45000);

    return () => clearInterval(aiInterval);
  }, [enabled, participantId, settings?.cameraRequired, hasCameraAccess, send]);

  // 2. Tab Visibility and Window focus detection
  useEffect(() => {
    if (!enabled || !participantId || !settings?.tabDetection) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        send({
          type: "client:violation",
          violationType: "tab_switch",
          details: "Student switched tab or minimized browser window",
          screenshot: captureScreenshot(),
        });
      }
    };

    const handleBlur = () => {
      send({
        type: "client:violation",
        violationType: "focus_loss",
        details: "Student clicked away from the assessment window",
        screenshot: captureScreenshot(),
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [enabled, participantId, settings?.tabDetection, send]);

  // 3. Fullscreen check and enforce
  useEffect(() => {
    if (!enabled || !participantId || !settings?.fullscreenLock) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        send({
          type: "client:violation",
          violationType: "fullscreen_exit",
          details: "Student exited fullscreen mode",
          screenshot: captureScreenshot(),
        });
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [enabled, participantId, settings?.fullscreenLock, send]);

  // 4. Browser copy/paste and contextmenu block
  useEffect(() => {
    if (!enabled || !participantId || !settings?.browserLock) return;

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      send({
        type: "client:violation",
        violationType: "clipboard_attempt",
        details: "Copy event blocked",
        screenshot: captureScreenshot(),
      });
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      send({
        type: "client:violation",
        violationType: "clipboard_attempt",
        details: "Paste event blocked",
        screenshot: captureScreenshot(),
      });
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent PrintScreen key
      if (e.key === "PrintScreen") {
        e.preventDefault();
        send({
          type: "client:violation",
          violationType: "screenshot_attempt",
          details: "PrintScreen key combination blocked",
          screenshot: captureScreenshot(),
        });
      }
      // Prevent developer tools shortcuts F12, Ctrl+Shift+I, Cmd+Opt+I
      if (
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C" || e.key === "i" || e.key === "j" || e.key === "c"))
      ) {
        e.preventDefault();
        send({
          type: "client:violation",
          violationType: "devtools_block",
          details: "Developer tools hotkey combination blocked",
          screenshot: captureScreenshot(),
        });
      }
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, participantId, settings?.browserLock, send]);

  // 5. Periodic telemetry updates
  useEffect(() => {
    if (!enabled || !participantId) return;

    async function sendTelemetry() {
      let batteryStatus = "100%";
      try {
        if ("getBattery" in navigator) {
          const battery: any = await (navigator as any).getBattery();
          batteryStatus = `${Math.round(battery.level * 100)}%${battery.charging ? " 🔌" : ""}`;
        }
      } catch {}

      const browser = navigator.userAgent.split(" ").slice(-2).join(" ");
      const tabFocused = document.hasFocus();
      const fullscreen = !!document.fullscreenElement;
      const networkStatus = navigator.onLine ? "good" : "disconnected";

      send({
        type: "client:telemetry",
        batteryStatus,
        browser,
        tabFocused,
        fullscreen,
        networkStatus,
      });
    }

    sendTelemetry(); // Initial send
    const interval = setInterval(sendTelemetry, 10000);

    return () => clearInterval(interval);
  }, [enabled, participantId, send]);

  // 6. Listen to custom websocket alerts dispatched by useLiveSessionSocket
  useEffect(() => {
    if (!enabled || !participantId) return;

    const handleWarning = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setWarningMessage(detail.message);
    };

    const handlePrivateMsg = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setPrivateMessages((prev) => [...prev, { text: detail.message, time: new Date() }]);
    };

    const handleKick = () => {
      setKicked(true);
    };

    const handleRemoteMuteMic = () => {
      // Stream tracks muting
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
    };

    const handleRemoteDisableCam = () => {
      // Stream tracks disabling
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = false;
        });
      }
    };

    window.addEventListener("live-session:warning", handleWarning);
    window.addEventListener("live-session:private-message", handlePrivateMsg);
    window.addEventListener("live-session:kicked", handleKick);
    window.addEventListener("live-session:mute-mic", handleRemoteMuteMic);
    window.addEventListener("live-session:disable-camera", handleRemoteDisableCam);

    return () => {
      window.removeEventListener("live-session:warning", handleWarning);
      window.removeEventListener("live-session:private-message", handlePrivateMsg);
      window.removeEventListener("live-session:kicked", handleKick);
      window.removeEventListener("live-session:mute-mic", handleRemoteMuteMic);
      window.removeEventListener("live-session:disable-camera", handleRemoteDisableCam);
    };
  }, [enabled, participantId]);

  return {
    hasCameraAccess,
    stream,
    warningMessage,
    clearWarning: () => setWarningMessage(null),
    kicked,
    privateMessages,
    videoRef,
    canvasRef,
  };
}
