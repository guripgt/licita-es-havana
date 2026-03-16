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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          cnpj: string
          created_at: string | null
          email: string | null
          id: string
          name: string
        }
        Insert: {
          cnpj: string
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
        }
        Update: {
          cnpj?: string
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      company_documents: {
        Row: {
          category: string | null
          company_id: string
          created_at: string | null
          expiry_date: string | null
          file_url: string | null
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string | null
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string | null
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      process_documents: {
        Row: {
          company_document_id: string
          created_at: string | null
          id: string
          saved_process_id: string
        }
        Insert: {
          company_document_id: string
          created_at?: string | null
          id?: string
          saved_process_id: string
        }
        Update: {
          company_document_id?: string
          created_at?: string | null
          id?: string
          saved_process_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_documents_company_document_id_fkey"
            columns: ["company_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_documents_saved_process_id_fkey"
            columns: ["saved_process_id"]
            isOneToOne: false
            referencedRelation: "saved_processes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          role: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          role?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      public_processes: {
        Row: {
          agency: string | null
          city: string | null
          closing_date: string | null
          created_at: string | null
          estimated_value: number | null
          external_id: string | null
          external_url: string | null
          government_level: string | null
          id: string
          is_srp: boolean | null
          modality: string | null
          object_description: string | null
          opening_date: string | null
          publication_date: string | null
          source: string | null
          source_portal: string | null
          state: string | null
          status: string | null
          title: string
        }
        Insert: {
          agency?: string | null
          city?: string | null
          closing_date?: string | null
          created_at?: string | null
          estimated_value?: number | null
          external_id?: string | null
          external_url?: string | null
          government_level?: string | null
          id?: string
          is_srp?: boolean | null
          modality?: string | null
          object_description?: string | null
          opening_date?: string | null
          publication_date?: string | null
          source?: string | null
          source_portal?: string | null
          state?: string | null
          status?: string | null
          title: string
        }
        Update: {
          agency?: string | null
          city?: string | null
          closing_date?: string | null
          created_at?: string | null
          estimated_value?: number | null
          external_id?: string | null
          external_url?: string | null
          government_level?: string | null
          id?: string
          is_srp?: boolean | null
          modality?: string | null
          object_description?: string | null
          opening_date?: string | null
          publication_date?: string | null
          source?: string | null
          source_portal?: string | null
          state?: string | null
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      saved_processes: {
        Row: {
          company_id: string
          created_at: string | null
          funnel_stage: string | null
          id: string
          is_favorite: boolean | null
          notes: string | null
          public_process_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          funnel_stage?: string | null
          id?: string
          is_favorite?: boolean | null
          notes?: string | null
          public_process_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          funnel_stage?: string | null
          id?: string
          is_favorite?: boolean | null
          notes?: string | null
          public_process_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_processes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_processes_public_process_id_fkey"
            columns: ["public_process_id"]
            isOneToOne: false
            referencedRelation: "public_processes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
