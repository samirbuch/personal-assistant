/**
 * Voice Agent State Machine
 * 
 * Simple, deterministic state machine for voice conversations.
 * States represent what the agent is doing right now.
 */

export enum AgentState {
  IDLE = "IDLE",           // Not in a call
  LISTENING = "LISTENING", // Waiting for user to speak
  THINKING = "THINKING",   // Processing user input with LLM
  SPEAKING = "SPEAKING",   // Agent is speaking (TTS active)
  INTERRUPTED = "INTERRUPTED" // User interrupted during speaking
}

export type StateTransition = {
  from: AgentState;
  to: AgentState;
  timestamp: number;
  reason?: string;
};

export class VoiceAgentStateMachine {
  private currentState: AgentState = AgentState.IDLE;
  private transitions: StateTransition[] = [];
  private stateChangeListeners: ((state: AgentState, previous: AgentState) => void)[] = [];

  constructor() {
    this.currentState = AgentState.IDLE;
  }

  public getState(): AgentState {
    return this.currentState;
  }

  public canTransitionTo(newState: AgentState): boolean {
    const validTransitions: Record<AgentState, AgentState[]> = {
      [AgentState.IDLE]: [AgentState.LISTENING],
      [AgentState.LISTENING]: [AgentState.THINKING, AgentState.IDLE],
      [AgentState.THINKING]: [AgentState.SPEAKING, AgentState.LISTENING, AgentState.IDLE],
      [AgentState.SPEAKING]: [AgentState.LISTENING, AgentState.INTERRUPTED, AgentState.IDLE],
      [AgentState.INTERRUPTED]: [AgentState.LISTENING, AgentState.IDLE]
    };

    return validTransitions[this.currentState].includes(newState);
  }

  public transition(to: AgentState, reason?: string): boolean {
    if (!this.canTransitionTo(to)) {
      console.warn(`Invalid transition from ${this.currentState} to ${to}`);
      return false;
    }

    const previous = this.currentState;
    this.currentState = to;

    const transition: StateTransition = {
      from: previous,
      to,
      timestamp: Date.now(),
      reason
    };

    this.transitions.push(transition);
    console.log(`[StateMachine] ${previous} → ${to}${reason ? ` (${reason})` : ""}`);

    // Notify listeners
    this.stateChangeListeners.forEach(listener => listener(to, previous));

    return true;
  }

  public onStateChange(listener: (state: AgentState, previous: AgentState) => void): void {
    this.stateChangeListeners.push(listener);
  }

  public is(state: AgentState): boolean {
    return this.currentState === state;
  }

  public isOneOf(...states: AgentState[]): boolean {
    return states.includes(this.currentState);
  }

  public reset(): void {
    this.currentState = AgentState.IDLE;
    this.transitions = [];
  }

  public getTransitionHistory(): StateTransition[] {
    return [...this.transitions];
  }
}
