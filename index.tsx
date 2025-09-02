/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Google GenAI removed
import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';
import { createClient, User as SupabaseUser } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

interface TranscriptEntry {
  speaker: 'user' | 'examiner';
  text: string;
}

interface TestRecord {
  id: number;
  name: string;
  date: string;
  transcript: TranscriptEntry[];
  score: string;
  feedback: string;
}

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @property({reflect: true})
  @state()
  isRecording = false;

  @state() status = 'Session opened. Select a part to begin.';
  @state() error = '';
  @state() selectedPart: 'part1' | 'part2' | 'part3' | null = null;
  @state() timer = 0;
  @state() timerDisplay = '05:00';
  @state() isTimerRunning = false;
  @state() part2Topic = '';
  @state() part2TopicLoading = false;
  @state() part1Completed = false;
  @state() part2Completed = false;
  @state() part3Completed = false;
  @state() isPreparing = false;
  @state() preparationTimer = 60;
  @state() preparationTimerDisplay = '01:00';
  @state() testHistory: TestRecord[] = [];
  @state() currentTranscript: TranscriptEntry[] = [];
  @state() isHistoryVisible = false;
  @state() selectedTest: TestRecord | null = null;
  @state() isScoring = false;
  @state() isProfileVisible = false;
  @state() profileTab: 'profile' | 'history' = 'profile';
  // TRTC runtime configuration
  @state() trtcRoomId: number | null = null;
  @state() trtcUserId: string | null = null;
  @state() trtcAgentId: string | null = null;
  // Transcription indicator
  @state() isTranscribing = false;
  // Speech-to-text (browser)
  private recognition: any = null;
  private sttRestartOnEnd = false;
  private lastSttRestartAt = 0;
  // Supabase-driven question sets
  @state() part1Set: { topic: string; questions: string[] }[] = [];
  @state() part3Set: string[] = [];
  private part2CueId: string | null = null;
  private speaking = false;
  private speakCancel = false;

  // Authentication state (Supabase)
  @state() private user: SupabaseUser | null = null;
  @state() private authInitialized = false;

  private timerInterval: any = null;
  private preparationTimerInterval: any = null;
  private readonly partDurations = {part1: 300, part2: 120, part3: 300}; // in seconds

  // Removed Google GenAI session
  // FIX: Property 'webkitAudioContext' does not exist on type 'Window & typeof globalThis'. Cast to any to allow fallback.
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  // FIX: Property 'webkitAudioContext' does not exist on type 'Window & typeof globalThis'. Cast to any to allow fallback.
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private audioEvents = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private mediaRecorder: MediaRecorder | null = null;
  private startingRecording = false;
  private trtc: any = null;
  session: any;
  liveLines: any;
  private async loadScript(src: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
      if (existing) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  private async getTrtcSdk(): Promise<any> {
    if ((window as any).TRTC?.create) return (window as any).TRTC;
    await this.loadScript('https://cdn.jsdelivr.net/npm/trtc-sdk-v5/dist/trtc.min.js');
    return (window as any).TRTC;
  }
  // Removed ScriptProcessorNode usage (deprecated)
  private sources = new Set<AudioBufferSourceNode>();
  private initialPrompt: string | null = null;

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background-color: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
        'Segoe UI Symbol';
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    * {
      box-sizing: border-box;
    }

    /* Ensure the visuals canvas always fills the viewport behind UI */
    gdm-live-audio-visuals-3d {
      position: fixed;
      inset: 0;
      z-index: 1;
      pointer-events: none;
    }

    /* Fullscreen cue card overlay for Part 2 prep */
    #cue-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 20;
    }
    #prep-countdown {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      color: #fff;
      font-size: clamp(1.2rem, 6vw, 2rem);
      font-family: 'SF Mono', 'Fira Code', 'Roboto Mono', monospace;
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      padding: 32px;
      align-items: center;
      justify-content: space-between;
      position: relative;
      z-index: 2; /* Keep UI above visuals */
    }

    /* Live overlay lines */
    #live-overlay {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 6;
      display: flex;
      flex-direction: column-reverse;
      gap: 6px;
      max-width: min(90vw, 780px);
      pointer-events: none;
    }
    .live-line {
      background: rgba(0,0,0,0.55);
      border: 1px solid rgba(255,255,255,0.1);
      color: #eaf6ff;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.35;
      animation: livefade 6s ease forwards;
    }
    .live-line.user { color: #d3ffe2; }
    .live-line.ai { color: #eaf6ff; }
    @keyframes livefade {
      0% { opacity: 0; transform: translateY(-4px); }
      8% { opacity: 1; transform: translateY(0); }
      85% { opacity: 1; }
      100% { opacity: 0; transform: translateY(6px); }
    }

    .main-content-area {
      flex-grow: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }

    #status {
      color: #888;
      text-align: center;
      font-size: 16px;
      height: 20px;
      line-height: 20px;
    }

    #cue-card {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 20px);
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 40px);
      max-width: 560px;
      color: #111;
      background: #ffffff;
      border: 1px solid #e5e5e5;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      padding: 14px 18px;
      z-index: 6;
      font-size: 18px;
      line-height: 1.4;
      white-space: normal;
      text-align: left;
      border-radius: 12px;
      max-height: 45vh;
      overflow: auto;
    }

    /* Centered variant inside overlay */
    #cue-overlay #cue-card {
      position: static;
      transform: none;
      width: min(92vw, 640px);
      max-height: 70vh;
    }

    #cue-card .card-title {
      margin: 0 0 4px 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #555;
      font-weight: 700;
    }

    #cue-card .prompt {
      margin: 2px 0 8px 0;
      font-weight: 700;
      color: #111;
      white-space: normal;
    }

    #cue-card .label {
      margin-top: 6px;
      font-weight: 600;
      color: #333;
    }

    #cue-card ul {
      margin: 4px 0 0 1rem;
      padding: 0;
    }

    #cue-card li {
      margin: 2px 0;
    }

    #cue-card .note {
      margin-top: 8px;
      font-size: 13px;
      color: #666;
    }

    /* Part 1/3 prompt card (top fixed) */
    #prompt-card {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 16px);
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 40px);
      max-width: 680px;
      background: #ffffff;
      color: #111;
      border: 1px solid #e5e5e5;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      border-radius: 12px;
      padding: 12px 16px;
      z-index: 6;
      max-height: 42vh;
      overflow: auto;
    }
    #prompt-card h3 { margin: 0 0 6px 0; font-size: 16px; }
    #prompt-card .topic { margin: 8px 0 2px; font-weight: 700; }
    #prompt-card ol, #prompt-card ul { margin: 6px 0 0 1.2rem; }
    #prompt-card li { margin: 2px 0; }

    #cue-card[hidden] {
      display: none;
    }

    .bottom-controls {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      width: 100%;
      z-index: 10;
    }

    /* Profile button (top-right) */
    #profileBtn {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 100;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 1px solid #333;
      background: #0b0b0b;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    #profileBtn:hover { background: #151515; }

    /* Profile Panel */
    #profilePanel {
      position: fixed;
      top: 0;
      right: 0;
      width: min(95vw, 420px);
      height: 100%;
      background-color: #000;
      border-left: 1px solid #333;
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
      z-index: 120;
      display: flex;
      flex-direction: column;
    }
    #profilePanel.visible { transform: translateX(0); }
    .profile-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #333;
    }
    .tabs { display: flex; gap: 8px; }
    .tabs button {
      background: none;
      border: 1px solid #333;
      color: #fff;
      padding: 6px 12px;
      border-radius: 16px;
      cursor: pointer;
      font-size: 14px;
    }
    .tabs button.active { background: #1a1a1a; }
    .profile-header .close-btn {
      background: none;
      border: none;
      color: #fff;
      font-size: 22px;
      cursor: pointer;
      line-height: 1;
    }
    .profile-content { flex: 1; overflow-y: auto; padding: 10px 12px; }
    .profile-footer { border-top: 1px solid #333; padding: 10px 12px; }
    .logout-btn {
      width: 100%;
      background: none;
      border: 1px solid #333;
      color: #fff;
      padding: 10px 16px;
      border-radius: 24px;
      cursor: pointer;
      font-weight: 600;
    }
    .logout-btn:hover { background: #1a1a1a; border-color: #555; }

    .controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      height: 80px;
    }

    .controls button {
      outline: none;
      border: none;
      color: white;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .controls button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
      transform: scale(1);
    }
    .controls button:not(:disabled):hover {
      transform: scale(1.05);
    }

    #recordButton {
      width: 80px;
      height: 80px;
      border: 3px solid white;
    }

    #recordButton svg {
      transition: all 0.2s ease;
    }

    #resetButton {
      width: 56px;
      height: 56px;
      border: 2px solid #333;
    }
    #resetButton:hover {
      border-color: #fff;
    }

    #resetButton svg {
      width: 28px;
      height: 28px;
    }

    #timer {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #c0c0c0;
      font-size: clamp(2rem, 10vw, 3.5rem);
      z-index: 5;
      font-family: 'SF Mono', 'Fira Code', 'Roboto Mono', monospace;
      font-weight: 400;
      pointer-events: none;
    }

    #timer[hidden] {
      display: none;
    }

    .ielts-parts {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .ielts-parts[hidden] {
      display: none;
    }

    .ielts-parts button {
      outline: none;
      border: none;
      color: white;
      border-radius: 99px;
      background: #1a1a1a;
      padding: 12px 24px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .ielts-parts button:hover {
      background: #2c2c2e;
    }

    .ielts-parts button.selected {
      background: white;
      color: black;
    }

    .ielts-parts button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      background: #1a1a1a;
    }

    /* History Panel Styles */
    #historyPanel {
      position: fixed;
      top: 0;
      right: 0;
      width: min(95vw, 450px);
      height: 100%;
      background-color: #000;
      border-left: 1px solid #333;
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
      z-index: 100;
      display: flex;
      flex-direction: column;
    }

    #historyPanel.visible {
      transform: translateX(0);
    }

    .history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #333;
      flex-shrink: 0;
    }

    .history-header h2 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .history-header .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 2rem;
      cursor: pointer;
      line-height: 1;
    }

    .history-content {
      flex-grow: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .history-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .history-list li {
      padding: 12px;
      border-radius: 8px;
      margin: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .history-list li:hover {
      background-color: #1a1a1a;
    }

    .history-list .test-name {
      font-weight: 600;
    }
    .history-list .test-date,
    .history-list .test-score {
      display: block;
      font-size: 0.85rem;
      color: #aaa;
      margin-top: 4px;
    }
    .test-details {
      padding: 12px;
    }

    .test-details .back-btn {
      background: none;
      border: 1px solid #333;
      color: white;
      padding: 10px 20px;
      border-radius: 99px;
      cursor: pointer;
      margin-bottom: 24px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .test-details .back-btn:hover {
      background: #1a1a1a;
      border-color: #555;
    }

    .test-details h3,
    .test-details h4 {
      margin-top: 1.5em;
      margin-bottom: 0.75em;
      font-weight: 600;
      border-bottom: 1px solid #333;
      padding-bottom: 8px;
    }

    .test-details .feedback {
      white-space: pre-wrap;
      line-height: 1.7;
      background-color: #1a1a1a;
      padding: 16px;
      border-radius: 8px;
      font-size: 15px;
    }

    .transcript {
      max-height: 40vh;
      overflow-y: auto;
      border: 1px solid #333;
      padding: 16px;
      border-radius: 8px;
    }

    .transcript-entry {
      margin-bottom: 16px;
    }

    .transcript-entry strong {
      display: block;
      margin-bottom: 4px;
      color: #ccc;
      font-weight: 600;
    }

    .transcript-entry.user strong {
      color: #a5d8ff;
    }
    .transcript-entry.examiner strong {
      color: #a7f0ba;
    }

    .transcript-entry p {
      margin: 0;
      line-height: 1.6;
    }

    .loading-container,
    .login-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      width: 100%;
      padding: 24px;
      background-color: #000;
    }

    .login-box {
      background: transparent;
      padding: 32px;
      border-radius: 16px;
      text-align: center;
      border: none;
      max-width: 400px;
      width: 100%;
    }
    .login-box h1 {
      margin-top: 0;
      margin-bottom: 8px;
      font-size: 1.8rem;
      font-weight: 600;
      color: #fff;
    }
    .login-box p {
      margin-bottom: 24px;
      color: #aaa;
    }
    #google-signin,
    #guest-signin {
      width: 100%;
      box-sizing: border-box;
      padding: 14px 24px;
      border-radius: 99px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
    }
    #google-signin {
      background-color: #fff;
      color: #000;
    }
    #google-signin:hover {
      background-color: #e0e0e0;
    }

    #guest-signin {
      background: #1a1a1a;
      color: #fff;
      margin-top: 12px;
    }
    #guest-signin:hover {
      background-color: #2c2c2e;
    }

    /* Desktop Styles */
    @media (min-width: 768px) {
      .container {
        padding: 48px;
      }
      .bottom-controls {
        gap: 48px;
        padding-bottom: 32px;
      }
      #status {
        font-size: 16px;
      }
      #cue-card {
        padding: 20px 24px;
        font-size: 20px;
        top: 24px; /* keep card near top to avoid circle */
      }
    }
  `;

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.setupAuth();
    this.loadLocalHistory();
    this.loadTrtcConfig();
  }

  private async setupAuth() {
    if (!supabase) {
      this.updateError('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
      this.authInitialized = true;
      return;
    }
    const { data } = await supabase.auth.getSession();
    this.user = data.session?.user ?? null;
    this.authInitialized = true;
    if (this.user) this.loadSupabaseHistory(); else this.loadLocalHistory();
    supabase.auth.onAuthStateChange((_event, session) => {
      this.user = session?.user ?? null;
      if (this.user) this.loadSupabaseHistory(); else this.loadLocalHistory();
      this.requestUpdate();
    });
  }

  private async signInWithGoogle() {
    if (!supabase) return;
    const redirectBase = (process.env.SITE_URL || window.location.origin).replace(/\/$/, '');
    const redirectTo = `${redirectBase}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) this.updateError('Failed to sign in with Google.');
  }

  private async signOutUser() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  // Guest mode removed

  // Remote history removed; using local history

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  // Removed Google GenAI init/session

  private shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private async loadPart1Questions() {
    if (!supabase) return;
    this.updateStatus('Loading Part 1 questions...');
    this.part1Set = [];
    // fetch topics (sample up to 1000 rows then dedupe topics client-side)
    const { data: topicRows, error: tErr } = await supabase
      .from('ielts_part1_questions')
      .select('topic')
      .limit(1000);
    if (tErr) {
      this.updateError('Failed to load topics');
      return;
    }
    const topics = Array.from(new Set((topicRows || []).map((r: any) => r.topic).filter(Boolean)));
    if (topics.length === 0) {
      this.updateError('No topics available');
      return;
    }
    const chosenTopics = this.shuffle(topics).slice(0, 3);
    // decide total questions 10-12 split across 3 topics
    const total = 10 + Math.floor(Math.random() * 3); // 10,11,12
    const base = Math.floor(total / 3);
    const remainder = total % 3;
    const perTopic = [base, base, base];
    for (let i = 0; i < remainder; i++) perTopic[i]++;
    const result: { topic: string; questions: string[] }[] = [];
    for (let i = 0; i < chosenTopics.length; i++) {
      const topic = chosenTopics[i];
      const { data: qRows, error: qErr } = await supabase
        .from('ielts_part1_questions')
        .select('question')
        .eq('topic', topic)
        .limit(100);
      if (qErr || !qRows || qRows.length === 0) continue;
      const picked = this.shuffle(qRows.map((r: any) => r.question)).slice(0, perTopic[i]);
      result.push({ topic, questions: picked });
    }
    this.part1Set = result;
    this.updateStatus('Part 1 questions ready.');
  }

  private addExaminer(text: string) {
    if (!text) return;
    this.currentTranscript = [
      ...this.currentTranscript,
      { speaker: 'examiner', text },
    ];
  }

  private async ensureSession() {
    if (!this.session) await this.initSession();
  }
  initSession() {
    throw new Error('Method not implemented.');
  }

  private cancelSpeaking() {
    this.speakCancel = true;
    for (const source of this.sources.values()) {
      try { source.stop(); } catch {}
      this.sources.delete(source);
    }
    this.nextStartTime = 0;
  }

  private async speakPart1() {
    if (!this.part1Set || this.part1Set.length === 0) return;
    const lines: string[] = [];
    lines.push("Let's begin Part 1. I will ask you some questions about yourself.");
    this.part1Set.forEach((group, gi) => {
      lines.push(`Topic ${gi + 1}: ${group.topic}.`);
      group.questions.forEach((q, qi) => {
        lines.push(`Question ${qi + 1}: ${q}`);
      });
    });
    await this.speakLinesWithTTS(lines);
  }

  private async speakPart3() {
    if (!this.part3Set || this.part3Set.length === 0) return;
    const lines: string[] = [];
    lines.push("Now Part 3. Let's discuss some broader questions.");
    this.part3Set.forEach((q, i) => lines.push(`Question ${i + 1}: ${q}`));
    await this.speakLinesWithTTS(lines);
  }

  private async speakLinesWithGemini(lines: string[]) {
    await this.ensureSession();
    if (!this.session) return;
    this.speaking = true;
    this.speakCancel = false;
    for (const line of lines) {
      if (this.speakCancel) break;
      this.addExaminer(line);
      const before = this.audioEvents;
      // Send text message to Gemini Live session
      try {
        await this.session.send({ text: line });
      } catch (e) {
        console.error('Failed to send message to Gemini:', e);
      }
      // Wait until we receive at least one audio chunk or a short timeout
      const start = performance.now();
      while (this.audioEvents === before && performance.now() - start < 2000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (this.speakCancel) break;
      // Small gap before next line to avoid overlap
      await new Promise((r) => setTimeout(r, 150));
    }
    this.speaking = false;
  }

  private async speakLinesWithTTS(lines: string[]) {
    this.speaking = true;
    this.speakCancel = false;
    for (const line of lines) {
      if (this.speakCancel) break;
      this.addExaminer(line);
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: line }),
        });
        if (!res.ok) {
          try { console.warn('TTS error', res.status, await res.text()); } catch {}
          await this.speakLinesWithGemini([line]);
          continue;
        }
        const data = await res.json();
        const b64 = data.audio || data.wav || data.data;
        const mime = data.mimeType || data.mimetype || 'audio/wav';
        if (!b64) {
          await this.speakLinesWithGemini([line]);
          continue;
        }
        await this.playTtsBase64(b64, mime);
      } catch (e) {
        console.warn('TTS fetch failed', e);
        await this.speakLinesWithGemini([line]);
      }
      if (this.speakCancel) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    this.speaking = false;
  }

  private async playTtsBase64(b64: string, mime: string) {
    const src = `data:${mime};base64,${b64}`;
    const audio = new Audio();
    audio.src = src;
    audio.crossOrigin = 'anonymous';
    try { await this.outputAudioContext.resume(); } catch {}
    const source = this.outputAudioContext.createMediaElementSource(audio);
    source.connect(this.outputNode);
    await new Promise<void>((resolve) => {
      const onEnd = () => { audio.removeEventListener('ended', onEnd); resolve(); };
      audio.addEventListener('ended', onEnd);
      audio.play().catch(() => resolve());
    });
    try { source.disconnect(); } catch {}
  }

  private updateStatus(msg: string) {
    this.error = '';
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
    this.status = '';
  }

  // --- Local history ---
  private saveLocalTest(score?: string, feedback?: string) {
    if (this.currentTranscript.length === 0) return;
    const record: TestRecord = {
      id: Date.now(),
      name: `IELTS Test ${this.testHistory.length + 1}`,
      date: new Date().toLocaleDateString(),
      transcript: this.currentTranscript,
      score: score || 'N/A',
      feedback: feedback || '',
    };
    const key = 'ieltsTestHistory';
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift(record);
      localStorage.setItem(key, JSON.stringify(existing));
      this.testHistory = existing;
    } catch (e) {
      console.warn('Local history save failed', e);
    }
  }

  private loadLocalHistory() {
    try {
      const key = 'ieltsTestHistory';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(existing)) this.testHistory = existing as TestRecord[];
    } catch {
      // ignore
    }
  }

  // --- Supabase history ---
  private async saveSupabaseTest(score: string, feedback: string) {
    try {
      if (!this.user || !supabase) return;
      const testName = `IELTS Test ${this.testHistory.length + 1}`;
      const payload: any = {
        user_id: this.user.id,
        name: testName,
        transcript: this.currentTranscript,
        score,
        feedback,
        part2_topic: this.part2Topic || null,
      };
      const { error } = await supabase.from('speaking_tests').insert([payload]);
      if (error) {
        console.warn('Supabase save failed', error);
        return;
      }
      // Optimistically update local view
      const record: TestRecord = {
        id: Date.now(),
        name: testName,
        date: new Date().toLocaleDateString(),
        transcript: this.currentTranscript,
        score,
        feedback,
      };
      this.testHistory = [record, ...this.testHistory];
    } catch (e) {
      console.warn('Supabase save exception', e);
    }
  }

  private async loadSupabaseHistory() {
    try {
      if (!this.user || !supabase) return;
      const { data, error } = await supabase
        .from('speaking_tests')
        .select('id, name, created_at, transcript, score, feedback')
        .eq('user_id', this.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error || !data) return;
      this.testHistory = data.map((row: any) => ({
        id: row.id || Date.now(),
        name: row.name || 'IELTS Test',
        date: row.created_at ? new Date(row.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
        transcript: (row.transcript as TranscriptEntry[]) || [],
        score: row.score ?? 'N/A',
        feedback: row.feedback ?? '',
      }));
    } catch (e) {
      console.warn('Supabase load history failed', e);
    }
  }

  // --- Browser Speech-to-Text ---
  private startSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available');
      return;
    }
    if (!this.recognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.onstart = () => {
        this.isTranscribing = true;
      };
      this.recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript?.trim();
          if (!text) continue;
          if (res.isFinal) {
            this.currentTranscript = [
              ...this.currentTranscript,
              { speaker: 'user', text },
            ];
          }
        }
      };
      this.recognition.onerror = (e: any) => {
        const err = e?.error || e;
        const transient = err === 'no-speech' || err === 'network' || err === 'aborted';
        if (!transient) {
          console.warn('STT error', err);
        }
        // Throttle restarts to avoid loops
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (this.isRecording && transient && now - this.lastSttRestartAt > 1000) {
          this.lastSttRestartAt = now;
          try { this.recognition.stop(); } catch {}
          setTimeout(() => {
            if (this.isRecording) {
              try { this.recognition.start(); } catch {}
            }
          }, 300);
        }
      };
      this.recognition.onend = () => {
        if (this.isRecording) {
          try { this.recognition.start(); } catch {}
          this.isTranscribing = true;
        } else {
          this.isTranscribing = false;
        }
      };
    }
    try { this.recognition.start(); } catch {}
  }

  private stopSpeechRecognition() {
    try { this.recognition && this.recognition.stop(); } catch {}
  }

  private async selectPart(part: 'part1' | 'part2' | 'part3') {
    if (this.isRecording || this.isPreparing) return;
    this.selectedPart = part;

    if (part === 'part2') {
      this.generateAndSetPart2Topic();
    } else if (part === 'part1') {
      await this.loadPart1Questions();
      const duration = this.partDurations[part];
      this.timer = duration;
      this.updateTimerDisplay();
      this.part2Topic = '';
      await this.startTencentConversation();
    } else if (part === 'part3') {
      await this.loadPart3Questions();
      const duration = this.partDurations[part];
      this.timer = duration;
      this.updateTimerDisplay();
      if (!this.part2Topic) {
        // still allow Part 3 with generic questions
      }
      await this.startTencentConversation();
    } else {
      const duration = this.partDurations[part];
      this.timer = duration;
      this.updateTimerDisplay();
      this.part2Topic = '';
    }
  }

  private async loadPart3Questions() {
    if (!supabase) return;
    this.updateStatus('Loading Part 3 questions...');
    const questions: string[] = [];
    try {
      let related: any[] = [];
      if (this.part2CueId) {
        const { data: rel } = await supabase
          .from('ielts_part3_questions')
          .select('question')
          .eq('part2_id', this.part2CueId)
          .limit(50);
        related = rel || [];
      }
      const { data: unrel } = await supabase
        .from('ielts_part3_questions')
        .select('question, part2_id')
        .limit(200);
      const poolUnrel = (unrel || []).filter((r: any) => !this.part2CueId || r.part2_id !== this.part2CueId);
      const pickRelated = Math.min(3, related.length);
      const pickUnrel = 5 - Math.min(5, pickRelated + 2) + 2; // aim for 4-5 total
      const relQs = this.shuffle(related.map((r: any) => r.question)).slice(0, pickRelated);
      const unrelQs = this.shuffle(poolUnrel.map((r: any) => r.question)).slice(0, Math.max(2, 4 - relQs.length));
      questions.push(...relQs, ...unrelQs);
      // ensure 4-5
      if (questions.length < 4 && poolUnrel.length > questions.length) {
        questions.push(...this.shuffle(poolUnrel.map((r: any) => r.question)).slice(0, 4 - questions.length));
      }
      if (questions.length > 5) questions.length = 5;
      this.part3Set = questions;
      this.updateStatus('Part 3 questions ready.');
    } catch (e) {
      this.updateError('Failed to load Part 3 questions.');
      console.error(e);
    }
  }

  private async generateAndSetPart2Topic() {
    this.part2Topic = '';
    this.part2TopicLoading = true;
    this.part2Completed = false;
    this.updateStatus('Loading IELTS Part 2 cue card...');

    try {
      if (!supabase) throw new Error('Supabase not configured');
      // Get total count
      const { count, error: cErr } = await supabase
        .from('ielts_part2_cues')
        .select('id', { count: 'exact', head: true });
      if (cErr || !count || count <= 0) throw new Error('No cue cards found');
      const offset = Math.floor(Math.random() * count);
      const { data, error } = await supabase
        .from('ielts_part2_cues')
        .select('id, title, bullet_a, bullet_b, bullet_c, bullet_d')
        .order('id', { ascending: true })
        .range(offset, offset);
      if (error || !data || data.length === 0) throw new Error('Failed to fetch cue card');
      const cue = data[0] as any;
      this.part2CueId = cue.id;
      const topic = `${cue.title}\nYou should say:\n- ${cue.bullet_a}\n- ${cue.bullet_b}\n- ${cue.bullet_c}\n- ${cue.bullet_d}`;
      if (!this.part2TopicLoading) return;
      this.part2Topic = topic;
      this.updateStatus('Cue card ready. 1 minute to prepare.');
      this.startPreparationTimer();
    } catch (e) {
      if (this.part2TopicLoading) {
        this.updateError('Failed to load cue card.');
        console.error(e);
      }
    } finally {
      this.part2TopicLoading = false;
    }
  }

  private updateTimerDisplay() {
    const minutes = Math.floor(this.timer / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (this.timer % 60).toString().padStart(2, '0');
    this.timerDisplay = `${minutes}:${seconds}`;
  }

  private startTimer() {
    if (this.isTimerRunning) return;

    this.isTimerRunning = true;
    this.updateTimerDisplay(); // Initial display
    this.timerInterval = setInterval(() => {
      this.timer -= 1;
      this.updateTimerDisplay();
      if (this.timer <= 0) {
        this.stopTencentConversation();
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.isTimerRunning = false;
  }

  private updatePreparationTimerDisplay() {
    const minutes = Math.floor(this.preparationTimer / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (this.preparationTimer % 60).toString().padStart(2, '0');
    this.preparationTimerDisplay = `${minutes}:${seconds}`;
  }

  private startPreparationTimer() {
    if (this.preparationTimerInterval) return;

    this.isPreparing = true;
    this.preparationTimer = 60;
    this.updatePreparationTimerDisplay();
    this.updateStatus('Cue card open. 1 minute to prepare.');

    this.preparationTimerInterval = setInterval(() => {
      this.preparationTimer -= 1;
      this.updatePreparationTimerDisplay();
      if (this.preparationTimer <= 0) {
        this.stopPreparationTimer();
        // Start the actual 2-minute talk with STT
        // Force-set the talk timer to 2:00 for Part 2
        if (this.selectedPart === 'part2') {
          this.timer = 120;
          this.updateTimerDisplay();
        }
        this.startTencentConversation();
      }
    }, 1000);
  }

  private stopPreparationTimer() {
    if (this.preparationTimerInterval) {
      clearInterval(this.preparationTimerInterval);
      this.preparationTimerInterval = null;
    }
    this.isPreparing = false;
  }

  // Removed legacy MediaRecorder-based recording; using TRTC + browser transcription



  private async transcribeChunk(blob: Blob) {
    let base = '/api/stt';
    const direct = (process.env.STT_URL || '').trim();
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const isVercel = /vercel\.app$/i.test(host);
      if (!isVercel && direct) base = direct.replace(/\/$/, '') + '/stt';
    } else if (direct) {
      base = direct.replace(/\/$/, '') + '/stt';
    }
    try {
      const fd = new FormData();
      const file = new File([blob], 'chunk.webm', { type: blob.type || 'audio/webm' });
      fd.append('audio', file);
      const qs = new URLSearchParams({ language: 'en' }).toString();
      const res = await fetch(`${base}?${qs}`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        try {
          const errTxt = await res.text();
          console.warn('STT proxy error', res.status, errTxt);
        } catch {}
        return;
      }
      const json = await res.json();
      const text = (json && json.text || '').trim();
      if (text) {
        this.currentTranscript = [
          ...this.currentTranscript,
          { speaker: 'user', text },
        ];
      }
    } catch (_) {
      // ignore network errors
    }
  }
  private toggleRecording() {
    if (this.isRecording) {
      this.stopTencentConversation();
    } else {
      this.startTencentConversation();
    }
  }

  private async startTencentConversation() {
    if (this.isRecording || !this.selectedPart) return;
    try {
      const roomId = Number((this.trtcRoomId ?? (process.env.TENCENT_ROOM_ID ? Number(process.env.TENCENT_ROOM_ID) : 10001)));
      const userId = (this.trtcUserId || process.env.TENCENT_USER_ID || `web-${Math.random().toString(36).slice(2, 8)}`);
      const sigRes = await fetch('/api/trtc/usersig', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId })
      });
      if (!sigRes.ok) throw new Error(await sigRes.text());
      const { sdkAppId, userSig } = await sigRes.json();
      const TRTCsdk: any = await this.getTrtcSdk();
      if (!TRTCsdk?.isSupported?.()) throw new Error('TRTC not supported in this browser');
      const trtc = TRTCsdk.create();
      // Handle kicks
      trtc.on(TRTCsdk.EVENT.KICKED_OUT, (err: any) => {
        console.error('Kicked from TRTC room', err);
        this.stopTencentConversation();
      });
      // Optional: handle remote audio available
      trtc.on(TRTCsdk.EVENT.REMOTE_AUDIO_AVAILABLE, (event: any) => {
        try { trtc.muteRemoteAudio(event.userId, false); } catch {}
      });
      await trtc.enterRoom({ sdkAppId, userId, userSig, roomId });
      await trtc.startLocalAudio();
      // Notify backend to start AI conversation with questions/cues
      const startPayload: any = { RoomId: roomId, UserId: userId, AgentId: (this.trtcAgentId || process.env.TENCENT_AGENT_ID || undefined) };
      if (this.selectedPart === 'part1') startPayload.Questions = this.part1Set || [];
      if (this.selectedPart === 'part2') startPayload.CueCard = this.part2Topic || '';
      if (this.selectedPart === 'part3') { startPayload.Part2Topic = this.part2Topic || ''; startPayload.Questions = this.part3Set || []; }
      await fetch('/api/trtc/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(startPayload) });
      (this as any).trtc = trtc;
      // Start browser transcription so history works
      this.startSpeechRecognition();
      this.isRecording = true;
      this.updateStatus('Conversation started with Tencent RTC AI.');
      this.startTimer();
    } catch (e) {
      console.error('TRTC start error', e);
      this.updateError('Failed to start Tencent conversation');
      this.isRecording = false;
    }
  }

  private async stopTencentConversation() {
    if (!this.isRecording) return;
    try {
      const roomId = Number((this.trtcRoomId ?? (process.env.TENCENT_ROOM_ID ? Number(process.env.TENCENT_ROOM_ID) : 10001)));
      await fetch('/api/trtc/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ RoomId: roomId }) });
    } catch (e) { console.warn('TRTC stop error', e); }
    try {
      const trtc: any = (this as any).trtc;
      if (trtc) {
        try { await trtc.stopLocalAudio(); } catch {}
        try { await trtc.exitRoom(); } catch {}
        try { trtc.destroy(); } catch {}
      }
    } catch {}
    (this as any).trtc = null;
    this.stopSpeechRecognition();
    this.isRecording = false;
    this.stopTimer();
    this.updateStatus('Conversation stopped.');
  }

  private async getAndSaveScore() {
    if (this.currentTranscript.length === 0) return;

    this.isScoring = true;
    this.updateStatus('Test complete. Generating score + feedback...');

    const fullTranscript = this.currentTranscript
      .map((entry) => `${entry.speaker}: ${entry.text}`)
      .join('\n');

    try {
      const prompt = `Based on the following IELTS speaking test transcript, provide an overall band score and detailed feedback on fluency, lexical resource, grammar, and pronunciation. Format the output as a string starting with "Overall Score: [score]" followed by a newline, and then the detailed feedback. Transcript:\n\n${fullTranscript}`;
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const resultText = (data.text || '').trim();
      const scoreMatch = resultText.match(/Overall Score: ([\d.]+)/);
      const score = scoreMatch ? scoreMatch[1] : 'N/A';
      const feedback = resultText.replace(/Overall Score: [\d.]+\n?/, '');

      // Save to Supabase (if logged in) and locally
      await this.saveSupabaseTest(score, feedback);
      this.saveLocalTest(score, feedback);
      this.updateStatus(`Test complete! Your score is ${score}.`);
    } catch (e) {
      this.updateError('Could not generate score. Test saved without score.');
      console.error('Scoring error:', e);
      // Save even if scoring failed
      await this.saveSupabaseTest('N/A', '');
      this.saveLocalTest('N/A', '');
    } finally {
      this.isScoring = false;
      this.currentTranscript = [];
      this.part1Completed = false;
      this.part2Completed = false;
      // FIX: Removed typo 't'.
      this.part3Completed = false;
      this.selectedPart = null;
    }
  }

  private reset() {
    if (this.isRecording) return;
    // Stop any ongoing TRTC conversation and timers
    try { this.stopTencentConversation(); } catch {}
    this.stopRecording();
    this.stopTimer();
    this.stopPreparationTimer();
    this.cancelSpeaking();
    this.selectedPart = null;
    this.timer = 0;
    this.timerDisplay = '05:00';
    this.part2Topic = '';
    this.part1Set = [];
    this.part3Set = [];
    this.part2CueId = null;
    this.part1Completed = false;
    this.part2Completed = false;
    this.part3Completed = false;
    this.part2TopicLoading = false;
    this.isPreparing = false;
    this.initialPrompt = null;
    this.currentTranscript = [];
    this.updateStatus('Session cleared.');
  }
  stopRecording() {
    throw new Error('Method not implemented.');
  }

  private renderHistoryList() {
    if (this.testHistory.length === 0) {
      return html`<p style="padding: 16px; text-align: center; color: #aaa;">
        No test history found.
      </p>`;
    }
    return html`
      <ul class="history-list">
        ${this.testHistory.map(
          (test) => html`
            <li @click=${() => (this.selectedTest = test)}>
              <span class="test-name">${test.name}</span>
              <span class="test-date">${test.date}</span>
              <span class="test-score">Score: ${test.score}</span>
            </li>
          `,
        )}
      </ul>
    `;
  }

  private renderTestDetails() {
    if (!this.selectedTest) return html``;
    return html`
      <div class="test-details">
        <button @click=${() => (this.selectedTest = null)} class="back-btn">
          ← Back to List
        </button>
        <h3>Overall Score: ${this.selectedTest.score}</h3>
        <h4>Feedback</h4>
        <div class="feedback">${this.selectedTest.feedback}</div>
        <h4>Transcript</h4>
        <div class="transcript">
          ${this.selectedTest.transcript.map(
            (entry) => html`
              <div class="transcript-entry ${entry.speaker}">
                <strong>${
                  entry.speaker === 'user' ? 'You' : 'Examiner'
                }:</strong>
                <p>${entry.text}</p>
              </div>
            `,
          )}
          <!-- Live overlay lines -->
          <div id="live-overlay">
            ${this.liveLines.map(l => html`<div class="live-line ${l.role}">${l.text}</div>`)}
          </div>
        </div>
      </div>
    `;
  }

  private renderHistoryPanel() {
    return html`
      <div id="historyPanel" class=${this.isHistoryVisible ? 'visible' : ''}>
        <div class="history-header">
          <h2>${this.selectedTest ? this.selectedTest.name : 'Test History'}</h2>
          <button
            class="close-btn"
            @click=${() => {
              this.isHistoryVisible = false;
              this.selectedTest = null;
            }}
            aria-label="Close history panel">
            &times;
          </button>
        </div>
        <div class="history-content">
          ${this.selectedTest
            ? this.renderTestDetails()
            : this.renderHistoryList()}
        </div>
      </div>
    `;
  }

  private renderLoading() {
    return html`<div class="loading-container"><h1>Loading...</h1></div>`;
  }

  private renderLogin() {
    return html`
      <div class="login-container">
        <div class="login-box">
          <h1>IELTS Speaking Practice</h1>
          <p>Sign in with Google to start your practice test.</p>
          <button id="google-signin" @click=${this.signInWithGoogle}>
            Sign in with Google
          </button>
        </div>
      </div>
    `;
  }

  private renderApp() {
    const showOverlay =
      this.selectedPart === 'part2' && (this.part2TopicLoading || this.isPreparing);
    const showPrompt = false;
    return html`
      ${this.user ? this.renderProfilePanel() : ''}
      <div class="container">
        <div class="main-content-area">
          ${showPrompt
            ? html`<div id="prompt-card">
                ${this.selectedPart === 'part1'
                  ? this.renderPart1Card()
                  : this.renderPart3Card()}
              </div>`
            : ''}
        </div>

        <div class="bottom-controls">
          <div
            class="ielts-parts"
            ?hidden=${this.isRecording || this.isPreparing}>
            <button
              class=${this.selectedPart === 'part1' ? 'selected' : ''}
              @click=${() => this.selectPart('part1')}
              ?disabled=${this.isRecording || this.isPreparing}>
              Part 1
            </button>
            <button
              class=${this.selectedPart === 'part2' ? 'selected' : ''}
              @click=${() => this.selectPart('part2')}
              ?disabled=${
                this.isRecording || this.isPreparing || !this.part1Completed
              }>
              Part 2
            </button>
            <button
              class=${this.selectedPart === 'part3' ? 'selected' : ''}
              @click=${() => this.selectPart('part3')}
              ?disabled=${
                this.isRecording || this.isPreparing || !this.part2Completed
              }>
              Part 3
            </button>
          </div>

          <div class="controls">
            <button
              id="resetButton"
              @click=${this.reset}
              ?disabled=${this.isRecording}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 -960 960 960"
                fill="#ffffff">
                <path
                  d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
              </svg>
            </button>
            <button
              id="recordButton"
              @click=${this.toggleRecording}
              ?disabled=${
                !this.selectedPart || this.isPreparing || this.isScoring
              }>
              ${this.isRecording
                ? html`<svg
                    viewBox="0 0 100 100"
                    width="32px"
                    height="32px"
                    fill="white">
                    <rect x="15" y="15" width="70" height="70" rx="8" />
                  </svg>`
                : html`<svg
                    viewBox="0 0 100 100"
                    width="36px"
                    height="36px"
                    fill="white">
                    <circle cx="50" cy="50" r="50" />
                  </svg>`}
            </button>
            <div style="width: 56px; height: 56px;"></div>
          </div>
          <div id="status">${this.error || this.status}</div>
          ${this.isRecording ? html`<div style="color:#7ad7ff; font-size:12px;">${this.isTranscribing ? 'Transcribing…' : ''}</div>` : ''}
        </div>
      </div>
      <div id="timer" ?hidden=${showOverlay}>
        ${this.isRecording || this.isPreparing
          ? this.isPreparing
            ? this.preparationTimerDisplay
            : this.timerDisplay
          : ''}
      </div>
      ${showOverlay
        ? html`<div id="cue-overlay">
            <div id="cue-card">
              ${this.part2TopicLoading ? 'Generating topic...' : this.renderCueCard()}
            </div>
            <div id="prep-countdown">${this.preparationTimerDisplay}</div>
          </div>`
        : ''}
      ${this.user
        ? html`<button id="profileBtn" @click=${() => { this.isProfileVisible = !this.isProfileVisible; }}>
            ${this.user?.user_metadata?.full_name ? (this.user.user_metadata.full_name[0] || 'U') : 'U'}
          </button>`
        : ''}
      <gdm-live-audio-visuals-3d
        .inputNode=${this.inputNode}
        .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
    `;
  }

  private renderProfilePanel() {
    return html`
      <div id="profilePanel" class=${this.isProfileVisible ? 'visible' : ''}>
        <div class="profile-header">
          <div class="tabs">
            <button class=${this.profileTab === 'profile' ? 'active' : ''} @click=${() => (this.profileTab = 'profile')}>Profile</button>
            <button class=${this.profileTab === 'history' ? 'active' : ''} @click=${() => (this.profileTab = 'history')}>History</button>
          </div>
          <button class="close-btn" aria-label="Close" @click=${() => (this.isProfileVisible = false)}>&times;</button>
        </div>
        <div class="profile-content">
          ${this.profileTab === 'profile' ? this.renderProfileTab() : this.renderHistoryTab()}
        </div>
        <div class="profile-footer">
          <button class="logout-btn" @click=${this.signOutUser}>Logout</button>
        </div>
      </div>
    `;
  }

  private renderProfileTab() {
    const name = (this.user && (this.user.user_metadata?.full_name || this.user.email)) || 'User';
    const scores = this.testHistory.map((t) => `${t.date}: ${t.name} — ${t.score}`);
    return html`
      <div>
        <h3 style="margin:8px 0 4px;">${name}</h3>
        <div style="color:#aaa; font-size:14px; margin-bottom:10px;">Signed in with Google</div>
        <h4 style="margin:12px 0 6px;">TRTC Settings</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; align-items:center;">
          <label>Room ID</label>
          <input style="background:#111;border:1px solid #333;color:#fff;padding:6px 8px;border-radius:6px;"
            type="number" .value=${String(this.trtcRoomId ?? '')} @input=${(e: any) => this.trtcRoomId = Number(e.target.value || 0)} />
          <label>User ID</label>
          <input style="background:#111;border:1px solid #333;color:#fff;padding:6px 8px;border-radius:6px;"
            type="text" .value=${this.trtcUserId ?? ''} @input=${(e: any) => this.trtcUserId = e.target.value} />
          <label>Agent ID</label>
          <input style="background:#111;border:1px solid #333;color:#fff;padding:6px 8px;border-radius:6px;"
            type="text" .value=${this.trtcAgentId ?? ''} @input=${(e: any) => this.trtcAgentId = e.target.value} />
          <div></div>
          <button class="logout-btn" @click=${this.saveTrtcConfig}>Save TRTC Config</button>
        </div>
        <h4 style="margin:12px 0 6px;">Previous Scores</h4>
        ${scores.length === 0
          ? html`<div style="color:#aaa;">No tests yet.</div>`
          : html`<ul style="margin:0; padding-left:18px;">${scores.map((s) => html`<li>${s}</li>`)}</ul>`}
      </div>
    `;
  }

  private loadTrtcConfig() {
    try {
      const raw = localStorage.getItem('trtc_config');
      if (raw) {
        const obj = JSON.parse(raw);
        this.trtcRoomId = typeof obj.roomId === 'number' ? obj.roomId : (process.env.TENCENT_ROOM_ID ? Number(process.env.TENCENT_ROOM_ID) : null);
        this.trtcUserId = obj.userId || (process.env.TENCENT_USER_ID || null);
        this.trtcAgentId = obj.agentId || (process.env.TENCENT_AGENT_ID || null);
      } else {
        this.trtcRoomId = process.env.TENCENT_ROOM_ID ? Number(process.env.TENCENT_ROOM_ID) : null;
        this.trtcUserId = process.env.TENCENT_USER_ID || null;
        this.trtcAgentId = process.env.TENCENT_AGENT_ID || null;
      }
    } catch {}
  }

  private saveTrtcConfig = () => {
    const cfg = {
      roomId: this.trtcRoomId ? Number(this.trtcRoomId) : null,
      userId: this.trtcUserId || null,
      agentId: this.trtcAgentId || null,
    };
    try { localStorage.setItem('trtc_config', JSON.stringify(cfg)); } catch {}
    this.updateStatus('TRTC configuration saved.');
  };
  private addLiveLine(text: string, role: 'user'|'ai') {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    this.liveLines = [{ id, text, role }, ...this.liveLines].slice(0, 8);
    setTimeout(() => {
      this.liveLines = this.liveLines.filter(l => l.id !== id);
    }, 6000);
  }

  private renderHistoryTab() {
    return html`${this.selectedTest ? this.renderTestDetails() : this.renderHistoryList()}`;
  }

  private renderPart1Card() {
    return html`
      <h3>Part 1 Questions</h3>
      ${this.part1Set.map(
        (g) => html`
          <div class="topic">${g.topic}</div>
          <ol>
            ${g.questions.map((q) => html`<li>${q}</li>`)}
          </ol>
        `,
      )}
    `;
  }

  private renderPart3Card() {
    return html`
      <h3>Part 3 Questions</h3>
      <ol>
        ${this.part3Set.map((q) => html`<li>${q}</li>`)}
      </ol>
    `;
  }

  private renderCueCard() {
    const raw = (this.part2Topic || '').trim();
    if (!raw) return html``;

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let prompt = '';
    const bullets: string[] = [];
    let sawLabel = false;
    for (const line of lines) {
      if (!sawLabel && /you should say:?/i.test(line)) {
        sawLabel = true;
        continue;
      }
      if (!sawLabel) {
        prompt = prompt ? `${prompt} ${line}` : line;
      } else {
        const m = line.match(/^[\-•*—]\s*(.+)$/);
        if (m) bullets.push(m[1].trim());
        else if (line) bullets.push(line);
      }
    }

    return html`
      <div class="card-title">Candidate Task Card</div>
      ${prompt ? html`<div class="prompt">${prompt}</div>` : ''}
      <div class="label">You should say:</div>
      <ul>
        ${bullets.map(item => html`<li>${item}</li>`)}
      </ul>
      <div class="note">You will have one minute to think about what you are going to say. You can make some notes to help you if you wish.</div>
    `;
  }

  render() {
    // Wait for auth to initialize
    if (!this.authInitialized) {
      return this.renderLoading();
    }
    if (!this.user) {
      return this.renderLogin();
    }
    // Otherwise show the main app.
    return this.renderApp();
  }
}
