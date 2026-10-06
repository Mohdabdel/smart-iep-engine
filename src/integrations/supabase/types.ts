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
      profiles: {
        Row: {
          approval_status: string
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_cases: {
        Row: {
          approved_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          learner_name: string | null
          owner_key_hash: string
          report_json: Json | null
          report_schema_version: number
          report_sections: Json
          review_config: Json
          review_decision: string | null
          review_spec_version: string
          review_type: string
          source_file_name: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          learner_name?: string | null
          owner_key_hash: string
          report_json?: Json | null
          report_schema_version?: number
          report_sections?: Json
          review_config?: Json
          review_decision?: string | null
          review_spec_version?: string
          review_type: string
          source_file_name?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          learner_name?: string | null
          owner_key_hash?: string
          report_json?: Json | null
          report_schema_version?: number
          report_sections?: Json
          review_config?: Json
          review_decision?: string | null
          review_spec_version?: string
          review_type?: string
          source_file_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_parts: {
        Row: {
          attempts: number
          completed_at: string | null
          error_message: string | null
          id: string
          part_key: string
          result_json: Json | null
          review_case_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          error_message?: string | null
          id?: string
          part_key: string
          result_json?: Json | null
          review_case_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          error_message?: string | null
          id?: string
          part_key?: string
          result_json?: Json | null
          review_case_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_parts_review_case_id_fkey"
            columns: ["review_case_id"]
            isOneToOne: false
            referencedRelation: "review_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          learner_name: string | null
          note: string | null
          report_shared: boolean
          review_case_id: string | null
          share_requested: boolean
          status: string
          updated_at: string
          uploader_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          learner_name?: string | null
          note?: string | null
          report_shared?: boolean
          review_case_id?: string | null
          share_requested?: boolean
          status?: string
          updated_at?: string
          uploader_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          learner_name?: string | null
          note?: string | null
          report_shared?: boolean
          review_case_id?: string | null
          share_requested?: boolean
          status?: string
          updated_at?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_review_case_id_fkey"
            columns: ["review_case_id"]
            isOneToOne: false
            referencedRelation: "review_cases"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_shared_report: { Args: { _sub: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      request_report_share: { Args: { _sub: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "uploader"
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
      app_role: ["admin", "uploader"],
    },
  },
} as const
