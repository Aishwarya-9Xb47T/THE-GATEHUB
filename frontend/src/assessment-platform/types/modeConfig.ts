/**
 * Assessment mode presets — same player shell, different behavior config.
 */

import type { AssessmentMode, DeploymentSettings } from "./index";

export interface ModeShellConfig {
  mode: AssessmentMode;
  label: string;
  showTimer: boolean;
  showProgress: boolean;
  showNavigation: boolean;
  allowReview: boolean;
  allowSkip: boolean;
  autoSave: boolean;
  offlineCapable: boolean;
  gamificationOverlay: boolean;
  defaultOverlays: string[];
  settingsOverrides: Partial<DeploymentSettings>;
}

const BASE_SETTINGS: DeploymentSettings = {
  timerPolicy: "none",
  shuffleQuestions: false,
  shuffleOptions: false,
  gamificationEnabled: false,
  showExplanations: true,
  showCorrectAnswer: true,
  maxAttempts: 1,
};

export const MODE_PRESETS: Record<AssessmentMode, ModeShellConfig> = {
  practice: {
    mode: "practice",
    label: "Practice",
    showTimer: false,
    showProgress: true,
    showNavigation: true,
    allowReview: true,
    allowSkip: true,
    autoSave: true,
    offlineCapable: true,
    gamificationOverlay: false,
    defaultOverlays: ["ai_hint", "bookmark", "report_issue"],
    settingsOverrides: { ...BASE_SETTINGS, showExplanations: true, maxAttempts: 99 },
  },
  homework: {
    mode: "homework",
    label: "Homework",
    showTimer: false,
    showProgress: true,
    showNavigation: true,
    allowReview: true,
    allowSkip: false,
    autoSave: true,
    offlineCapable: true,
    gamificationOverlay: false,
    defaultOverlays: ["calculator", "formula_sheet", "bookmark"],
    settingsOverrides: { ...BASE_SETTINGS, maxAttempts: 3 },
  },
  assignment: {
    mode: "assignment",
    label: "Assignment",
    showTimer: false,
    showProgress: true,
    showNavigation: true,
    allowReview: true,
    allowSkip: false,
    autoSave: true,
    offlineCapable: true,
    gamificationOverlay: false,
    defaultOverlays: ["calculator", "scratch_pad", "bookmark"],
    settingsOverrides: { ...BASE_SETTINGS, maxAttempts: 1 },
  },
  live_quiz: {
    mode: "live_quiz",
    label: "Live Quiz",
    showTimer: true,
    showProgress: true,
    showNavigation: false,
    allowReview: false,
    allowSkip: false,
    autoSave: true,
    offlineCapable: false,
    gamificationOverlay: true,
    defaultOverlays: [],
    settingsOverrides: {
      ...BASE_SETTINGS,
      timerPolicy: "per_question",
      questionTimerSeconds: 30,
      gamificationEnabled: true,
      showExplanations: false,
    },
  },
  mock_test: {
    mode: "mock_test",
    label: "Mock Test",
    showTimer: true,
    showProgress: true,
    showNavigation: true,
    allowReview: false,
    allowSkip: false,
    autoSave: true,
    offlineCapable: true,
    gamificationOverlay: false,
    defaultOverlays: ["calculator", "formula_sheet"],
    settingsOverrides: {
      ...BASE_SETTINGS,
      timerPolicy: "global",
      globalTimerMinutes: 60,
      maxAttempts: 1,
    },
  },
  timed_assessment: {
    mode: "timed_assessment",
    label: "Exam",
    showTimer: true,
    showProgress: true,
    showNavigation: true,
    allowReview: true,
    allowSkip: false,
    autoSave: true,
    offlineCapable: true,
    gamificationOverlay: false,
    defaultOverlays: ["calculator"],
    settingsOverrides: {
      ...BASE_SETTINGS,
      timerPolicy: "strict_lock",
      globalTimerMinutes: 90,
      maxAttempts: 1,
    },
  },
  coding_assessment: {
    mode: "coding_assessment",
    label: "Coding Assessment",
    showTimer: true,
    showProgress: true,
    showNavigation: true,
    allowReview: true,
    allowSkip: false,
    autoSave: true,
    offlineCapable: false,
    gamificationOverlay: false,
    defaultOverlays: ["scratch_pad", "ai_tutor"],
    settingsOverrides: {
      ...BASE_SETTINGS,
      timerPolicy: "global",
      globalTimerMinutes: 120,
    },
  },
  adaptive: {
    mode: "adaptive",
    label: "Adaptive Learning",
    showTimer: false,
    showProgress: true,
    showNavigation: false,
    allowReview: false,
    allowSkip: false,
    autoSave: true,
    offlineCapable: true,
    gamificationOverlay: false,
    defaultOverlays: ["ai_hint", "ai_tutor"],
    settingsOverrides: { ...BASE_SETTINGS, showExplanations: true },
  },
  ai_interview: {
    mode: "ai_interview",
    label: "AI Interview",
    showTimer: true,
    showProgress: true,
    showNavigation: false,
    allowReview: false,
    allowSkip: false,
    autoSave: true,
    offlineCapable: false,
    gamificationOverlay: false,
    defaultOverlays: ["notes_panel", "translate"],
    settingsOverrides: {
      ...BASE_SETTINGS,
      timerPolicy: "per_question",
      questionTimerSeconds: 120,
    },
  },
  survey: {
    mode: "survey",
    label: "Survey",
    showTimer: false,
    showProgress: true,
    showNavigation: true,
    allowReview: true,
    allowSkip: true,
    autoSave: true,
    offlineCapable: true,
    gamificationOverlay: false,
    defaultOverlays: [],
    settingsOverrides: {
      ...BASE_SETTINGS,
      showExplanations: false,
      showCorrectAnswer: false,
      maxAttempts: 1,
    },
  },
  poll: {
    mode: "poll",
    label: "Poll",
    showTimer: false,
    showProgress: false,
    showNavigation: false,
    allowReview: false,
    allowSkip: false,
    autoSave: true,
    offlineCapable: false,
    gamificationOverlay: false,
    defaultOverlays: [],
    settingsOverrides: {
      ...BASE_SETTINGS,
      showExplanations: false,
      showCorrectAnswer: false,
    },
  },
};

export function getModeConfig(mode: AssessmentMode): ModeShellConfig {
  return MODE_PRESETS[mode];
}

export function mergeModeSettings(mode: AssessmentMode, overrides?: Partial<DeploymentSettings>): DeploymentSettings {
  const preset = MODE_PRESETS[mode];
  return { ...BASE_SETTINGS, ...preset.settingsOverrides, ...overrides };
}
