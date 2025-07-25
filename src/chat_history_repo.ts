// Chat geçmişi için interface
export interface IChatHistoryRepo {
  loadHistory(): Promise<ChatMessage[]>;
  addMessage(msg: ChatMessage): Promise<void>;
  saveHistory(): Promise<void>;
}

export type ChatMessage = {
  role: 'user' | 'assistant' | 'tool';
  text: string;
  timestamp: number;
};

// Fake dosya tabanlı implementasyon
import { promises as fs } from 'fs';
const HISTORY_FILE = './chat_history.json';

export class FileChatHistoryRepo implements IChatHistoryRepo {
  private history: ChatMessage[] = [];
  private saveInterval: NodeJS.Timeout | null = null;

  async loadHistory(): Promise<ChatMessage[]> {
    try {
      const data = await fs.readFile(HISTORY_FILE, 'utf-8');
      this.history = JSON.parse(data);
    } catch (e) {
      this.history = [];
    }
    return this.history;
  }

  async addMessage(msg: ChatMessage): Promise<void> {
    this.history.push(msg);
    await this.saveHistory();
  }

  async saveHistory(): Promise<void> {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(this.history, null, 2), 'utf-8');
  }

  startPeriodicSave(intervalMs: number = 10000) {
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.saveInterval = setInterval(() => {
      this.saveHistory();
    }, intervalMs);
  }

  stopPeriodicSave() {
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.saveInterval = null;
  }
} 