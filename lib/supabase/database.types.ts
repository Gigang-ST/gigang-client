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
      competition: {
        Row: {
          created_at: string
          end_date: string | null
          event_types: string[] | null
          external_id: string | null
          id: string
          location: string | null
          raw: Json | null
          source_url: string | null
          sport: string | null
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          event_types?: string[] | null
          external_id?: string | null
          id?: string
          location?: string | null
          raw?: Json | null
          source_url?: string | null
          sport?: string | null
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          event_types?: string[] | null
          external_id?: string | null
          id?: string
          location?: string | null
          raw?: Json | null
          source_url?: string | null
          sport?: string | null
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      competition_registration: {
        Row: {
          competition_id: string
          created_at: string
          event_type: string | null
          id: string
          member_id: string
          role: Database["public"]["Enums"]["participation_role"]
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          event_type?: string | null
          id?: string
          member_id: string
          role: Database["public"]["Enums"]["participation_role"]
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          event_type?: string | null
          id?: string
          member_id?: string
          role?: Database["public"]["Enums"]["participation_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_registration_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_registration_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member"
            referencedColumns: ["id"]
          },
        ]
      }
      mem_mst: {
        Row: {
          avatar_url: string | null
          bank_acct_no: string | null
          bank_nm: string | null
          birth_dt: string | null
          crt_at: string
          del_yn: boolean
          email_addr: string | null
          gdr_enm: Database["public"]["Enums"]["gender"] | null
          mem_id: string
          mem_nm: string
          oauth_google_id: string | null
          oauth_kakao_id: string | null
          phone_no: string | null
          upd_at: string
          vers: number
        }
        Insert: {
          avatar_url?: string | null
          bank_acct_no?: string | null
          bank_nm?: string | null
          birth_dt?: string | null
          crt_at?: string
          del_yn?: boolean
          email_addr?: string | null
          gdr_enm?: Database["public"]["Enums"]["gender"] | null
          mem_id: string
          mem_nm: string
          oauth_google_id?: string | null
          oauth_kakao_id?: string | null
          phone_no?: string | null
          upd_at?: string
          vers?: number
        }
        Update: {
          avatar_url?: string | null
          bank_acct_no?: string | null
          bank_nm?: string | null
          birth_dt?: string | null
          crt_at?: string
          del_yn?: boolean
          email_addr?: string | null
          gdr_enm?: Database["public"]["Enums"]["gender"] | null
          mem_id?: string
          mem_nm?: string
          oauth_google_id?: string | null
          oauth_kakao_id?: string | null
          phone_no?: string | null
          upd_at?: string
          vers?: number
        }
        Relationships: []
      }
      mem_utmb_prf: {
        Row: {
          crt_at: string
          del_yn: boolean
          mem_id: string
          rct_race_nm: string | null
          rct_race_rec: string | null
          upd_at: string
          utmb_idx: number
          utmb_prf_id: string
          utmb_prf_url: string
          vers: number
        }
        Insert: {
          crt_at?: string
          del_yn?: boolean
          mem_id: string
          rct_race_nm?: string | null
          rct_race_rec?: string | null
          upd_at?: string
          utmb_idx: number
          utmb_prf_id?: string
          utmb_prf_url: string
          vers?: number
        }
        Update: {
          crt_at?: string
          del_yn?: boolean
          mem_id?: string
          rct_race_nm?: string | null
          rct_race_rec?: string | null
          utmb_idx?: number
          utmb_prf_id?: string
          utmb_prf_url?: string
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_mem_utmb_prf__mem_mst"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
        ]
      }
      team_mst: {
        Row: {
          crt_at: string
          del_yn: boolean
          team_cd: string
          team_id: string
          team_nm: string
          upd_at: string
          vers: number
        }
        Insert: {
          crt_at?: string
          del_yn?: boolean
          team_cd: string
          team_id?: string
          team_nm: string
          upd_at?: string
          vers?: number
        }
        Update: {
          crt_at?: string
          del_yn?: boolean
          team_cd?: string
          team_id?: string
          team_nm?: string
          upd_at?: string
          vers?: number
        }
        Relationships: []
      }
      team_mem_rel: {
        Row: {
          crt_at: string
          del_yn: boolean
          join_dt: string | null
          leave_dt: string | null
          mem_id: string
          mem_st_cd: string
          team_id: string
          team_mem_id: string
          team_role_cd: string
          upd_at: string
          vers: number
        }
        Insert: {
          crt_at?: string
          del_yn?: boolean
          join_dt?: string | null
          leave_dt?: string | null
          mem_id: string
          mem_st_cd: string
          team_id: string
          team_mem_id?: string
          team_role_cd: string
          upd_at?: string
          vers?: number
        }
        Update: {
          crt_at?: string
          del_yn?: boolean
          join_dt?: string | null
          leave_dt?: string | null
          mem_id?: string
          mem_st_cd?: string
          team_id?: string
          team_mem_id?: string
          team_role_cd?: string
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_team_mem_rel__mem_mst"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_team_mem_rel__team_mst"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
          },
        ]
      }
      member: {
        Row: {
          admin: boolean
          avatar_url: string | null
          bank_account: string | null
          bank_name: string | null
          birthday: string
          created_at: string
          email: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender"]
          google_user_id: string | null
          id: string
          joined_at: string
          kakao_user_id: string | null
          phone: string
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
        }
        Insert: {
          admin?: boolean
          avatar_url?: string | null
          bank_account?: string | null
          bank_name?: string | null
          birthday: string
          created_at?: string
          email?: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender"]
          google_user_id?: string | null
          id?: string
          joined_at: string
          kakao_user_id?: string | null
          phone: string
          status: Database["public"]["Enums"]["member_status"]
          updated_at?: string
        }
        Update: {
          admin?: boolean
          avatar_url?: string | null
          bank_account?: string | null
          bank_name?: string | null
          birthday?: string
          created_at?: string
          email?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender"]
          google_user_id?: string | null
          id?: string
          joined_at?: string
          kakao_user_id?: string | null
          phone?: string
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
        }
        Relationships: []
      }
      personal_best: {
        Row: {
          created_at: string
          event_type: string
          id: string
          member_id: string
          race_date: string
          race_name: string
          record_time_sec: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          race_date: string
          race_name: string
          record_time_sec?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          race_date?: string
          race_name?: string
          record_time_sec?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_best_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member"
            referencedColumns: ["id"]
          },
        ]
      }
      race_result: {
        Row: {
          bike_time_sec: number | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          race_date: string
          race_name: string
          record_time_sec: number
          run_time_sec: number | null
          swim_time_sec: number | null
        }
        Insert: {
          bike_time_sec?: number | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          race_date: string
          race_name: string
          record_time_sec: number
          run_time_sec?: number | null
          swim_time_sec?: number | null
        }
        Update: {
          bike_time_sec?: number | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          race_date?: string
          race_name?: string
          record_time_sec?: number
          run_time_sec?: number | null
          swim_time_sec?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "race_result_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member"
            referencedColumns: ["id"]
          },
        ]
      }
      utmb_profile: {
        Row: {
          created_at: string
          id: string
          member_id: string
          recent_race_name: string | null
          recent_race_record: string | null
          updated_at: string
          utmb_index: number
          utmb_profile_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          recent_race_name?: string | null
          recent_race_record?: string | null
          updated_at?: string
          utmb_index: number
          utmb_profile_url: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          recent_race_name?: string | null
          recent_race_record?: string | null
          updated_at?: string
          utmb_index?: number
          utmb_profile_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "utmb_profile_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "member"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_team_member_stats: {
        Args: { p_team_id: string }
        Returns: {
          active_count: number
          total_count: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      gender: "male" | "female"
      member_status: "active" | "inactive" | "banned" | "pending"
      participation_role: "participant" | "cheering" | "volunteer"
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
    Enums: {
      gender: ["male", "female"],
      member_status: ["active", "inactive", "banned", "pending"],
      participation_role: ["participant", "cheering", "volunteer"],
    },
  },
} as const
