import { Component, ChangeDetectionStrategy, signal, inject, ElementRef, ViewChild, HostListener, OnInit } from '@angular/core';
import { GeminiService } from './gemini.service';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { saveAs } from 'file-saver';

export interface AppDocument {
  id: string;
  title: string;
  content: string;
  date: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  gemini = inject(GeminiService);

  view = signal<'home' | 'editor'>('home');
  documentText = signal<string>('');
  isProcessing = signal<boolean>(false);
  processingStatus = signal<string>('');
  thinkingMode = signal<boolean>(false);
  
  // Documents State
  documents = signal<AppDocument[]>([]);
  activeDocId = signal<string | null>(null);

  // Dynamic UI States
  sidebarOpen = signal<boolean>(false);
  mouseX = signal<number>(0);
  mouseY = signal<number>(0);

  // Audio
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: Blob[] = [];
  isRecording = signal<boolean>(false);
  
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  ngOnInit() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('lazytype_docs');
      if (saved) {
        try {
          this.documents.set(JSON.parse(saved));
        } catch {
          // do nothing
        }
      }
    }
  }

  saveDocs() {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('lazytype_docs', JSON.stringify(this.documents()));
    }
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    this.mouseX.set(event.clientX);
    this.mouseY.set(event.clientY);
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  toggleThinkingMode() {
    this.thinkingMode.set(!this.thinkingMode());
  }

  startAudioSequence() {
    this.audioChunks = [];
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };
      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        await this.processAudio(audioBlob);
      };
      
      this.mediaRecorder.start();
      this.isRecording.set(true);
    }).catch(err => {
      console.error('Error accessing microphone', err);
      alert('Microphone access is required for this feature.');
    });
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
      this.isRecording.set(false);
    }
  }

  async processAudio(blob: Blob) {
    this.isProcessing.set(true);
    this.goToEditor();
    this.processingStatus.set(this.thinkingMode() ? 'Transcribing with High Thinking...' : 'Transcribing audio...');
    
    try {
      const buffer = await blob.arrayBuffer();
      const base64 = this.arrayBufferToBase64(buffer);
      const transcript = await this.gemini.transcribeAudio(base64, blob.type || 'audio/webm', this.thinkingMode());
      await this.handleNewContent(transcript);
    } catch (e) {
      console.error(e);
      alert('Failed to process audio.');
    } finally {
      this.isProcessing.set(false);
      this.processingStatus.set('');
    }
  }

  triggerImageUpload() {
    this.fileInput.nativeElement.click();
  }

  async onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    this.isProcessing.set(true);
    this.goToEditor();
    this.processingStatus.set(this.thinkingMode() ? 'Extracting text with High Thinking...' : 'Extracting text from image...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = this.arrayBufferToBase64(arrayBuffer);
      const text = await this.gemini.extractTextFromImage(base64, file.type, this.thinkingMode());
      await this.handleNewContent(text);
    } catch (e) {
      console.error(e);
      alert('Failed to process image.');
    } finally {
      this.isProcessing.set(false);
      this.processingStatus.set('');
      if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
    }
  }

  async handleNewContent(newText: string) {
    if (!this.activeDocId()) {
      const id = Date.now().toString();
      const newDoc: AppDocument = { id, title: 'Generating summary...', content: newText, date: Date.now() };
      this.documents.update(docs => [newDoc, ...docs]);
      this.activeDocId.set(id);
      this.documentText.set(newText);
      
      const title = await this.gemini.summarize3Words(newText);
      this.documents.update(docs => docs.map(d => d.id === id ? { ...d, title } : d));
      this.saveDocs();
    } else {
      const currentText = this.documentText();
      const combined = currentText + (currentText ? '\n\n' : '') + newText;
      this.documentText.set(combined);
      this.updateDocument(combined);
    }
  }

  updateDocument(newText: string) {
    this.documentText.set(newText);
    const id = this.activeDocId();
    if (id) {
      this.documents.update(docs => docs.map(d => d.id === id ? { ...d, content: newText } : d));
      this.saveDocs();
    }
  }

  loadDocument(id: string) {
    const doc = this.documents().find(d => d.id === id);
    if (doc) {
      this.activeDocId.set(id);
      this.documentText.set(doc.content);
      this.goToEditor();
    }
  }

  deleteDocument(id: string, event: Event) {
    event.stopPropagation();
    this.documents.update(docs => docs.filter(d => d.id !== id));
    this.saveDocs();
    if (this.activeDocId() === id) {
      this.goHome();
    }
  }

  goHome() {
    this.activeDocId.set(null);
    this.documentText.set('');
    this.view.set('home');
    this.sidebarOpen.set(false);
  }
  
  goToEditor() {
    this.view.set('editor');
    this.sidebarOpen.set(false);
  }

  downloadDocument() {
    const blob = new Blob([this.documentText()], { type: 'text/plain;charset=utf-8' });
    const title = this.documents().find(d => d.id === this.activeDocId())?.title || 'Document';
    saveAs(blob, `LazyType_${title.replace(/[^a-z0-9]/gi, '_')}.txt`);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
