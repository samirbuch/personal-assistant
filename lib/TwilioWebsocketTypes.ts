import { z } from "zod";

export const NumberLikeSchema = z.string();
export type NumberLike = z.infer<typeof NumberLikeSchema>;

export const Base64Schema = z.string();
export type Base64 = z.infer<typeof Base64Schema>;

export namespace TwilioWebsocket {
  export const EventSchema = z.enum([
    "connected",
    "start",
    "media",
    "stop",
    "dtmf",
    "mark",
  ]);
  export type Event = z.infer<typeof EventSchema>;

  export const BaseMessageSchema = z.object({
    event: EventSchema,
    sequenceNumber: NumberLikeSchema,
    streamSid: z.string(),
  });
  export type BaseMessage = z.infer<typeof BaseMessageSchema>;

  export const ConnectedMessageSchema = BaseMessageSchema.omit({
    sequenceNumber: true,
    streamSid: true,
  }).extend({
    event: EventSchema.extract(["connected"]),
    protocol: z.string(),
    version: z.string(),
  });
  export type ConnectedMessage = z.infer<typeof ConnectedMessageSchema>;

  export const StartMessageSchema = BaseMessageSchema.extend({
    event: EventSchema.extract(["start"]),
    start: z.object({
      streamSid: z.string(),
      accountSid: z.string(),
      callSid: z.string(),
      tracks: z.array(z.enum(["inbound", "outbound"])),
      customParameters: z.record(z.string(), z.union([z.string(), z.number(), z.record(z.string(), z.any())])).optional(),
      mediaFormat: z.object({
        encoding: z.literal("audio/x-mulaw"),
        sampleRate: z.literal(8000),
        channels: z.literal(1),
      }),
    }),
  });
  export type StartMessage = z.infer<typeof StartMessageSchema>;

  export const MediaMessageSchema = BaseMessageSchema.extend({
    event: EventSchema.extract(["media"]),
    media: z.object({
      track: z.enum(["inbound", "outbound"]),
      chunk: NumberLikeSchema,
      timestamp: NumberLikeSchema,
      payload: Base64Schema, // Raw audio encoded in base64
    }),
  });
  export type MediaMessage = z.infer<typeof MediaMessageSchema>;

  export const StopMessageSchema = BaseMessageSchema.extend({
    event: EventSchema.extract(["stop"]),
    stop: z.object({
      accountSid: z.string(),
      callSid: z.string(),
    }),
  });
  export type StopMessage = z.infer<typeof StopMessageSchema>;

  export const DTMFMessageSchema = BaseMessageSchema.extend({
    event: EventSchema.extract(["dtmf"]),
    dtmf: z.object({
      track: z.literal("inbound_track"),
      digit: NumberLikeSchema,
    }),
  });
  export type DTMFMessage = z.infer<typeof DTMFMessageSchema>;

  export const MarkMessageSchema = BaseMessageSchema.extend({
    event: EventSchema.extract(["mark"]),
    mark: z.object({
      name: z.string(),
    }),
  });
  export type MarkMessage = z.infer<typeof MarkMessageSchema>;

  export const MessageSchema = z.discriminatedUnion("event", [
    ConnectedMessageSchema,
    StartMessageSchema,
    MediaMessageSchema,
    StopMessageSchema,
    DTMFMessageSchema,
    MarkMessageSchema,
  ]);
  export type Message = z.infer<typeof MessageSchema>;

  export namespace Sendable {
    export const SendableEventSchema = z.enum(["media", "mark", "clear"]);
    export type SendableEvent = z.infer<typeof SendableEventSchema>;

    export const BaseSendableMessageSchema = z.object({
      event: SendableEventSchema,
      streamSid: z.string(),
    });
    export type BaseSendableMessage = z.infer<typeof BaseSendableMessageSchema>;

    export const MediaMessageSchema = BaseSendableMessageSchema.extend({
      event: SendableEventSchema.extract(["media"]),
      media: z.object({
        payload: Base64Schema,
      }),
    });
    export type MediaMessage = z.infer<typeof MediaMessageSchema>;

    export const MarkMessageSchema = BaseSendableMessageSchema.extend({
      event: SendableEventSchema.extract(["mark"]),
      mark: z.object({
        name: z.string(),
      }),
    });
    export type MarkMessage = z.infer<typeof MarkMessageSchema>;

    export const ClearMessageSchema = BaseSendableMessageSchema.extend({
      event: SendableEventSchema.extract(["clear"]),
    });
    export type ClearMessage = z.infer<typeof ClearMessageSchema>;

    export const MessageSchema = z.discriminatedUnion("event", [
      MediaMessageSchema,
      MarkMessageSchema,
      ClearMessageSchema,
    ]);
    export type Message = z.infer<typeof MessageSchema>;
  }
}