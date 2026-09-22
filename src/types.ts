export interface VocabItem {
  term: string;
  meaning: string;
  category: string;
  notes?: string;
}

export interface LearnedVocab {
  id: string;
  term_maanyan: string;
  meaning_indonesian: string;
  category: string;
  example_sentence?: string;
  contributor: string;
  created_at: string;
}

export interface LearnedRule {
  id: string;
  title: string;
  rule_description: string;
  example?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  detectedLearning?: {
    term: string;
    meaning: string;
    category?: string;
    example?: string;
  };
}

export interface PythonFile {
  filename: string;
  title: string;
  content: string;
}

export interface TelegramBotStatus {
  tokenConfigured: boolean;
  status: {
    isRunning: boolean;
    botUsername?: string;
    botFirstName?: string;
    lastPolledAt?: string;
    error?: string;
  };
}
