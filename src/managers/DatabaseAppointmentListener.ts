import { EventEmitter } from "node:events";
import supabaseAdmin from "../lib/supabaseAdmin";
import type { RealtimeChannel, RealtimePostgresChangesPayload, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import type { Tables, TablesInsert, TablesUpdate } from "../../lib/supabase.types";
import never from "../utils/never";

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

          switch (payload.eventType) {
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

  private async handleInsert(payload: RealtimePostgresInsertPayload<TablesInsert<"Appointments">>) {
    const { data, error } = await supabaseAdmin.from("User")
      .select("*")
      .eq("user_id", payload.new.user_id)
      .single();

    if (!data || error) {
      if (error)
        throw error;

      throw new Error(`Could not find user ${payload.new.user_id}`);
    }

    const p = {
      ...payload.new,
      user: data
    }

    return this.emit(APPOINTMENT_EVENTS.CREATED, p);
  }

  private async handleUpdate(payload: RealtimePostgresUpdatePayload<TablesUpdate<"Appointments">>) {
    const { data, error } = await supabaseAdmin.from("User")
      .select("*")
      .eq("user_id", payload.new.user_id ?? never("User ID should exist in appointment payload"))
      .single();

    if (!data || error) {
      if (error)
        throw error;

      throw new Error(`Could not find user ${payload.new.user_id}`);
    }

    const pOld = {
      ...payload.old,
      user: data
    }
    const pNew = {
      ...payload.new,
      user: data
    }

    return this.emit(APPOINTMENT_EVENTS.UPDATED, pOld, pNew);
  }

  public cleanup(): void {
    this.channel.unsubscribe();
  }

}