/**
 * Supabase Database 타입 정의
 *
 * 이 파일은 database-schema.md를 기반으로 수동 생성되었습니다.
 * Supabase CLI로 자동 생성하려면: pnpm db:types
 *
 * 주의: DB 스키마가 변경되면 이 파일도 재생성해야 합니다.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      member: {
        Row: {
          id: string;
          full_name: string | null;
          gender: string | null;
          birthday: string | null;
          phone: string | null;
          email: string | null;
          bank_name: string | null;
          bank_account: string | null;
          avatar_url: string | null;
          status: string | null;
          kakao_user_id: string | null;
          google_user_id: string | null;
          joined_at: string | null;
          admin: boolean | null;
        };
        Insert: {
          id?: string;
          full_name?: string | null;
          gender?: string | null;
          birthday?: string | null;
          phone?: string | null;
          email?: string | null;
          bank_name?: string | null;
          bank_account?: string | null;
          avatar_url?: string | null;
          status?: string | null;
          kakao_user_id?: string | null;
          google_user_id?: string | null;
          joined_at?: string | null;
          admin?: boolean | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          gender?: string | null;
          birthday?: string | null;
          phone?: string | null;
          email?: string | null;
          bank_name?: string | null;
          bank_account?: string | null;
          avatar_url?: string | null;
          status?: string | null;
          kakao_user_id?: string | null;
          google_user_id?: string | null;
          joined_at?: string | null;
          admin?: boolean | null;
        };
        Relationships: [];
      };
      competition: {
        Row: {
          id: string;
          external_id: string | null;
          sport: string | null;
          title: string;
          start_date: string;
          end_date: string | null;
          location: string | null;
          event_types: string[] | null;
          source_url: string | null;
        };
        Insert: {
          id?: string;
          external_id?: string | null;
          sport?: string | null;
          title: string;
          start_date: string;
          end_date?: string | null;
          location?: string | null;
          event_types?: string[] | null;
          source_url?: string | null;
        };
        Update: {
          id?: string;
          external_id?: string | null;
          sport?: string | null;
          title?: string;
          start_date?: string;
          end_date?: string | null;
          location?: string | null;
          event_types?: string[] | null;
          source_url?: string | null;
        };
        Relationships: [];
      };
      competition_registration: {
        Row: {
          id: string;
          competition_id: string;
          member_id: string;
          role: string;
          event_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          member_id: string;
          role: string;
          event_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          member_id?: string;
          role?: string;
          event_type?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "competition_registration_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competition";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competition_registration_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "member";
            referencedColumns: ["id"];
          },
        ];
      };
      race_result: {
        Row: {
          id: string;
          member_id: string;
          event_type: string;
          record_time_sec: number;
          race_name: string;
          race_date: string;
          swim_time_sec: number | null;
          bike_time_sec: number | null;
          run_time_sec: number | null;
        };
        Insert: {
          id?: string;
          member_id: string;
          event_type: string;
          record_time_sec: number;
          race_name: string;
          race_date: string;
          swim_time_sec?: number | null;
          bike_time_sec?: number | null;
          run_time_sec?: number | null;
        };
        Update: {
          id?: string;
          member_id?: string;
          event_type?: string;
          record_time_sec?: number;
          race_name?: string;
          race_date?: string;
          swim_time_sec?: number | null;
          bike_time_sec?: number | null;
          run_time_sec?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "race_result_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "member";
            referencedColumns: ["id"];
          },
        ];
      };
      personal_best: {
        Row: {
          member_id: string;
          event_type: string;
          record_time_sec: number;
          race_name: string | null;
          race_date: string | null;
          updated_at: string | null;
        };
        Insert: {
          member_id: string;
          event_type: string;
          record_time_sec: number;
          race_name?: string | null;
          race_date?: string | null;
          updated_at?: string | null;
        };
        Update: {
          member_id?: string;
          event_type?: string;
          record_time_sec?: number;
          race_name?: string | null;
          race_date?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "personal_best_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "member";
            referencedColumns: ["id"];
          },
        ];
      };
      utmb_profile: {
        Row: {
          member_id: string;
          utmb_index: number | null;
          utmb_profile_url: string | null;
        };
        Insert: {
          member_id: string;
          utmb_index?: number | null;
          utmb_profile_url?: string | null;
        };
        Update: {
          member_id?: string;
          utmb_index?: number | null;
          utmb_profile_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "utmb_profile_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: true;
            referencedRelation: "member";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// 편의 타입 헬퍼
type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never;
