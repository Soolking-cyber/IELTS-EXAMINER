import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

interface ChatMessage {
    id: string;
    content: string;
    sender: string;
    type: 'ai' | 'user';
    end?: boolean;
}

@customElement('tencent-ai-conversation')
export class TencentAIConversation extends LitElement {
    @state() private messageList: ChatMessage[] = [];
    @state() private taskId: string | null = null;
    @state() private trtcClient: any = null;
    @state() private conversationActive = false;
    @state() private isStarting = false;
    @state() private roomId = Math.floor(Math.random() * 90000) + 10000;

    // Configuration from your existing setup
    private chatConfig = {
        SdkAppId: 20026991,
        AgentConfig: {
            UserId: "robot_id",
            UserSig: "", // Will be generated
            TargetUserId: "12096",
            WelcomeMessage: "Welcome to IELTS Speaking Test!",
            InterruptMode: 0,
            InterruptSpeechDuration: 1000
        },
        STTConfig: {
            Language: "en",
            VadSilenceTime: 1000,
            CustomParam: JSON.stringify({
                STTType: "deepgram",
                Model: "nova-3",
                ApiKey: "6f851cb6c7b34c0abeeaa42fe9dd651e48d3bceb"
            })
        },
        LLMConfig: JSON.stringify({
            LLMType: "dify",
            APIUrl: "https://api.dify.ai/v1/chat-messages",
            APIKey: "app-vmQTPOXtg1a7gIwOvZr1mt6D",
            Timeout: 5,
            User: "11775",
            Inputs: {},
            Model: null,
            Streaming: true
        }),
        TTSConfig: JSON.stringify({
            TTSType: "cartesia",
            Model: "sonic-english",
            APIKey: "sk_car_uUgWA7GoX1SQrwxntQ3zhB",
            VoiceId: "e8e5fffb-252c-436d-b842-8879b84445b6"
        })
    };

    private userInfo = {
        sdkAppId: 20026991,
        userSig: "", // Will be generated
        robotSig: "", // Will be generated
        userId: "12096",
        robotId: "robot_id"
    };

