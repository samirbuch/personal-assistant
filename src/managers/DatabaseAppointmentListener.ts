import { EventEmitter } from "node:events";
import supabaseAdmin from "../lib/supabaseAdmin";
import type { RealtimeChannel, RealtimePostgresChangesPayload, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import type { Tables, TablesInsert, TablesUpdate } from "../../lib/supabase.types";

// really fucking stupid that @types/node doesn't export this lol
type EventEmitterOptions = ConstructorParameters<typeof EventEmitter>[0];

export const APPOINTMENT_EVENTS = {
  CREATED: "created",
  UPDATED: "updated",
  DISPATCHED: "dispatched"
} as const;

export default class DatabaseAppointmentListener extends EventEmitter {

  private readonly channel: RealtimeChannel;

  constructor(options?: EventEmitterOptions) {
    super(options);

    const channel = supabaseAdmin
      .channel("appointment-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Appointments"
        },
        (payload: RealtimePostgresChangesPayload<Tables<"Appointments">>) => {
          console.log("APPOINTMENT PAYLOAD", payload);

          switch(payload.eventType) {
            case "INSERT": {
              this.handleInsert(payload);
              break;
            }
            case "UPDATE": {
              this.handleUpdate(payload);
              break;
            }
            default: {
              console.log("Unhandled payload type 👍");
              break;
            }
          }
        }
      )
      .subscribe();

    this.channel = channel;
  }

  private handleInsert(payload: RealtimePostgresInsertPayload<TablesInsert<"Appointments">>) {
    return this.emit(APPOINTMENT_EVENTS.CREATED, payload.new);
  }

  private handleUpdate(payload: RealtimePostgresUpdatePayload<TablesUpdate<"Appointments">>) {
    return this.emit(APPOINTMENT_EVENTS.UPDATED, payload.old, payload.new);
  }

  public cleanup(): void {
    this.channel.unsubscribe();
  }

}