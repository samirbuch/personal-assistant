export type NumberLike = string;
export type Base64 = string;

export namespace TwilioWebsocket {
  export type Event =
    | "connected"
    | "start"
    | "media"
    | "stop"
    | "dtmf"
    | "mark";

  export interface BaseMessage {
    event: Event;
    sequenceNumber: NumberLike;
    streamSid: string;
  }

  export interface ConnectedMessage
    extends Omit<BaseMessage, "sequenceNumber" | "streamSid"> {
    event: "connected";
    protocol: string;
    version: string;
  }

  export interface StartMessage extends BaseMessage {
    event: "start";
    start: {
      streamSid: string;
      accountSid: string;
      callSid: string;
      tracks: ("inbound" | "outbound")[];
      customParameters?: Record<string, string | number | object>;
      mediaFormat: {
        encoding: "audio/x-mulaw";
        sampleRate: 8000;
        channels: 1;
      };
    };
  }

  export interface MediaMessage extends BaseMessage {
    event: "media";
    media: {
      track: "inbound" | "outbound";
      chunk: NumberLike;
      timestamp: NumberLike;
      payload: Base64; // Raw audio encoded in base64
    };
  }

  export interface StopMessage extends BaseMessage {
    event: "stop";
    stop: {
      accountSid: string;
      callSid: string;
    };
  }

  export interface DTMFMessage extends BaseMessage {
    event: "dtmf";
    dtmf: {
      track: "inbound_track";
      digit: NumberLike;
    };
  }

  export interface MarkMessage extends BaseMessage {
    event: "mark";
    mark: {
      name: string;
    };
  }

  export namespace Sendable {
    export type SendableEvent = "media" | "mark" | "clear"

    export interface BaseSendableMessage {
      event: SendableEvent
      streamSid: string
    }

    export interface MediaMessage extends BaseSendableMessage {
      event: "media",
      media: {
        payload: Base64
      }
    }

    export interface MarkMessage extends BaseSendableMessage {
      event: "mark",
      mark: {
        name: string
      }
    }

    export interface ClearMessage extends BaseSendableMessage {
      event: "clear"
    }
  }
}