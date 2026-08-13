/**
 * AI Recommendation Service
 * AI-powered insights and recommendations for Interactive Classroom Studio
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';

export interface SlideAnalysis {
  slideId: string;
  contentSummary: string;
  keyConcepts: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  suggestedInteractions: Array<{
    type: string;
    title: string;
    question: string;
    confidence: number;
  }>;
  potentialQuizQuestions: Array<{
    question: string;
    options: string[];
    correctAnswer: string;
    confidence: number;
  }>;
  learningObjectives: string[];
  bloomTaxonomyLevel: string;
}

export interface TeachingInsight {
  sessionId: string;
  overallEngagement: number;
  strongPoints: string[];
  improvementAreas: string[];
  recommendations: Array<{
    type: 'content' | 'delivery' | 'interaction' | 'timing';
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  confusedTopics: string[];
  bestPerformingSlides: string[];
  strugglingStudents: string[];
}

export async function analyzeSlideContent(
  slideId: string,
  content: any
): Promise<SlideAnalysis> {
  // Extract text content from slide
  const textContent = extractTextFromContent(content);
  
  // Analyze content using AI (simplified - would use OpenAI in production)
  const keyConcepts = extractKeyConcepts(textContent);
  const difficulty = assessDifficulty(textContent, keyConcepts);
  const suggestedInteractions = generateInteractionSuggestions(textContent, keyConcepts, difficulty);
  const potentialQuizQuestions = generateQuizQuestions(textContent, keyConcepts);
  const learningObjectives = deriveLearningObjectives(textContent, keyConcepts);
  const bloomTaxonomyLevel = determineBloomLevel(textContent, difficulty);

  return {
    slideId,
    contentSummary: textContent.substring(0, 200) + '...',
    keyConcepts,
    difficulty,
    suggestedInteractions,
    potentialQuizQuestions,
    learningObjectives,
    bloomTaxonomyLevel,
  };
}

export async function generateTeachingInsights(sessionId: string): Promise<TeachingInsight> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      presentation: {
        include: {
          slides: {
            include: {
              interactions: true,
            },
          },
        },
      },
      responses: {
        include: {
          interaction: true,
        },
      },
      analytics: true,
    },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  const overallEngagement = session.analytics?.engagementScore || 0;

  // Analyze strong points
  const strongPoints = identifyStrongPoints(session);

  // Identify improvement areas
  const improvementAreas = identifyImprovementAreas(session);

  // Generate recommendations
  const recommendations = generateRecommendations(session, strongPoints, improvementAreas);

  // Identify confused topics
  const confusedTopics = identifyConfusedTopics(session);

  // Find best performing slides
  const bestPerformingSlides = identifyBestPerformingSlides(session);

  // Identify struggling students
  const strugglingStudents = identifyStrugglingStudents(session);

  return {
    sessionId,
    overallEngagement,
    strongPoints,
    improvementAreas,
    recommendations,
    confusedTopics,
    bestPerformingSlides,
    strugglingStudents,
  };
}

function extractTextFromContent(content: any): string {
  if (!content) return '';

  let text = '';
  
  if (content.text && Array.isArray(content.text)) {
    text = content.text.join(' ');
  } else if (typeof content === 'string') {
    text = content;
  }

  return text;
}

function extractKeyConcepts(text: string): string[] {
  // Simplified concept extraction - would use NLP in production
  const words = text.toLowerCase().split(/\s+/);
  const commonWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although', 'though', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'it', 'its', 'they', 'their', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'shall', 'can']);
  
  const wordFreq: Record<string, number> = {};
  for (const word of words) {
    if (word.length > 3 && !commonWords.has(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }

  const sortedWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return sortedWords;
}

function assessDifficulty(text: string, concepts: string[]): 'beginner' | 'intermediate' | 'advanced' {
  // Simplified difficulty assessment
  const complexWords = ['however', 'therefore', 'consequently', 'furthermore', 'moreover', 'nevertheless', 'nonetheless', 'accordingly', 'hence', 'thus', 'thereby', 'wherein', 'whereof', 'whereon', 'whereas', 'whereby'];
  
  let complexWordCount = 0;
  for (const word of complexWords) {
    if (text.toLowerCase().includes(word)) {
      complexWordCount++;
    }
  }

  const avgSentenceLength = text.split(/[.!?]/).reduce((sum, sentence) => sum + sentence.length, 0) / text.split(/[.!?]/).length;

  if (complexWordCount > 2 || avgSentenceLength > 100) {
    return 'advanced';
  } else if (complexWordCount > 0 || avgSentenceLength > 50) {
    return 'intermediate';
  }
  
  return 'beginner';
}

function generateInteractionSuggestions(
  text: string,
  concepts: string[],
  difficulty: 'beginner' | 'intermediate' | 'advanced'
): Array<{ type: string; title: string; question: string; confidence: number }> {
  const suggestions: Array<{ type: string; title: string; question: string; confidence: number }> = [];

  // Generate poll suggestion
  if (concepts.length > 0) {
    suggestions.push({
      type: 'poll',
      title: `Quick Check: ${concepts[0]}`,
      question: `How confident do you feel about ${concepts[0]}?`,
      confidence: 0.8,
    });
  }

  // Generate MCQ suggestion for advanced content
  if (difficulty === 'advanced') {
    suggestions.push({
      type: 'mcq',
      title: 'Understanding Check',
      question: `Which of the following best describes the main concept presented?`,
      confidence: 0.7,
    });
  }

  // Generate word cloud for beginner content
  if (difficulty === 'beginner') {
    suggestions.push({
      type: 'word_cloud',
      title: 'Key Terms',
      question: `What words come to mind when you think of this topic?`,
      confidence: 0.9,
    });
  }

  // Generate discussion suggestion
  suggestions.push({
    type: 'discussion',
    title: 'Share Your Thoughts',
    question: `What are your thoughts on the key points presented?`,
    confidence: 0.6,
  });

  return suggestions;
}

function generateQuizQuestions(
  text: string,
  concepts: string[]
): Array<{ question: string; options: string[]; correctAnswer: string; confidence: number }> {
  const questions: Array<{ question: string; options: string[]; correctAnswer: string; confidence: number }> = [];

  // Generate questions based on concepts
  for (const concept of concepts.slice(0, 3)) {
    questions.push({
      question: `What is the primary characteristic of ${concept}?`,
      options: [
        `It is a fundamental concept`,
        `It is rarely used`,
        `It is outdated`,
        `It is controversial`,
      ],
      correctAnswer: `It is a fundamental concept`,
      confidence: 0.5,
    });
  }

  return questions;
}

function deriveLearningObjectives(text: string, concepts: string[]): string[] {
  const objectives: string[] = [];

  if (concepts.length > 0) {
    objectives.push(`Understand the key concepts of ${concepts[0]}`);
  }

  if (concepts.length > 1) {
    objectives.push(`Compare and contrast ${concepts[0]} and ${concepts[1]}`);
  }

  objectives.push('Apply the concepts to practical scenarios');
  objectives.push('Analyze the implications of the material');

  return objectives;
}

function determineBloomLevel(text: string, difficulty: 'beginner' | 'intermediate' | 'advanced'): string {
  const bloomKeywords = {
    remember: ['define', 'list', 'identify', 'name', 'recall'],
    understand: ['explain', 'describe', 'summarize', 'interpret', 'classify'],
    apply: ['apply', 'implement', 'use', 'execute', 'carry out'],
    analyze: ['analyze', 'compare', 'contrast', 'examine', 'differentiate'],
    evaluate: ['evaluate', 'assess', 'judge', 'critique', 'justify'],
    create: ['create', 'design', 'construct', 'develop', 'formulate'],
  };

  let maxLevel = 'remember';
  let maxCount = 0;

  for (const [level, keywords] of Object.entries(bloomKeywords)) {
    let count = 0;
    for (const keyword of keywords) {
      if (text.toLowerCase().includes(keyword)) {
        count++;
      }
    }
    if (count > maxCount) {
      maxCount = count;
      maxLevel = level;
    }
  }

  return maxLevel;
}

function identifyStrongPoints(session: any): string[] {
  const strongPoints: string[] = [];

  if (session.analytics?.engagementScore > 70) {
    strongPoints.push('High student engagement throughout the session');
  }

  if (session.analytics?.accuracyRate > 80) {
    strongPoints.push('Students demonstrated strong understanding of material');
  }

  const totalResponses = session.responses.length;
  const totalParticipants = session.participants.length;
  if (totalParticipants > 0 && totalResponses / totalParticipants > 0.8) {
    strongPoints.push('Excellent participation rate');
  }

  return strongPoints;
}

function identifyImprovementAreas(session: any): string[] {
  const improvements: string[] = [];

  if (session.analytics?.engagementScore < 50) {
    improvements.push('Student engagement could be improved');
  }

  if (session.analytics?.accuracyRate < 60) {
    improvements.push('Some students may need additional support with the material');
  }

  const leftParticipants = session.participants.filter((p: any) => p.status === 'left').length;
  if (leftParticipants / session.participants.length > 0.2) {
    improvements.push('Consider session timing to reduce early departures');
  }

  return improvements;
}

function generateRecommendations(
  session: any,
  strongPoints: string[],
  improvementAreas: string[]
): Array<{ type: 'content' | 'delivery' | 'interaction' | 'timing'; suggestion: string; priority: 'high' | 'medium' | 'low' }> {
  const recommendations: Array<{ type: 'content' | 'delivery' | 'interaction' | 'timing'; suggestion: string; priority: 'high' | 'medium' | 'low' }> = [];

  if (improvementAreas.includes('Student engagement could be improved')) {
    recommendations.push({
      type: 'interaction',
      suggestion: 'Incorporate more interactive elements like polls and quizzes',
      priority: 'high',
    });
  }

  if (improvementAreas.includes('Some students may need additional support with the material')) {
    recommendations.push({
      type: 'content',
      suggestion: 'Provide additional examples and explanations for complex topics',
      priority: 'medium',
    });
  }

  if (strongPoints.includes('High student engagement throughout the session')) {
    recommendations.push({
      type: 'delivery',
      suggestion: 'Continue using the current teaching approach',
      priority: 'low',
    });
  }

  return recommendations;
}

function identifyConfusedTopics(session: any): string[] {
  const confusedTopics: string[] = [];

  // Find interactions with low accuracy
  const interactionAccuracy: Record<string, { correct: number; total: number }> = {};

  for (const response of session.responses) {
    const interactionId = response.interactionId;
    if (!interactionAccuracy[interactionId]) {
      interactionAccuracy[interactionId] = { correct: 0, total: 0 };
    }
    interactionAccuracy[interactionId].total++;
    if (response.isCorrect) {
      interactionAccuracy[interactionId].correct++;
    }
  }

  for (const [interactionId, stats] of Object.entries(interactionAccuracy)) {
    const accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
    if (accuracy < 0.5) {
      const interaction = session.responses.find((r: any) => r.interactionId === interactionId)?.interaction;
      if (interaction) {
        confusedTopics.push(interaction.title);
      }
    }
  }

  return confusedTopics;
}

function identifyBestPerformingSlides(session: any): string[] {
  const slidePerformance: Record<string, number> = {};

  for (const response of session.responses) {
    const slideId = response.interaction.slideId;
    if (!slidePerformance[slideId]) {
      slidePerformance[slideId] = 0;
    }
    if (response.isCorrect) {
      slidePerformance[slideId]++;
    }
  }

  const sortedSlides = Object.entries(slidePerformance)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([slideId]) => slideId);

  return sortedSlides;
}

function identifyStrugglingStudents(session: any): string[] {
  const studentPerformance: Record<string, { correct: number; total: number }> = {};

  for (const response of session.responses) {
    const participantId = response.participantId;
    if (!studentPerformance[participantId]) {
      studentPerformance[participantId] = { correct: 0, total: 0 };
    }
    studentPerformance[participantId].total++;
    if (response.isCorrect) {
      studentPerformance[participantId].correct++;
    }
  }

  const strugglingStudents: string[] = [];

  for (const [participantId, stats] of Object.entries(studentPerformance)) {
    const accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
    if (accuracy < 0.5 && stats.total >= 3) {
      strugglingStudents.push(participantId);
    }
  }

  return strugglingStudents;
}