    static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 20px;
      gap: 20px;
    }

    .chat-list {
      flex: 1;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 16px;
      background-color: #111;
      display: flex;
      flex-direction: column-reverse;
      overflow-y: auto;
      gap: 12px;
    }

    .chat-item {
      display: flex;
      flex-direction: column;
      margin-bottom: 10px;
    }

    .chat-item.user {
      align-items: flex-end;
    }

    .chat-item.ai {
      align-items: flex-start;
    }

    .chat-id {
      font-weight: bold;
      font-size: 12px;
      color: #888;
      margin-bottom: 4px;
    }

    .chat-text {
      background-color: #222;
      padding: 12px 16px;
      border-radius: 12px;
      max-width: 80%;
      font-size: 14px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.4;
    }

    .chat-item.user .chat-text {
      background-color: #0066cc;
      border-bottom-right-radius: 4px;
    }

    .chat-item.ai .chat-text {
      background-color: #333;
      border-bottom-left-radius: 4px;
    }

    .controls {
      display: flex;
      gap: 12px;
      justify-content: center;
      align-items: center;
    }

    button {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .start-button {
      background: #00aa00;
      color: white;
    }

    .start-button:hover:not(:disabled) {
      background: #008800;
    }

    .end-button {
      background: #cc0000;
      color: white;
    }

    .end-button:hover:not(:disabled) {
      background: #aa0000;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .status {
      text-align: center;
      color: #888;
      font-size: 14px;
      padding: 8px;
    }

    .room-info {
      text-align: center;
      color: #666;
      font-size: 12px;
      font-family: monospace;
    }
  `;

    async connectedCallback() {
        super.connectedCallback();
        await this.loadTRTCSDK();
        await this.generateUserSigs();
    }

    private async loadTRTCSDK(): Promise<void> {
        if ((window as any).TRTC) return;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://web.sdk.qcloud.com/trtc/webrtc/v5/dist/trtc.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load TRTC SDK'));
            document.head.appendChild(script);
        });
    }

    private async generateUserSigs() {
        try {
            // Generate user signature
            const userSigResponse = await fetch('/api/trtc/usersig', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: this.userInfo.userId })
            });

            if (!userSigResponse.ok) {
                throw new Error('Failed to generate user signature');
            }

            const userSigData = await userSigResponse.json();
            this.userInfo.userSig = userSigData.userSig;

            // Generate robot signature
            const robotSigResponse = await fetch('/api/trtc/usersig', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: this.userInfo.robotId })
            });

            if (!robotSigResponse.ok) {
                throw new Error('Failed to generate robot signature');
            }

            const robotSigData = await robotSigResponse.json();
            this.userInfo.robotSig = robotSigData.userSig;
            this.chatConfig.AgentConfig.UserSig = robotSigData.userSig;

        } catch (error) {
            console.error('Failed to generate user signatures:', error);
        }
    }

    private renderChatMessages() {
        return this.messageList.map(message => html`
      <div class="chat-item ${message.type}">
        <div class="chat-id">${message.sender}</div>
        <div class="chat-text">${message.content}</div>
      </div>
    `);
    }

    private async startConversation() {
        if (this.isStarting || this.conversationActive) return;

        this.isStarting = true;

        try {
            // Initialize TRTC client
            const TRTC = (window as any).TRTC;
            this.trtcClient = TRTC.create();

            // Enter room
            await this.trtcClient.enterRoom({
                roomId: this.roomId,
                scene: "rtc",
                sdkAppId: this.userInfo.sdkAppId,
                userId: this.userInfo.userId,
                userSig: this.userInfo.userSig,
            });

            // Listen for custom messages (AI responses)
            this.trtcClient.on(TRTC.EVENT.CUSTOM_MESSAGE, (event: any) => {
                try {
                    const jsonData = new TextDecoder().decode(event.data);
                    const data = JSON.parse(jsonData);

                    if (data.type === 10000) {
                        const sender = data.sender;
                        const text = data.payload.text;
                        const roundId = data.payload.roundid;
                        const isRobot = sender === 'robot_id';
                        const end = data.payload.end;

                        // Find existing message or create new one
                        const existingIndex = this.messageList.findIndex(
                            item => item.id === roundId && item.sender === sender
                        );

                        if (existingIndex >= 0) {
                            // Update existing message
                            this.messageList[existingIndex] = {
                                ...this.messageList[existingIndex],
                                content: text,
                                end
                            };
                        } else {
                            // Add new message
                            this.messageList = [
                                {
                                    id: roundId,
                                    content: text,
                                    sender,
                                    type: isRobot ? 'ai' : 'user',
                                    end
                                },
                                ...this.messageList
                            ];
                        }

                        this.requestUpdate();
                    }
                } catch (error) {
                    console.error('Error processing custom message:', error);
                }
            });

            // Start local audio
            await this.trtcClient.startLocalAudio();

            // Start AI conversation
            const conversationData = {
                ...this.chatConfig,
                RoomId: String(this.roomId)
            };

            const response = await fetch('/api/trtc/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(conversationData)
            });

            if (!response.ok) {
                throw new Error('Failed to start AI conversation');
            }

            const result = await response.json();
            this.taskId = result.TaskId;
            this.conversationActive = true;

        } catch (error) {
            console.error('Failed to start conversation:', error);
            await this.stopConversation();
        } finally {
            this.isStarting = false;
        }
    }

    private async stopConversation() {
        try {
            // Stop AI conversation
            if (this.taskId) {
                await fetch('/api/trtc/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ TaskId: this.taskId })
                });
                this.taskId = null;
            }

            // Exit TRTC room
            if (this.trtcClient) {
                await this.trtcClient.exitRoom();
                this.trtcClient.destroy();
                this.trtcClient = null;
            }

        } catch (error) {
            console.error('Error stopping conversation:', error);
        } finally {
            this.conversationActive = false;
            this.isStarting = false;
        }
    }

    render() {
        return html`
      <div class="container">
        <div class="room-info">Room ID: ${this.roomId}</div>
        
        <div class="chat-list">
          ${this.renderChatMessages()}
        </div>

        <div class="status">
          ${this.conversationActive
                ? 'Connected - AI conversation active'
                : this.isStarting
                    ? 'Starting conversation...'
                    : 'Ready to start conversation'
            }
        </div>

        <div class="controls">
          <button 
            class="start-button" 
            ?disabled=${this.conversationActive || this.isStarting}
            @click=${this.startConversation}
          >
            ${this.isStarting ? 'Starting...' : 'Start Conversation'}
          </button>
          
          <button 
            class="end-button" 
            ?disabled=${!this.conversationActive}
            @click=${this.stopConversation}
          >
            End Conversation
          </button>
        </div>
      </div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'tencent-ai-conversation': TencentAIConversation;
    }
}