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
      accountant_access: {
        Row: {
          client_user_id: string
          granted_at: string
          partner_id: string
        }
        Insert: {
          client_user_id: string
          granted_at?: string
          partner_id: string
        }
        Update: {
          client_user_id?: string
          granted_at?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountant_access_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "accountant_access_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      accountant_invites: {
        Row: {
          accountant_email: string
          created_at: string
          id: string
          owner_user_id: string
          status: string
        }
        Insert: {
          accountant_email: string
          created_at?: string
          id?: string
          owner_user_id: string
          status?: string
        }
        Update: {
          accountant_email?: string
          created_at?: string
          id?: string
          owner_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountant_invites_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      app_feedback: {
        Row: {
          comment: string | null
          created_at: string
          dismissed: boolean
          id: string
          rating: number | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          dismissed?: boolean
          id?: string
          rating?: number | null
          user_id?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          dismissed?: boolean
          id?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: []
      }
      asaas_events: {
        Row: {
          id: string
          processed_at: string
          type: string | null
        }
        Insert: {
          id: string
          processed_at?: string
          type?: string | null
        }
        Update: {
          id?: string
          processed_at?: string
          type?: string | null
        }
        Relationships: []
      }
      asaas_processed_payments: {
        Row: {
          created_at: string
          last_error: string | null
          payment_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_error?: string | null
          payment_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_error?: string | null
          payment_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          meta: Json
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          meta?: Json
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          meta?: Json
          user_id?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          amount: number
          amount_cents: number
          client_email: string | null
          client_name: string | null
          commission_percent: number | null
          created_at: string
          id: string
          paid_at: string | null
          partner_id: string
          payment_amount_cents: number | null
          payment_id: string | null
          receipt_url: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          amount?: number
          amount_cents?: number
          client_email?: string | null
          client_name?: string | null
          commission_percent?: number | null
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id: string
          payment_amount_cents?: number | null
          payment_id?: string | null
          receipt_url?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          amount_cents?: number
          client_email?: string | null
          client_name?: string | null
          commission_percent?: number | null
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id?: string
          payment_amount_cents?: number | null
          payment_id?: string | null
          receipt_url?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          commission_percent: number
          created_at: string
          discount_percent: number
          id: string
          is_active: boolean
          partner_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          commission_percent?: number
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          partner_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          commission_percent?: number
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          partner_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partner_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          amount_cents: number
          counterparty_email: string | null
          counterparty_name: string | null
          counterparty_whatsapp: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          paid_at: string | null
          pix_url: string | null
          reminders_muted: boolean
          status: Database["public"]["Enums"]["entry_status"]
          type: Database["public"]["Enums"]["entry_type"]
          user_id: string
        }
        Insert: {
          amount_cents: number
          counterparty_email?: string | null
          counterparty_name?: string | null
          counterparty_whatsapp?: string | null
          created_at?: string
          description: string
          due_date: string
          id?: string
          paid_at?: string | null
          pix_url?: string | null
          reminders_muted?: boolean
          status?: Database["public"]["Enums"]["entry_status"]
          type: Database["public"]["Enums"]["entry_type"]
          user_id?: string
        }
        Update: {
          amount_cents?: number
          counterparty_email?: string | null
          counterparty_name?: string | null
          counterparty_whatsapp?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          pix_url?: string | null
          reminders_muted?: boolean
          status?: Database["public"]["Enums"]["entry_status"]
          type?: Database["public"]["Enums"]["entry_type"]
          user_id?: string
        }
        Relationships: []
      }
      partner_requests: {
        Row: {
          crc_number: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          pix_key: string | null
          pix_type: string | null
          status: string
          tax_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          crc_number: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          pix_key?: string | null
          pix_type?: string | null
          status?: string
          tax_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          crc_number?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          pix_key?: string | null
          pix_type?: string | null
          status?: string
          tax_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pending_billing_changes: {
        Row: {
          affiliate_commission_percent: number | null
          affiliate_coupon_code: string | null
          affiliate_discount_percent: number | null
          affiliate_partner_id: string | null
          billing_interval: string
          checkout_reference: string
          created_at: string
          customer_id: string
          initial_amount_cents: number
          paid_at: string | null
          payment_id: string | null
          plan: string
          previous_asaas_subscription_id: string | null
          recurring_amount_cents: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_commission_percent?: number | null
          affiliate_coupon_code?: string | null
          affiliate_discount_percent?: number | null
          affiliate_partner_id?: string | null
          billing_interval: string
          checkout_reference: string
          created_at?: string
          customer_id: string
          initial_amount_cents: number
          paid_at?: string | null
          payment_id?: string | null
          plan: string
          previous_asaas_subscription_id?: string | null
          recurring_amount_cents: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_commission_percent?: number | null
          affiliate_coupon_code?: string | null
          affiliate_discount_percent?: number | null
          affiliate_partner_id?: string | null
          billing_interval?: string
          checkout_reference?: string
          created_at?: string
          customer_id?: string
          initial_amount_cents?: number
          paid_at?: string | null
          payment_id?: string | null
          plan?: string
          previous_asaas_subscription_id?: string | null
          recurring_amount_cents?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance_date: string
          business_name: string | null
          business_size: string | null
          created_at: string
          cushion_cents: number
          email: string | null
          full_name: string | null
          initial_balance_cents: number
          notification_whatsapp: string | null
          notify_product_emails: boolean
          onboarding_done: boolean
          reminders_enabled: boolean
          reply_to_email: string | null
          trial_end_sent: boolean
          trial_ends_at: string
          trial_warn_sent: boolean
          user_id: string
          welcome_sent: boolean
        }
        Insert: {
          balance_date?: string
          business_name?: string | null
          business_size?: string | null
          created_at?: string
          cushion_cents?: number
          email?: string | null
          full_name?: string | null
          initial_balance_cents?: number
          notification_whatsapp?: string | null
          notify_product_emails?: boolean
          onboarding_done?: boolean
          reminders_enabled?: boolean
          reply_to_email?: string | null
          trial_end_sent?: boolean
          trial_ends_at?: string
          trial_warn_sent?: boolean
          user_id: string
          welcome_sent?: boolean
        }
        Update: {
          balance_date?: string
          business_name?: string | null
          created_at?: string
          cushion_cents?: number
          email?: string | null
          full_name?: string | null
          initial_balance_cents?: number
          notification_whatsapp?: string | null
          notify_product_emails?: boolean
          onboarding_done?: boolean
          reminders_enabled?: boolean
          reply_to_email?: string | null
          trial_end_sent?: boolean
          trial_ends_at?: string
          trial_warn_sent?: boolean
          user_id?: string
          welcome_sent?: boolean
        }
        Relationships: []
      }
      reminder_logs: {
        Row: {
          channel: string
          delivery_status: string | null
          delivery_status_at: string | null
          entry_id: string
          error: string | null
          id: string
          manual: boolean
          provider_id: string | null
          rule_id: string | null
          sent_at: string
          sent_to: string
          stage_rule_id: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          user_id: string
        }
        Insert: {
          channel?: string
          delivery_status?: string | null
          delivery_status_at?: string | null
          entry_id: string
          error?: string | null
          id?: string
          manual?: boolean
          provider_id?: string | null
          rule_id?: string | null
          sent_at?: string
          sent_to: string
          stage_rule_id?: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          user_id: string
        }
        Update: {
          channel?: string
          delivery_status?: string | null
          delivery_status_at?: string | null
          entry_id?: string
          error?: string | null
          id?: string
          manual?: boolean
          provider_id?: string | null
          rule_id?: string | null
          sent_at?: string
          sent_to?: string
          stage_rule_id?: string | null
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
          {
            foreignKeyName: "reminder_logs_stage_rule_id_fkey"
            columns: ["stage_rule_id"]
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
          channel: string
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
          channel?: string
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
          channel?: string
          created_at?: string
          id?: string
          label?: string
          offset_days?: number
          subject_tpl?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          affiliate_commission_percent: number | null
          affiliate_coupon_code: string | null
          affiliate_discount_percent: number | null
          affiliate_partner_id: string | null
          affiliate_payment_amount_cents: number | null
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          asaas_subscription_id: string | null
          billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end: boolean
          current_period_end: string | null
          id: string
          paid_at: string | null
          plan: Database["public"]["Enums"]["plan_tier"] | null
          status: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_commission_percent?: number | null
          affiliate_coupon_code?: string | null
          affiliate_discount_percent?: number | null
          affiliate_partner_id?: string | null
          affiliate_payment_amount_cents?: number | null
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          asaas_subscription_id?: string | null
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          id?: string
          paid_at?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"] | null
          status?: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_commission_percent?: number | null
          affiliate_coupon_code?: string | null
          affiliate_discount_percent?: number | null
          affiliate_partner_id?: string | null
          affiliate_payment_amount_cents?: number | null
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          asaas_subscription_id?: string | null
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          id?: string
          paid_at?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"] | null
          status?: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_affiliate_partner_id_fkey"
            columns: ["affiliate_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_requests"
            referencedColumns: ["id"]
          },
        ]
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
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      partner_application_documents: {
        Row: {
          address_document_path: string
          city: string
          crc_document_path: string
          created_at: string
          identity_document_path: string
          office_name: string | null
          phone: string
          state: string
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_document_path: string
          city: string
          crc_document_path: string
          created_at?: string
          identity_document_path: string
          office_name?: string | null
          phone: string
          state: string
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_document_path?: string
          city?: string
          crc_document_path?: string
          created_at?: string
          identity_document_path?: string
          office_name?: string | null
          phone?: string
          state?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          delivery_id: string
          event: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          delivery_id: string
          event: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          delivery_id?: string
          event?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_mark_commission_paid: {
        Args: { _commission_id: string }
        Returns: undefined
      }
      admin_partner_overview: { Args: never; Returns: Json }
      admin_set_partner_status: {
        Args: { _partner_id: string; _status: string }
        Returns: undefined
      }
      admin_update_partner_rate: {
        Args: { _partner_id: string; _percent: number }
        Returns: undefined
      }
      cash_projection: { Args: { _days?: number }; Returns: Json }
      ensure_user_setup: { Args: never; Returns: undefined }
      get_access: { Args: { _user_id: string }; Returns: Json }
      grant_accountant_access: {
        Args: { _coupon_code: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_entries: { Args: { _rows: Json }; Returns: number }
      my_access: { Args: never; Returns: Json }
      my_accountant_access: { Args: never; Returns: Json }
      my_partner_status: { Args: never; Returns: Json }
      my_usage: { Args: never; Returns: Json }
      partner_dashboard: { Args: never; Returns: Json }
      plan_limits: {
        Args: { _plan: Database["public"]["Enums"]["plan_tier"] }
        Returns: Json
      }
      revoke_accountant_access: { Args: never; Returns: undefined }
      submit_partner_request: {
        Args: {
          _crc_number: string
          _full_name: string
          _pix_key?: string | null
          _pix_type?: string | null
          _tax_id: string
        }
        Returns: undefined
      },
      update_partner_payout: {
        Args: { _pix_key: string; _pix_type: string }
        Returns: undefined
      },
      top_risks: {
        Args: { _limit?: number }
        Returns: {
          amount_cents: number
          counterparty_email: string
          counterparty_name: string
          counterparty_whatsapp: string
          description: string
          due_date: string
          entry_id: string
          level: string
          reason: string
          score: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      billing_interval: "month" | "year"
      entry_status: "pending" | "paid"
      entry_type: "income" | "expense"
      plan_tier: "starter" | "pro" | "business"
      reminder_status: "sent" | "failed" | "bounced"
      sub_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
        | "pending_pix"
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
      app_role: ["admin", "moderator", "user"],
      billing_interval: ["month", "year"],
      entry_status: ["pending", "paid"],
      entry_type: ["income", "expense"],
      plan_tier: ["starter", "pro", "business"],
      reminder_status: ["sent", "failed", "bounced"],
      sub_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired",
        "pending_pix",
      ],
    },
  },
} as const
