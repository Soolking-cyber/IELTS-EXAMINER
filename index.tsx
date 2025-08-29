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

  // Authentication state
  @state() private user: User | null = null;
  @state() private authInitialized = false;
  @state() private firebaseAvailable = isFirebaseConfigured;
  @state() private isGuestMode = false;

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

    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      padding: 32px;
      align-items: center;
      justify-content: space-between;
      position: relative;
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
      width: 100%;
      max-width: 500px;
      color: white;
      padding: 24px;
      z-index: 5;
      font-size: 18px;
      line-height: 1.6;
      white-space: pre-wrap;
      text-align: center;
    }

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
        padding: 32px;
        font-size: 20px;
      }
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
        this.isGuestMode = false;
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

  private signInAsGuest() {
    this.isGuestMode = true;
    this.initClient();
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
              // Check if the AI has finished giving Part 2 instructions
              if (
                this.selectedPart === 'part2' &&
                !this.isPreparing &&
                !this.isRecording &&
                modelText.toLowerCase().includes('starts now')
              ) {
                this.startPreparationTimer();
              }
            }
            
            // FIX: The property for speech recognition results is 'speechRecognitionResults' (plural) and it is an array.
            // FIX: User speech recognition results are nested under the 'userTurn' property, mirroring the 'modelTurn' structure for model responses.
            const userText =
              message.serverContent?.userTurn?.speechRecognitionResults?.[0]?.text;
            const isFinal =
              message.serverContent?.userTurn?.speechRecognitionResults?.[0]?.isFinal;

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
          systemInstruction: `You are a professional IELTS examiner. Your role is to conduct a simulated IELTS speaking test. Adhere strictly to the official test format, maintaining a professional yet encouraging tone. Do not deviate from the script for each part's instructions.

**General Rules:**
- When you are given a prompt like "Let's start IELTS Speaking Part X", you must initiate that part of the test according to the instructions below.
- Do not add any conversational filler that is not part of the standard IELTS script.

**Part 1 Procedure:**
- **Trigger:** The user prompt "Let's start IELTS Speaking Part 1."
- **Your Script:**
  1. Say: "Good morning. My name is [Your Examiner Name]. Welcome to the speaking portion of the IELTS examination. Can you tell me your full name, please? ... And what should I call you? ... Thank you. In this first part, I'd like to ask you some questions about yourself."
  2. To ensure variety, you must select 2-3 different topics for this part. For each new test, you must choose topics you haven't used recently. Draw from the following extensive list: Work, Studies, Hometown, Home, Accommodation, Art, Birthdays, Childhood, Clothes, Computers, Daily Routine, Dictionaries, Evenings, Family and Friends, Flowers, Food, Going out, Hobbies, Holidays, Internet, Leisure time, Music, Movies, Neighbors, Newspapers, Pets, Reading, Shopping, Sport, TV, Transportation, Travel, Weather, Names, Sleep, Public Transportation, Concentration, Weekends, Emails, Social Media, Gifts, Colors, Dreams, Being in a hurry, Puzzles, Sitting down, Noise, Sharing, Teachers, Science, Apps, Websites, Singing, History, Robots.
  3. Ask 3-4 questions for each topic.
  4. Conclude Part 1 by saying: "Thank you. That is the end of Part 1."

**Part 2 Procedure:**
- **Trigger:** You will receive a user prompt containing the cue card topic, like this: "The user is starting Part 2. Please give the standard Part 2 instructions, and then read the following cue card topic verbatim: '[The Cue Card Topic]'".
- **Your Script:**
  1. Say: "Now, in this second part, I am going to give you a topic, and I would like you to talk about it for one to two minutes. Before you talk, you will have one minute to think about what you are going to say. You can make notes if you wish. Do you understand?"
  2. After a brief pause, read the topic you were given verbatim.
  3. After reading the topic, say: "You have one minute to prepare your answer. Your preparation time starts now."

**Part 3 Procedure:**
- **Trigger:** The user prompt "Let's start IELTS Speaking Part 3. The topic for Part 2 was: '[The Part 2 Topic]'".
- **Your Script:**
  1. Say: "We've been talking about [general theme from Part 2 topic], and I'd like to discuss with you one or two more general questions related to this. First, let's consider..."
  2. Ask 4-6 abstract, discussion-style questions related to the Part 2 topic. You can ask follow-up questions to probe deeper.
  3. Conclude the entire test by saying: "Thank you very much. That is the end of the speaking test."`,
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
      this.updateStatus(
        'Listen to the examiner for your topic and instructions.',
      );

      // Trigger the AI to read the instructions and the topic.
      // The onmessage handler will listen for the cue to start the prep timer.
      this.session.sendRealtimeInput({
        text: `The user is starting Part 2. Please give the standard Part 2 instructions, and then read the following cue card topic verbatim: "${this.part2Topic}"`,
      });
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
      this.updateStatus(''); // Clear status during recording
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

  private toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
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
      // FIX: Removed typo 't'.
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
    this.timerDisplay = '05:00';
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
          <button id="guest-signin" @click=${this.signInAsGuest}>
            Continue as Guest
          </button>
        </div>
      </div>
    `;
  }

  private renderApp() {
    const isCueCardActive = this.selectedPart === 'part2' && !this.isRecording;
    return html`
      ${this.user ? this.renderHistoryPanel() : ''}
      <div class="container">
        <div class="main-content-area">
          <div
            id="cue-card"
            ?hidden=${!isCueCardActive}>
            ${this.part2TopicLoading ? 'Generating topic...' : this.part2Topic}
          </div>
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
        </div>
      </div>
      <div id="timer" ?hidden=${isCueCardActive}>
        ${this.isRecording || this.isPreparing
          ? this.isPreparing
            ? this.preparationTimerDisplay
            : this.timerDisplay
          : ''}
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
    // If Firebase is set up but user isn't logged in and is not in guest mode, show login page.
    if (this.firebaseAvailable && !this.user && !this.isGuestMode) {
      return this.renderLogin();
    }
    // Otherwise (user is logged in, OR is in guest mode, OR Firebase is not configured), show the main app.
    return this.renderApp();
  }
}