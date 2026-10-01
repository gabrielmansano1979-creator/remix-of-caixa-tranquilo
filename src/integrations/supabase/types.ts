export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      entries: {
        Row: {
          amount_cents: number
          counterparty_email: string | null
          counterparty_name: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          paid_at: string | null
          reminders_muted: boolean
          status: Database["public"]["Enums"]["entry_status"]
          type: Database["public"]["Enums"]["entry_type"]
          user_id: string
        }
        Insert: {
          amount_cents: number
          counterparty_email?: string | null
          counterparty_name?: string | null
          created_at?: string
          description: string
          due_date: string
          id?: string
          paid_at?: string | null
          reminders_muted?: boolean
          status?: Database["public"]["Enums"]["entry_status"]
          type: Database["public"]["Enums"]["entry_type"]
          user_id?: string
        }
        Update: {
          amount_cents?: number
          counterparty_email?: string | null
          counterparty_name?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          reminders_muted?: boolean
          status?: Database["public"]["Enums"]["entry_status"]
          type?: Database["public"]["Enums"]["entry_type"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance_date: string
          business_name: string | null
          created_at: string
          cushion_cents: number
          initial_balance_cents: number
          onboarding_done: boolean
          reminders_enabled: boolean
          reply_to_email: string | null
          trial_ends_at: string
          user_id: string
        }
        Insert: {
          balance_date?: string
          business_name?: string | null
          created_at?: string
          cushion_cents?: number
          initial_balance_cents?: number
          onboarding_done?: boolean
          reminders_enabled?: boolean
          reply_to_email?: string | null
          trial_ends_at?: string
          user_id: string
        }
        Update: {
          balance_date?: string
          business_name?: string | null
          created_at?: string
          cushion_cents?: number
          initial_balance_cents?: number
          onboarding_done?: boolean
          reminders_enabled?: boolean
          reply_to_email?: string | null
          trial_ends_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminder_logs: {
        Row: {
          entry_id: string
          error: string | null
          id: string
          provider_id: string | null
          rule_id: string
          sent_at: string
          sent_to: string
          status: Database["public"]["Enums"]["reminder_status"]
          user_id: string
        }
        Insert: {
          entry_id: string
          error?: string | null
          id?: string
          provider_id?: string | null
          rule_id: string
          sent_at?: string
          sent_to: string
          status: Database["public"]["Enums"]["reminder_status"]
          user_id: string
        }
        Update: {
          entry_id?: string
          error?: string | null
          id?: string
          provider_id?: string | null
          rule_id?: string
          sent_at?: string
          sent_to?: string
          status?: Database["public"]["Enums"]["reminder_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_logs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "reminder_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_rules: {
        Row: {
          active: boolean
          body_tpl: string
          created_at: string
          id: string
          label: string
          offset_days: number
          subject_tpl: string
          user_id: string
        }
        Insert: {
          active?: boolean
          body_tpl: string
          created_at?: string
          id?: string
          label: string
          offset_days: number
          subject_tpl: string
          user_id?: string
        }
        Update: {
          active?: boolean
          body_tpl?: string
          created_at?: string
          id?: string
          label?: string
          offset_days?: number
          subject_tpl?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end: boolean
          current_period_end: string | null
          plan: Database["public"]["Enums"]["plan_tier"] | null
          status: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"] | null
          status?: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"] | null
          status?: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      unsubscribed_emails: {
        Row: {
          created_at: string
          email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_user_setup: { Args: never; Returns: undefined }
      get_access: { Args: { _user_id: string }; Returns: Json }
      import_entries: { Args: { _rows: Json }; Returns: number }
      my_access: { Args: never; Returns: Json }
      plan_limits: {
        Args: { _plan: Database["public"]["Enums"]["plan_tier"] }
        Returns: Json
      }
    }
    Enums: {
      billing_interval: "month" | "year"
      entry_status: "pending" | "paid"
      entry_type: "income" | "expense"
      plan_tier: "starter" | "pro" | "business"
      reminder_status: "sent" | "failed" | "bounced"
      sub_status: "trialing" | "active" | "past_due" | "canceled" | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      billing_interval: ["month", "year"],
      entry_status: ["pending", "paid"],
      entry_type: ["income", "expense"],
      plan_tier: ["starter", "pro", "business"],
      reminder_status: ["sent", "failed", "bounced"],
      sub_status: ["trialing", "active", "past_due", "canceled", "expired"],
    },
  },
} as const
