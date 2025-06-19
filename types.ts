
export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  questionText: string;
  options: QuizOption[];
  isMultipleChoice: boolean; // Indicates if Gemini was *asked* to make it multi-choice
}

export interface ProcessedFile {
  name: string;
  type: string; // MIME type
  originalType: 'txt' | 'pdf' | 'image' | 'unknown';
  content: string; // Text content or base64 data (for images, without the data: prefix)
}

export interface QuizSettings {
  quizName: string;
  gradeLevel: string;
  subject: string;
  userPrompt: string;
  numQuestions: number;
  multipleChoicePercentage: number;
  processedFiles?: ProcessedFile[];
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  retrievedContext?: {
    uri: string;
    title: string;
  };
}