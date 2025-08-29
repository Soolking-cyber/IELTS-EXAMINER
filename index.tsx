/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
  Blob,
} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

// Firebase Imports
import {initializeApp} from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyDLkOMHGGrxwtHA9lWZeY5yLFpRTsZeqdU',
  authDomain: 'ielts-8334c.firebaseapp.com',
  projectId: 'ielts-8334c',
  storageBucket: 'ielts-8334c.firebasestorage.app',
  messagingSenderId: '738799923949',
  appId: '1:738799923949:web:2e8251461ac7f3160552e4',
};

// A flag to check if firebase config is valid
const isFirebaseConfigured =
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'undefined' &&
  firebaseConfig.projectId;

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

  @state() status = 'Select a part to begin.';
  @state() error = '';
  @state() selectedPart: 'part1' | 'part2' | 'part3' | null = null;
  @state() timer = 0;
  @state() timerDisplay = '';
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

  // Authentication state
  @state() private user: User | null = null;
  @state() private authInitialized = false;
  @state() private firebaseAvailable = isFirebaseConfigured;

  // Firebase services
  private app;
  private auth;
  private db;

  private timerInterval: any = null;
  private preparationTimerInterval: any = null;
  private readonly partDurations = {part1: 300, part2: 120, part3: 300}; // in seconds

  private client: GoogleGenAI;
  private session: Session;
  // FIX: Property 'webkitAudioContext' does not exist on type 'Window & typeof globalThis'. Cast to any to allow fallback.
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  // FIX: Property 'webkitAudioContext' does not exist on type 'Window & typeof globalThis'. Cast to any to allow fallback.
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();
  private initialPrompt: string | null = null;
  private readonly logoUrl =
    'data:image/png;base64,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';

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      color: white;
      font-family: sans-serif;
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      padding: 5vh 24px;
      box-sizing: border-box;
      align-items: center;
      position: relative;
    }

    .logo {
      position: absolute;
      top: 24px;
      left: 24px;
      z-index: 20;
    }

    .logo img {
      width: 48px;
      height: 48px;
    }

    .top-bar {
      position: absolute;
      top: 24px;
      right: 24px;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .top-bar button {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid white;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .top-bar button:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 12px;
      border-radius: 20px;
    }

    .user-info img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }

    .user-info span {
      font-weight: bold;
    }

    #status {
      position: relative;
      text-align: center;
      margin-top: 15px; /* Spacing from controls */
      font-size: clamp(0.9rem, 3vw, 1rem);
    }

    #cue-card {
      position: relative;
      width: 100%;
      max-width: 500px;
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid white;
      color: white;
      padding: 20px;
      border-radius: 12px;
      z-index: 5;
      font-size: clamp(1rem, 4vw, 1.1rem);
      line-height: 1.6;
      white-space: pre-wrap; /* To respect newlines from the AI response */
      font-family: sans-serif;
      text-align: center;
    }

    #cue-card[hidden] {
      display: none;
    }

    .bottom-controls {
      position: relative;
      margin-top: auto; /* Pushes this to the bottom of the flex container */
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      z-index: 10;
      width: 100%;
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid white;
        color: white;
        border-radius: 12px;
        background: transparent;
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: transparent;
        }
      }

      #startButton[disabled],
      #stopButton[disabled] {
        display: none;
      }

      #resetButton:disabled {
        display: block; /* Override default disabled behavior to just change opacity */
      }
    }

    #timer {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: clamp(3rem, 15vw, 4rem);
      z-index: 5;
      font-family: monospace;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }

    .container.is-preparing #timer,
    :host([isRecording]) #timer {
      opacity: 1;
    }

    .ielts-parts {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .ielts-parts[hidden] {
      display: none;
    }

    .ielts-parts button {
      outline: none;
      border: 1px solid white;
      color: white;
      border-radius: 8px;
      background: transparent;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 16px;
      transition: background-color 0.2s, color 0.2s;
    }

    .ielts-parts button:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .ielts-parts button.selected {
      background: white;
      color: black;
    }

    .ielts-parts button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .ielts-parts button:disabled:hover {
      background: transparent;
    }

    /* History Panel Styles */
    #historyPanel {
      position: fixed;
      top: 0;
      right: 0;
      width: min(90vw, 500px);
      height: 100%;
      background-color: #111;
      border-left: 1px solid #444;
      box-shadow: -5px 0 15px rgba(0, 0, 0, 0.5);
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
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
      padding: 16px;
      border-bottom: 1px solid #444;
    }

    .history-header h2 {
      margin: 0;
      font-size: 1.2rem;
    }

    .history-header .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 2rem;
      cursor: pointer;
    }

    .history-content {
      flex-grow: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .history-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .history-list li {
      padding: 12px 8px;
      border-bottom: 1px solid #333;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .history-list li:hover {
      background-color: #222;
    }

    .history-list .test-name {
      font-weight: bold;
    }
    .history-list .test-date,
    .history-list .test-score {
      display: block;
      font-size: 0.9rem;
      color: #aaa;
      margin-top: 4px;
    }

    .test-details .back-btn {
      background: none;
      border: 1px solid white;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 16px;
    }

    .test-details h3,
    .test-details h4 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }

    .test-details .feedback {
      white-space: pre-wrap;
      line-height: 1.6;
      background-color: #222;
      padding: 12px;
      border-radius: 8px;
    }

    .transcript {
      max-height: 40vh;
      overflow-y: auto;
      border: 1px solid #333;
      padding: 8px;
      border-radius: 8px;
    }

    .transcript-entry {
      margin-bottom: 12px;
    }

    .transcript-entry strong {
      display: block;
      margin-bottom: 4px;
      color: #ccc;
    }

    .transcript-entry.user strong {
      color: #87ceeb; /* Sky Blue */
    }
    .transcript-entry.examiner strong {
      color: #98fb98; /* Pale Green */
    }

    .transcript-entry p {
      margin: 0;
      line-height: 1.5;
    }
    .loading-container,
    .login-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      width: 100%;
      background-color: #000;
    }
    .login-box {
      background: rgba(30, 30, 30, 0.8);
      padding: 40px 50px;
      border-radius: 12px;
      text-align: center;
      border: 1px solid #444;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .login-box h1 {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 2rem;
    }
    .login-box p {
      margin-bottom: 30px;
      color: #bbb;
      max-width: 300px;
    }
    #google-signin {
      background-color: #4285f4;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      transition: background-color 0.3s;
    }
    #google-signin:hover {
      background-color: #357ae8;
    }
    #google-signin:disabled {
      background-color: #555;
      cursor: not-allowed;
    }
  `;

  constructor() {
    super();
    if (this.firebaseAvailable) {
      // Initialize Firebase
      this.app = initializeApp(firebaseConfig);
      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.firebaseAvailable) {
      this.listenForAuthChanges();
    } else {
      console.warn(
        'Firebase configuration is missing. Running in Guest Mode.',
      );
      this.authInitialized = true;
      this.initClient();
    }
  }

  private listenForAuthChanges() {
    onAuthStateChanged(this.auth, async (user) => {
      if (user) {
        this.user = user;
        const userDocRef = doc(this.db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) {
          await setDoc(userDocRef, {
            displayName: user.displayName,
            email: user.email,
            createdAt: serverTimestamp(),
          });
        }
        this.initClient();
        this.loadHistory();
      } else {
        this.user = null;
        this.testHistory = []; // Clear history on logout
      }
      this.authInitialized = true;
    });
  }

  private async signInWithGoogle() {
    if (!this.firebaseAvailable) return;
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(this.auth, provider);
    } catch (error) {
      console.error('Authentication Error: ', error);
      this.updateError('Failed to sign in. Please try again.');
    }
  }

  private async signOutUser() {
    if (!this.firebaseAvailable) return;
    await signOut(this.auth);
  }

  private async loadHistory() {
    if (!this.user || !this.firebaseAvailable) return;
    try {
      const historyCollection = collection(
        this.db,
        'users',
        this.user.uid,
        'testHistory',
      );
      const q = query(historyCollection, orderBy('id', 'desc'));
      const querySnapshot = await getDocs(q);
      this.testHistory = querySnapshot.docs.map((d) => d.data() as TestRecord);
    } catch (e) {
      console.error('Error loading history: ', e);
      this.updateError('Could not load test history.');
    }
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    const genAIApiKey = process.env.API_KEY;
    if (!genAIApiKey || genAIApiKey === 'undefined') {
      this.updateError(
        'Google API Key is not configured. App cannot function.',
      );
      return;
    }

    this.client = new GoogleGenAI({
      apiKey: genAIApiKey,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    if (!this.client) return;
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Session opened. Select a part to begin.');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const modelText = message.serverContent?.modelTurn?.parts[0]?.text;
            if (modelText) {
              this.currentTranscript = [
                ...this.currentTranscript,
                {speaker: 'examiner', text: modelText},
              ];
            }

            // FIX: speechRecognitionResult is a top-level property on the message, not nested under serverContent.
            const userText =
              message.speechRecognitionResult?.text;
            const isFinal =
              message.speechRecognitionResult?.isFinal;

            if (userText && isFinal) {
              this.currentTranscript = [
                ...this.currentTranscript,
                {speaker: 'user', text: userText},
              ];
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Close:' + e.reason);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
          },
          systemInstruction:
            "You are a helpful and friendly IELTS examiner. You will conduct a speaking test with the user. Follow the user's prompts to start the correct part of the test.",
        },
      });
    } catch (e) {
      console.error(e);
      this.updateError(`Failed to initialize session: ${e.message}`);
    }
  }

  private updateStatus(msg: string) {
    this.error = '';
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
    this.status = '';
  }

  private selectPart(part: 'part1' | 'part2' | 'part3') {
    if (this.isRecording || this.isPreparing) return;
    this.selectedPart = part;

    if (part === 'part2') {
      this.generateAndSetPart2Topic();
    } else {
      const duration = this.partDurations[part];
      this.timer = duration;
      this.updateTimerDisplay();
      this.part2Topic = '';
    }
  }

  private async generateAndSetPart2Topic() {
    this.part2Topic = '';
    this.part2TopicLoading = true;
    this.part2Completed = false;
    this.updateStatus('Generating IELTS Part 2 topic...');

    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents:
          'Generate a random IELTS speaking Part 2 cue card topic. The response should be a string containing the main topic, followed by "You should say:", and then three or four bullet points, each on a new line starting with a hyphen.',
      });

      if (!this.part2TopicLoading) {
        return; // Component was reset while generating.
      }

      this.part2Topic = response.text;
      this.startPreparationTimer();
      this.updateStatus(
        'Topic generated. You have 1 minute to prepare your answer.',
      );
    } catch (e) {
      if (this.part2TopicLoading) {
        this.updateError('Failed to generate topic. Please try again.');
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
        this.stopRecording();
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
    this.updateStatus(
      'Prepare your answer. Recording will start automatically.',
    );

    this.preparationTimerInterval = setInterval(() => {
      this.preparationTimer -= 1;
      this.updatePreparationTimerDisplay();
      if (this.preparationTimer <= 0) {
        this.stopPreparationTimer();
        this.startRecording(); // Automatically start recording
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

  private async startRecording() {
    if (this.isRecording || !this.selectedPart || this.isPreparing) {
      return;
    }

    const duration = this.partDurations[this.selectedPart];
    this.timer = duration;
    this.updateTimerDisplay();

    if (this.selectedPart === 'part1') {
      this.initialPrompt = "Let's start IELTS Speaking Part 1.";
    } else if (this.selectedPart === 'part3') {
      if (!this.part2Topic) {
        this.updateError(
          'Cannot start Part 3 without a Part 2 topic. Please complete Part 2 first.',
        );
        return;
      }
      this.initialPrompt = `Let's start IELTS Speaking Part 3. The topic for Part 2 was: "${this.part2Topic}"`;
    } else {
      this.initialPrompt = null;
    }

    this.inputAudioContext.resume();
    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        const payload: {media: Blob; text?: string} = {
          media: createBlob(pcmData),
        };

        if (this.initialPrompt) {
          payload.text = this.initialPrompt;
          this.initialPrompt = null;
        }

        this.session.sendRealtimeInput(payload);
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.startTimer();
      this.updateStatus('🔴 Recording...');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    let nextStatus = 'Recording stopped. Select a part to begin again.';
    if (this.selectedPart === 'part1') {
      this.part1Completed = true;
      nextStatus = 'Part 1 complete. Select Part 2 to receive your topic.';
    } else if (this.selectedPart === 'part2') {
      this.part2Completed = true;
      nextStatus = 'Part 2 complete. Select Part 3 to continue the discussion.';
    } else if (this.selectedPart === 'part3') {
      this.part3Completed = true;
    }

    this.updateStatus('Stopping recording...');
    this.stopTimer();
    this.stopPreparationTimer();
    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.part3Completed) {
      this.getAndSaveScore();
    } else {
      this.updateStatus(nextStatus);
    }
  }

  private async getAndSaveScore() {
    if (this.currentTranscript.length === 0) return;

    this.isScoring = true;
    this.updateStatus('Test complete. Generating your score and feedback...');

    const fullTranscript = this.currentTranscript
      .map((entry) => `${entry.speaker}: ${entry.text}`)
      .join('\n');

    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Based on the following IELTS speaking test transcript, provide an overall band score and detailed feedback on fluency, lexical resource, grammar, and pronunciation. Format the output as a string starting with "Overall Score: [score]" followed by a newline, and then the detailed feedback. Transcript:\n\n${fullTranscript}`,
      });

      const resultText = response.text;
      const scoreMatch = resultText.match(/Overall Score: ([\d.]+)/);
      const score = scoreMatch ? scoreMatch[1] : 'N/A';
      const feedback = resultText.replace(/Overall Score: [\d.]+\n?/, '');

      if (this.user) {
        const newTest: TestRecord = {
          id: Date.now(),
          name: `IELTS Test ${this.testHistory.length + 1}`,
          date: new Date().toLocaleDateString(),
          transcript: this.currentTranscript,
          score,
          feedback,
        };
        await addDoc(
          collection(this.db, 'users', this.user.uid, 'testHistory'),
          newTest,
        );
        this.testHistory = [newTest, ...this.testHistory];
        this.updateStatus(
          `Test saved! Your score is ${score}. Select a part to begin a new test.`,
        );
      } else {
        this.updateStatus(
          `Test complete! Your score is ${score}. Scores are not saved in Guest Mode.`,
        );
      }
    } catch (e) {
      this.updateError('Could not generate score. Test saved without score.');
      console.error('Scoring error:', e);
      if (this.user) {
        const newTest: TestRecord = {
          id: Date.now(),
          name: `IELTS Test ${this.testHistory.length + 1}`,
          date: new Date().toLocaleDateString(),
          transcript: this.currentTranscript,
          score: 'Error',
          feedback: 'Could not generate feedback.',
        };

        await addDoc(
          collection(this.db, 'users', this.user.uid, 'testHistory'),
          newTest,
        );
        this.testHistory = [newTest, ...this.testHistory];
      }
    } finally {
      this.isScoring = false;
      this.currentTranscript = [];
      this.part1Completed = false;
      this.part2Completed = false;
      this.part3Completed = false;
      this.selectedPart = null;
    }
  }

  private reset() {
    if (this.isRecording) return;

    this.session?.close();
    this.stopRecording();
    this.stopTimer();
    this.stopPreparationTimer();
    this.selectedPart = null;
    this.timer = 0;
    this.timerDisplay = '';
    this.part2Topic = '';
    this.part1Completed = false;
    this.part2Completed = false;
    this.part3Completed = false;
    this.part2TopicLoading = false;
    this.isPreparing = false;
    this.initialPrompt = null;
    this.currentTranscript = [];
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  private renderHistoryList() {
    if (this.testHistory.length === 0) {
      return html`<p>No test history found.</p>`;
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
        <p class="feedback">${this.selectedTest.feedback}</p>
        <h4>Transcript</h4>
        <div class="transcript">
          ${this.selectedTest.transcript.map(
            (entry) => html`
              <div class="transcript-entry ${entry.speaker}">
                <strong>${entry.speaker === 'user' ? 'You' : 'Examiner'}:</strong>
                <p>${entry.text}</p>
              </div>
            `,
          )}
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
          <p>Log in to start your practice test and save your progress.</p>
          <button id="google-signin" @click=${this.signInWithGoogle}>
            Sign in with Google
          </button>
        </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }

  private renderApp() {
    return html`
      ${this.user ? this.renderHistoryPanel() : ''}
      <div class="container ${this.isPreparing ? 'is-preparing' : ''}">
        <div class="logo">
          <img src=${this.logoUrl} alt="App Logo" />
        </div>
        <div class="top-bar">
          ${this.user
            ? html`
                <div class="user-info">
                  <img
                    src=${this.user.photoURL}
                    alt="User profile picture"
                    referrerpolicy="no-referrer" />
                  <span>${this.user.displayName}</span>
                </div>
                <button
                  id="historyButton"
                  @click=${() => (this.isHistoryVisible = !this.isHistoryVisible)}>
                  Test History
                </button>
                <button id="signOutButton" @click=${this.signOutUser}>
                  Sign Out
                </button>
              `
            : html`
                <div class="user-info">
                  <span>Guest Mode</span>
                </div>
              `}
        </div>

        <div
          id="cue-card"
          ?hidden=${this.selectedPart !== 'part2' || this.isRecording}>
          ${this.part2TopicLoading ? 'Generating topic...' : this.part2Topic}
        </div>

        <div class="bottom-controls">
          <div
            class="ielts-parts"
            ?hidden=${this.isRecording || this.isPreparing}>
            <button
              class=${this.selectedPart === 'part1' ? 'selected' : ''}
              @click=${() => this.selectPart('part1')}
              ?disabled=${this.isRecording || this.isPreparing}>
              IELTS Part 1
            </button>
            <button
              class=${this.selectedPart === 'part2' ? 'selected' : ''}
              @click=${() => this.selectPart('part2')}
              ?disabled=${
                this.isRecording || this.isPreparing || !this.part1Completed
              }>
              IELTS Part 2
            </button>
            <button
              class=${this.selectedPart === 'part3' ? 'selected' : ''}
              @click=${() => this.selectPart('part3')}
              ?disabled=${
                this.isRecording || this.isPreparing || !this.part2Completed
              }>
              IELTS Part 3
            </button>
          </div>

          <div class="controls">
            <button
              id="resetButton"
              @click=${this.reset}
              ?disabled=${this.isRecording}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="40px"
                viewBox="0 -960 960 960"
                width="40px"
                fill="#ffffff">
                <path
                  d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
              </svg>
            </button>
            <button
              id="startButton"
              @click=${this.startRecording}
              ?disabled=${
                this.isRecording || !this.selectedPart || this.isPreparing
              }>
              <svg
                viewBox="0 0 100 100"
                width="32px"
                height="32px"
                fill="white"
                xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="45" />
              </svg>
            </button>
            <button
              id="stopButton"
              @click=${this.stopRecording}
              ?disabled=${!this.isRecording}>
              <svg
                viewBox="0 0 100 100"
                width="32px"
                height="32px"
                fill="white"
                xmlns="http://www.w3.org/2000/svg">
                <rect x="15" y="15" width="70" height="70" rx="10" />
              </svg>
            </button>
          </div>
        </div>

        <div id="status">${this.error || this.status}</div>
      </div>
      <div id="timer">
        ${this.isPreparing ? this.preparationTimerDisplay : this.timerDisplay}
      </div>
      <gdm-live-audio-visuals-3d
        .inputNode=${this.inputNode}
        .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
    `;
  }

  render() {
    // If we're waiting for Firebase auth to initialize, show loading.
    if (!this.authInitialized && this.firebaseAvailable) {
      return this.renderLoading();
    }
    // If Firebase is set up but user isn't logged in, show login page.
    if (!this.user && this.firebaseAvailable) {
      return this.renderLogin();
    }
    // Otherwise (user is logged in, OR Firebase is not configured), show the main app.
    return this.renderApp();
  }
}