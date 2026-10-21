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
      bases: {
        Row: {
          active: boolean
          code: string
          id: string
          name: string
          note: string
          photo_path: string | null
          sort: number
        }
        Insert: {
          active?: boolean
          code: string
          id: string
          name: string
          note: string
          photo_path?: string | null
          sort?: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          name?: string
          note?: string
          photo_path?: string | null
          sort?: number
        }
        Relationships: []
      }
      lead_events: {
        Row: {
          at: string
          detail: Json | null
          id: number
          lead_id: string
          ok: boolean
          type: string
        }
        Insert: {
          at?: string
          detail?: Json | null
          id?: never
          lead_id: string
          ok: boolean
          type: string
        }
        Update: {
          at?: string
          detail?: Json | null
          id?: never
          lead_id?: string
          ok?: boolean
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_files: {
        Row: {
          id: string
          lead_id: string
          mime: string
          path: string
          size_bytes: number
        }
        Insert: {
          id?: string
          lead_id: string
          mime: string
          path: string
          size_bytes: number
        }
        Update: {
          id?: string
          lead_id?: string
          mime?: string
          path?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_files_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          city: string | null
          config: Json | null
          config_code: string | null
          consent_at: string
          consent_text: string
          created_at: string
          email: string
          id: string
          ip_hash: string | null
          kind: Database["public"]["Enums"]["lead_kind"]
          mattress_size: string | null
          message: string | null
          name: string
          notes: string | null
          phone: string
          price_estimate_ron: number | null
          sample_material_ids: string[] | null
          source: Json | null
          status: Database["public"]["Enums"]["lead_status"]
          wants_measurement: boolean
        }
        Insert: {
          address?: string | null
          city?: string | null
          config?: Json | null
          config_code?: string | null
          consent_at?: string
          consent_text: string
          created_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          kind: Database["public"]["Enums"]["lead_kind"]
          mattress_size?: string | null
          message?: string | null
          name: string
          notes?: string | null
          phone: string
          price_estimate_ron?: number | null
          sample_material_ids?: string[] | null
          source?: Json | null
          status?: Database["public"]["Enums"]["lead_status"]
          wants_measurement?: boolean
        }
        Update: {
          address?: string | null
          city?: string | null
          config?: Json | null
          config_code?: string | null
          consent_at?: string
          consent_text?: string
          created_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          kind?: Database["public"]["Enums"]["lead_kind"]
          mattress_size?: string | null
          message?: string | null
          name?: string
          notes?: string | null
          phone?: string
          price_estimate_ron?: number | null
          sample_material_ids?: string[] | null
          source?: Json | null
          status?: Database["public"]["Enums"]["lead_status"]
          wants_measurement?: boolean
        }
        Relationships: []
      }
      material_families: {
        Row: {
          code: string
          description: string | null
          id: string
          name: string
          sort: number
          specs: Json
          tab: string
        }
        Insert: {
          code: string
          description?: string | null
          id: string
          name: string
          sort?: number
          specs?: Json
          tab?: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
          name?: string
          sort?: number
          specs?: Json
          tab?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          active: boolean
          code: string
          family_id: string
          featured: boolean
          hex: string
          id: string
          macro_path: string | null
          name: string
          photo_path: string | null
          price_category: string
          sort: number
          supplier: string | null
          supplier_code: string | null
        }
        Insert: {
          active?: boolean
          code: string
          family_id: string
          featured?: boolean
          hex: string
          id: string
          macro_path?: string | null
          name: string
          photo_path?: string | null
          price_category?: string
          sort?: number
          supplier?: string | null
          supplier_code?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          family_id?: string
          featured?: boolean
          hex?: string
          id?: string
          macro_path?: string | null
          name?: string
          photo_path?: string | null
          price_category?: string
          sort?: number
          supplier?: string | null
          supplier_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
        ]
      }
      model_families: {
        Row: {
          family_id: string
          model_id: string
        }
        Insert: {
          family_id: string
          model_id: string
        }
        Update: {
          family_id?: string
          model_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_families_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_families_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          active: boolean
          code: string
          description: string | null
          id: string
          name: string
          note: string
          sort: number
        }
        Insert: {
          active?: boolean
          code: string
          description?: string | null
          id: string
          name: string
          note: string
          sort?: number
        }
        Update: {
          active?: boolean
          code?: string
          description?: string | null
          id?: string
          name?: string
          note?: string
          sort?: number
        }
        Relationships: []
      }
      pricing: {
        Row: {
          data: Json
          id: number
          updated_at: string
        }
        Insert: {
          data: Json
          id?: number
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      project_photos: {
        Row: {
          alt: string
          height: number | null
          id: string
          path: string
          project_id: string
          sort: number
          width: number | null
        }
        Insert: {
          alt: string
          height?: number | null
          id?: string
          path: string
          project_id: string
          sort?: number
          width?: number | null
        }
        Update: {
          alt?: string
          height?: number | null
          id?: string
          path?: string
          project_id?: string
          sort?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          base_id: string | null
          city: string | null
          client_consent: boolean
          config: Json | null
          delivered_on: string | null
          extras: string[]
          featured: boolean
          hero: boolean
          id: string
          length_cm: number | null
          material_id: string | null
          model_id: string | null
          published: boolean
          slug: string
          sort: number
          ticket_no: string | null
          title: string
          width_cm: number | null
        }
        Insert: {
          base_id?: string | null
          city?: string | null
          client_consent?: boolean
          config?: Json | null
          delivered_on?: string | null
          extras?: string[]
          featured?: boolean
          hero?: boolean
          id?: string
          length_cm?: number | null
          material_id?: string | null
          model_id?: string | null
          published?: boolean
          slug: string
          sort?: number
          ticket_no?: string | null
          title: string
          width_cm?: number | null
        }
        Update: {
          base_id?: string | null
          city?: string | null
          client_consent?: boolean
          config?: Json | null
          delivered_on?: string | null
          extras?: string[]
          featured?: boolean
          hero?: boolean
          id?: string
          length_cm?: number | null
          material_id?: string | null
          model_id?: string | null
          published?: boolean
          slug?: string
          sort?: number
          ticket_no?: string | null
          title?: string
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string
          city: string | null
          consent: boolean
          first_name: string
          id: string
          model_label: string | null
          published: boolean
          sort: number
          source: string | null
        }
        Insert: {
          body: string
          city?: string | null
          consent?: boolean
          first_name: string
          id?: string
          model_label?: string | null
          published?: boolean
          sort?: number
          source?: string | null
        }
        Update: {
          body?: string
          city?: string | null
          consent?: boolean
          first_name?: string
          id?: string
          model_label?: string | null
          published?: boolean
          sort?: number
          source?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          data: Json
          id: number
        }
        Insert: {
          data: Json
          id?: number
        }
        Update: {
          data?: Json
          id?: number
        }
        Relationships: []
      }
      upload_requests: {
        Row: {
          created_at: string
          id: number
          ip_hash: string
        }
        Insert: {
          created_at?: string
          id?: never
          ip_hash: string
        }
        Update: {
          created_at?: string
          id?: never
          ip_hash?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      lead_kind: "contact" | "configurator" | "mostre"
      lead_status:
        | "nou"
        | "contactat"
        | "ofertat"
        | "castigat"
        | "pierdut"
        | "spam"
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
      lead_kind: ["contact", "configurator", "mostre"],
      lead_status: [
        "nou",
        "contactat",
        "ofertat",
        "castigat",
        "pierdut",
        "spam",
      ],
    },
  },
} as const
