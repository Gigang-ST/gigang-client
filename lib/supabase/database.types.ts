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
      cmm_cd_grp_mst: {
        Row: {
          cd_grp_cd: string
          cd_grp_id: string
          cd_grp_nm: string
          crt_at: string
          del_yn: boolean
          sort_ord: number
          upd_at: string
          use_yn: boolean
          vers: number
        }
        Insert: {
          cd_grp_cd: string
          cd_grp_id?: string
          cd_grp_nm: string
          crt_at?: string
          del_yn?: boolean
          sort_ord?: number
          upd_at?: string
          use_yn?: boolean
          vers?: number
        }
        Update: {
          cd_grp_cd?: string
          cd_grp_id?: string
          cd_grp_nm?: string
          crt_at?: string
          del_yn?: boolean
          sort_ord?: number
          upd_at?: string
          use_yn?: boolean
          vers?: number
        }
        Relationships: []
      }
      cmm_cd_mst: {
        Row: {
          cd: string
          cd_desc: string | null
          cd_grp_id: string
          cd_id: string
          cd_nm: string
          crt_at: string
          del_yn: boolean
          is_default_yn: boolean
          sort_ord: number
          upd_at: string
          use_yn: boolean
          vers: number
        }
        Insert: {
          cd: string
          cd_desc?: string | null
          cd_grp_id: string
          cd_id?: string
          cd_nm: string
          crt_at?: string
          del_yn?: boolean
          is_default_yn?: boolean
          sort_ord?: number
          upd_at?: string
          use_yn?: boolean
          vers?: number
        }
        Update: {
          cd?: string
          cd_desc?: string | null
          cd_grp_id?: string
          cd_id?: string
          cd_nm?: string
          crt_at?: string
          del_yn?: boolean
          is_default_yn?: boolean
          sort_ord?: number
          upd_at?: string
          use_yn?: boolean
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "cmm_cd_mst_cd_grp_id_fkey"
            columns: ["cd_grp_id"]
            isOneToOne: false
            referencedRelation: "cmm_cd_grp_mst"
            referencedColumns: ["cd_grp_id"]
          },
        ]
      }
      comp_evt_cfg: {
        Row: {
          comp_evt_id: string
          comp_evt_type: string
          comp_id: string
          crt_at: string
          del_yn: boolean
          upd_at: string
          vers: number
        }
        Insert: {
          comp_evt_id?: string
          comp_evt_type: string
          comp_id: string
          crt_at?: string
          del_yn?: boolean
          upd_at?: string
          vers?: number
        }
        Update: {
          comp_evt_id?: string
          comp_evt_type?: string
          comp_id?: string
          crt_at?: string
          del_yn?: boolean
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_comp_evt_cfg__comp_mst"
            columns: ["comp_id"]
            isOneToOne: false
            referencedRelation: "comp_mst"
            referencedColumns: ["comp_id"]
          },
        ]
      }
      comp_mst: {
        Row: {
          comp_id: string
          comp_nm: string
          comp_sprt_cd: string | null
          crt_at: string
          del_yn: boolean
          end_dt: string | null
          ext_id: string | null
          loc_nm: string | null
          src_url: string | null
          stt_dt: string
          upd_at: string
          vers: number
        }
        Insert: {
          comp_id?: string
          comp_nm: string
          comp_sprt_cd?: string | null
          crt_at?: string
          del_yn?: boolean
          end_dt?: string | null
          ext_id?: string | null
          loc_nm?: string | null
          src_url?: string | null
          stt_dt: string
          upd_at?: string
          vers?: number
        }
        Update: {
          comp_id?: string
          comp_nm?: string
          comp_sprt_cd?: string | null
          crt_at?: string
          del_yn?: boolean
          end_dt?: string | null
          ext_id?: string | null
          loc_nm?: string | null
          src_url?: string | null
          stt_dt?: string
          upd_at?: string
          vers?: number
        }
        Relationships: []
      }
      comp_reg_rel: {
        Row: {
          comp_evt_id: string | null
          comp_reg_id: string
          crt_at: string
          del_yn: boolean
          mem_id: string
          prt_role_cd: string
          team_comp_id: string
          upd_at: string
          vers: number
        }
        Insert: {
          comp_evt_id?: string | null
          comp_reg_id?: string
          crt_at?: string
          del_yn?: boolean
          mem_id: string
          prt_role_cd: string
          team_comp_id: string
          upd_at?: string
          vers?: number
        }
        Update: {
          comp_evt_id?: string | null
          comp_reg_id?: string
          crt_at?: string
          del_yn?: boolean
          mem_id?: string
          prt_role_cd?: string
          team_comp_id?: string
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_comp_reg_rel__comp_evt_cfg"
            columns: ["comp_evt_id"]
            isOneToOne: false
            referencedRelation: "comp_evt_cfg"
            referencedColumns: ["comp_evt_id"]
          },
          {
            foreignKeyName: "fk_comp_reg_rel__mem_mst"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_comp_reg_rel__team_comp"
            columns: ["team_comp_id"]
            isOneToOne: false
            referencedRelation: "team_comp_plan_rel"
            referencedColumns: ["team_comp_id"]
          },
        ]
      }
      evt_mlg_act_hist: {
        Row: {
          act_dt: string
          act_id: string
          applied_mults: Json | null
          base_mlg: number
          created_at: string
          distance_km: number
          elevation_m: number | null
          evt_id: string
          final_mlg: number
          mem_id: string
          prt_id: string
          review: string | null
          sprt_enm: string
          updated_at: string
        }
        Insert: {
          act_dt: string
          act_id?: string
          applied_mults?: Json | null
          base_mlg: number
          created_at?: string
          distance_km: number
          elevation_m?: number | null
          evt_id: string
          final_mlg: number
          mem_id: string
          prt_id: string
          review?: string | null
          sprt_enm: string
          updated_at?: string
        }
        Update: {
          act_dt?: string
          act_id?: string
          applied_mults?: Json | null
          base_mlg?: number
          created_at?: string
          distance_km?: number
          elevation_m?: number | null
          evt_id?: string
          final_mlg?: number
          mem_id?: string
          prt_id?: string
          review?: string | null
          sprt_enm?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_mlg_act_hist_evt_id_fkey"
            columns: ["evt_id"]
            isOneToOne: false
            referencedRelation: "evt_team_mst"
            referencedColumns: ["evt_id"]
          },
          {
            foreignKeyName: "evt_mlg_act_hist_mem_id_fkey"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "evt_mlg_act_hist_prt_id_fkey"
            columns: ["prt_id"]
            isOneToOne: false
            referencedRelation: "evt_team_prt_rel"
            referencedColumns: ["prt_id"]
          },
        ]
      }
      evt_mlg_goal_cfg: {
        Row: {
          achieved_yn: boolean
          created_at: string
          evt_id: string
          goal_id: string
          goal_mth: string
          goal_val: number
          mem_id: string
          prt_id: string
          updated_at: string
        }
        Insert: {
          achieved_yn?: boolean
          created_at?: string
          evt_id: string
          goal_id?: string
          goal_mth: string
          goal_val: number
          mem_id: string
          prt_id: string
          updated_at?: string
        }
        Update: {
          achieved_yn?: boolean
          created_at?: string
          evt_id?: string
          goal_id?: string
          goal_mth?: string
          goal_val?: number
          mem_id?: string
          prt_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_mlg_goal_cfg_evt_id_fkey"
            columns: ["evt_id"]
            isOneToOne: false
            referencedRelation: "evt_team_mst"
            referencedColumns: ["evt_id"]
          },
          {
            foreignKeyName: "evt_mlg_goal_cfg_mem_id_fkey"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "evt_mlg_goal_cfg_prt_id_fkey"
            columns: ["prt_id"]
            isOneToOne: false
            referencedRelation: "evt_team_prt_rel"
            referencedColumns: ["prt_id"]
          },
        ]
      }
      evt_mlg_mult_cfg: {
        Row: {
          active_yn: boolean
          created_at: string
          end_dt: string | null
          evt_id: string
          mult_id: string
          mult_nm: string
          mult_val: number
          stt_dt: string | null
          updated_at: string
        }
        Insert: {
          active_yn?: boolean
          created_at?: string
          end_dt?: string | null
          evt_id: string
          mult_id?: string
          mult_nm: string
          mult_val: number
          stt_dt?: string | null
          updated_at?: string
        }
        Update: {
          active_yn?: boolean
          created_at?: string
          end_dt?: string | null
          evt_id?: string
          mult_id?: string
          mult_nm?: string
          mult_val?: number
          stt_dt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_mlg_mult_cfg_evt_id_fkey"
            columns: ["evt_id"]
            isOneToOne: false
            referencedRelation: "evt_team_mst"
            referencedColumns: ["evt_id"]
          },
        ]
      }
      evt_team_mst: {
        Row: {
          created_at: string
          desc_txt: string | null
          end_dt: string
          evt_id: string
          evt_nm: string
          evt_type_cd: string
          stts_enm: string
          stt_dt: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          desc_txt?: string | null
          end_dt: string
          evt_id?: string
          evt_nm: string
          evt_type_cd: string
          stts_enm?: string
          stt_dt: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          desc_txt?: string | null
          end_dt?: string
          evt_id?: string
          evt_nm?: string
          evt_type_cd?: string
          stts_enm?: string
          stt_dt?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_team_mst_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
          },
        ]
      }
      evt_team_prt_rel: {
        Row: {
          aprv_at: string | null
          aprv_yn: boolean
          created_at: string
          deposit_amt: number
          entry_fee_amt: number
          evt_id: string
          has_singlet_yn: boolean
          init_goal: number
          mem_id: string
          prt_id: string
          singlet_fee_amt: number
          stt_mth: string
          updated_at: string
        }
        Insert: {
          aprv_at?: string | null
          aprv_yn?: boolean
          created_at?: string
          deposit_amt: number
          entry_fee_amt: number
          evt_id: string
          has_singlet_yn?: boolean
          init_goal: number
          mem_id: string
          prt_id?: string
          singlet_fee_amt?: number
          stt_mth: string
          updated_at?: string
        }
        Update: {
          aprv_at?: string | null
          aprv_yn?: boolean
          created_at?: string
          deposit_amt?: number
          entry_fee_amt?: number
          evt_id?: string
          has_singlet_yn?: boolean
          init_goal?: number
          mem_id?: string
          prt_id?: string
          singlet_fee_amt?: number
          stt_mth?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_team_prt_rel_evt_id_fkey"
            columns: ["evt_id"]
            isOneToOne: false
            referencedRelation: "evt_team_mst"
            referencedColumns: ["evt_id"]
          },
          {
            foreignKeyName: "evt_team_prt_rel_mem_id_fkey"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
        ]
      }
      fee_due_exm_cfg: {
        Row: {
          aply_end_dt: string
          aply_stt_dt: string
          crt_at: string
          del_yn: boolean
          exm_amt: number | null
          exm_cfg_id: string
          exm_tp_enm: Database["public"]["Enums"]["fee_exm_tp_enm"]
          mem_id: string
          reg_by_mem_id: string
          rsn_txt: string
          team_id: string
          upd_at: string
          vers: number
        }
        Insert: {
          aply_end_dt: string
          aply_stt_dt: string
          crt_at?: string
          del_yn?: boolean
          exm_amt?: number | null
          exm_cfg_id?: string
          exm_tp_enm: Database["public"]["Enums"]["fee_exm_tp_enm"]
          mem_id: string
          reg_by_mem_id: string
          rsn_txt: string
          team_id: string
          upd_at?: string
          vers?: number
        }
        Update: {
          aply_end_dt?: string
          aply_stt_dt?: string
          crt_at?: string
          del_yn?: boolean
          exm_amt?: number | null
          exm_cfg_id?: string
          exm_tp_enm?: Database["public"]["Enums"]["fee_exm_tp_enm"]
          mem_id?: string
          reg_by_mem_id?: string
          rsn_txt?: string
          team_id?: string
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_fee_due_exm_cfg__mem_mst"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_fee_due_exm_cfg__reg_mem_mst"
            columns: ["reg_by_mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_fee_due_exm_cfg__team_mst"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fee_due_exm_hist: {
        Row: {
          aply_ym: string
          aprv_at: string | null
          aprv_by_mem_id: string | null
          crt_at: string
          del_yn: boolean
          exm_amt: number
          exm_cfg_id: string | null
          exm_hist_id: string
          grant_src_enm: Database["public"]["Enums"]["fee_grant_src_enm"]
          mem_id: string
          rsn_txt: string | null
          team_id: string
          upd_at: string
          vers: number
        }
        Insert: {
          aply_ym: string
          aprv_at?: string | null
          aprv_by_mem_id?: string | null
          crt_at?: string
          del_yn?: boolean
          exm_amt: number
          exm_cfg_id?: string | null
          exm_hist_id?: string
          grant_src_enm: Database["public"]["Enums"]["fee_grant_src_enm"]
          mem_id: string
          rsn_txt?: string | null
          team_id: string
          upd_at?: string
          vers?: number
        }
        Update: {
          aply_ym?: string
          aprv_at?: string | null
          aprv_by_mem_id?: string | null
          crt_at?: string
          del_yn?: boolean
          exm_amt?: number
          exm_cfg_id?: string | null
          exm_hist_id?: string
          grant_src_enm?: Database["public"]["Enums"]["fee_grant_src_enm"]
          mem_id?: string
          rsn_txt?: string | null
          team_id?: string
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_fee_due_exm_hist__aprv_mem_mst"
            columns: ["aprv_by_mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_fee_due_exm_hist__exm_cfg"
            columns: ["exm_cfg_id"]
            isOneToOne: false
            referencedRelation: "fee_due_exm_cfg"
            referencedColumns: ["exm_cfg_id"]
          },
          {
            foreignKeyName: "fk_fee_due_exm_hist__mem_mst"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_fee_due_exm_hist__team_mst"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fee_due_pay_hist: {
        Row: {
          crt_at: string
          del_yn: boolean
          mem_id: string
          pay_amt: number
          pay_dt: string
          pay_id: string
          pay_st_cd: string
          src_txn_id: string | null
          team_id: string
          upd_at: string
          vers: number
        }
        Insert: {
          crt_at?: string
          del_yn?: boolean
          mem_id: string
          pay_amt: number
          pay_dt: string
          pay_id?: string
          pay_st_cd: string
          src_txn_id?: string | null
          team_id: string
          upd_at?: string
          vers?: number
        }
        Update: {
          crt_at?: string
          del_yn?: boolean
          mem_id?: string
          pay_amt?: number
          pay_dt?: string
          pay_id?: string
          pay_st_cd?: string
          src_txn_id?: string | null
          team_id?: string
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_fee_due_pay_hist__fee_txn_hist"
            columns: ["src_txn_id"]
            isOneToOne: false
            referencedRelation: "fee_txn_hist"
            referencedColumns: ["txn_id"]
          },
          {
            foreignKeyName: "fk_fee_due_pay_hist__mem_mst"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_fee_due_pay_hist__team_mst"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fee_mem_bal_snap: {
        Row: {
          bal_amt: number
          bal_snap_id: string
          crt_at: string
          del_yn: boolean
          last_calc_at: string
          last_calc_dt: string
          last_ref_exm_hist_id: string | null
          last_ref_pay_id: string | null
          mem_id: string
          team_id: string
          upd_at: string
          vers: number
        }
        Insert: {
          bal_amt: number
          bal_snap_id?: string
          crt_at?: string
          del_yn?: boolean
          last_calc_at: string
          last_calc_dt: string
          last_ref_exm_hist_id?: string | null
          last_ref_pay_id?: string | null
          mem_id: string
          team_id: string
          upd_at?: string
          vers?: number
        }
        Update: {
          bal_amt?: number
          bal_snap_id?: string
          crt_at?: string
          del_yn?: boolean
          last_calc_at?: string
          last_calc_dt?: string
          last_ref_exm_hist_id?: string | null
          last_ref_pay_id?: string | null
          mem_id?: string
          team_id?: string
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_fee_mem_bal_snap__exm_hist"
            columns: ["last_ref_exm_hist_id"]
            isOneToOne: false
            referencedRelation: "fee_due_exm_hist"
            referencedColumns: ["exm_hist_id"]
          },
          {
            foreignKeyName: "fk_fee_mem_bal_snap__mem_mst"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_fee_mem_bal_snap__pay"
            columns: ["last_ref_pay_id"]
            isOneToOne: false
            referencedRelation: "fee_due_pay_hist"
            referencedColumns: ["pay_id"]
          },
          {
            foreignKeyName: "fk_fee_mem_bal_snap__team_mst"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fee_policy_cfg: {
        Row: {
          aply_end_dt: string
          aply_stt_dt: string
          crt_at: string
          del_yn: boolean
          fee_policy_id: string
          monthly_fee_amt: number
          team_id: string
          upd_at: string
          vers: number
        }
        Insert: {
          aply_end_dt: string
          aply_stt_dt: string
          crt_at?: string
          del_yn?: boolean
          fee_policy_id?: string
          monthly_fee_amt: number
          team_id: string
          upd_at?: string
          vers?: number
        }
        Update: {
          aply_end_dt?: string
          aply_stt_dt?: string
          crt_at?: string
          del_yn?: boolean
          fee_policy_id?: string
          monthly_fee_amt?: number
          team_id?: string
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_fee_policy_cfg__team_mst"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fee_txn_hist: {
        Row: {
          adm_memo_txt: string | null
          cfm_at: string | null
          cfm_by_mem_id: string | null
          crt_at: string
          del_yn: boolean
          fee_item_cd: string | null
          is_cfm_yn: boolean
          match_st_cd: string
          mem_id: string | null
          raw_memo: string | null
          raw_name: string
          team_id: string
          txn_amt: number
          txn_dt: string
          txn_id: string
          txn_io_enm: Database["public"]["Enums"]["fee_txn_io_enm"]
          txn_tm: string | null
          txn_tp_txt: string
          upd_at: string
          upd_id: string
        }
        Insert: {
          adm_memo_txt?: string | null
          cfm_at?: string | null
          cfm_by_mem_id?: string | null
          crt_at?: string
          del_yn?: boolean
          fee_item_cd?: string | null
          is_cfm_yn?: boolean
          match_st_cd: string
          mem_id?: string | null
          raw_memo?: string | null
          raw_name: string
          team_id: string
          txn_amt: number
          txn_dt: string
          txn_id?: string
          txn_io_enm: Database["public"]["Enums"]["fee_txn_io_enm"]
          txn_tm?: string | null
          txn_tp_txt: string
          upd_at?: string
          upd_id: string
        }
        Update: {
          adm_memo_txt?: string | null
          cfm_at?: string | null
          cfm_by_mem_id?: string | null
          crt_at?: string
          del_yn?: boolean
          fee_item_cd?: string | null
          is_cfm_yn?: boolean
          match_st_cd?: string
          mem_id?: string | null
          raw_memo?: string | null
          raw_name?: string
          team_id?: string
          txn_amt?: number
          txn_dt?: string
          txn_id?: string
          txn_io_enm?: Database["public"]["Enums"]["fee_txn_io_enm"]
          txn_tm?: string | null
          txn_tp_txt?: string
          upd_at?: string
          upd_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_fee_txn_hist__cfm_mem_mst"
            columns: ["cfm_by_mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_fee_txn_hist__fee_xlsx_upd_hist"
            columns: ["upd_id"]
            isOneToOne: false
            referencedRelation: "fee_xlsx_upd_hist"
            referencedColumns: ["upd_id"]
          },
          {
            foreignKeyName: "fk_fee_txn_hist__mem_mst"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_fee_txn_hist__team_mst"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fee_xlsx_upd_hist: {
        Row: {
          crt_at: string
          del_yn: boolean
          file_hash: string
          file_nm: string
          team_id: string
          upd_at: string
          upd_by_mem_id: string
          upd_id: string
          upd_st_cd: string
          vers: number
        }
        Insert: {
          crt_at?: string
          del_yn?: boolean
          file_hash: string
          file_nm: string
          team_id: string
          upd_at?: string
          upd_by_mem_id: string
          upd_id?: string
          upd_st_cd: string
          vers?: number
        }
        Update: {
          crt_at?: string
          del_yn?: boolean
          file_hash?: string
          file_nm?: string
          team_id?: string
          upd_at?: string
          upd_by_mem_id?: string
          upd_id?: string
          upd_st_cd?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_fee_xlsx_upd_hist__mem_mst"
            columns: ["upd_by_mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
          {
            foreignKeyName: "fk_fee_xlsx_upd_hist__team_mst"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
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
          upd_at?: string
          utmb_idx?: number
          utmb_prf_id?: string
          utmb_prf_url?: string
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
      rec_race_hist: {
        Row: {
          bike_time_sec: number | null
          comp_evt_id: string
          comp_id: string
          crt_at: string
          del_yn: boolean
          mem_id: string
          race_dt: string
          race_nm: string
          race_result_id: string
          rec_src_cd: string | null
          rec_time_sec: number
          run_time_sec: number | null
          swim_time_sec: number | null
          upd_at: string
          vers: number
        }
        Insert: {
          bike_time_sec?: number | null
          comp_evt_id: string
          comp_id: string
          crt_at?: string
          del_yn?: boolean
          mem_id: string
          race_dt: string
          race_nm: string
          race_result_id?: string
          rec_src_cd?: string | null
          rec_time_sec: number
          run_time_sec?: number | null
          swim_time_sec?: number | null
          upd_at?: string
          vers?: number
        }
        Update: {
          bike_time_sec?: number | null
          comp_evt_id?: string
          comp_id?: string
          crt_at?: string
          del_yn?: boolean
          mem_id?: string
          race_dt?: string
          race_nm?: string
          race_result_id?: string
          rec_src_cd?: string | null
          rec_time_sec?: number
          run_time_sec?: number | null
          swim_time_sec?: number | null
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_rec_race_hist__comp_evt_cfg_pair"
            columns: ["comp_id", "comp_evt_id"]
            isOneToOne: false
            referencedRelation: "comp_evt_cfg"
            referencedColumns: ["comp_id", "comp_evt_id"]
          },
          {
            foreignKeyName: "fk_rec_race_hist__comp_mst"
            columns: ["comp_id"]
            isOneToOne: false
            referencedRelation: "comp_mst"
            referencedColumns: ["comp_id"]
          },
          {
            foreignKeyName: "fk_rec_race_hist__mem_mst"
            columns: ["mem_id"]
            isOneToOne: false
            referencedRelation: "mem_mst"
            referencedColumns: ["mem_id"]
          },
        ]
      }
      team_comp_plan_rel: {
        Row: {
          comp_id: string
          crt_at: string
          del_yn: boolean
          note_txt: string | null
          team_comp_id: string
          team_id: string
          upd_at: string
          vers: number
        }
        Insert: {
          comp_id: string
          crt_at?: string
          del_yn?: boolean
          note_txt?: string | null
          team_comp_id?: string
          team_id: string
          upd_at?: string
          vers?: number
        }
        Update: {
          comp_id?: string
          crt_at?: string
          del_yn?: boolean
          note_txt?: string | null
          team_comp_id?: string
          team_id?: string
          upd_at?: string
          vers?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_team_comp_plan_rel__comp_mst"
            columns: ["comp_id"]
            isOneToOne: false
            referencedRelation: "comp_mst"
            referencedColumns: ["comp_id"]
          },
          {
            foreignKeyName: "fk_team_comp_plan_rel__team_mst"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_mst"
            referencedColumns: ["team_id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_team_competitions: {
        Args: { p_end?: string; p_start?: string; p_team_id: string }
        Returns: {
          comp_evt_types: string[]
          comp_id: string
          comp_nm: string
          comp_sprt_cd: string
          end_dt: string
          ext_id: string
          loc_nm: string
          reg_count: number
          reg_evt_types: string[]
          src_url: string
          stt_dt: string
        }[]
      }
      get_public_team_comp_reg_display_counts: {
        Args: { p_comp_id: string; p_team_id: string }
        Returns: {
          cnt: number
          display_key: string
        }[]
      }
      get_public_team_member_stats: {
        Args: { p_team_id: string }
        Returns: {
          active_count: number
          total_count: number
        }[]
      }
      get_public_team_race_rankings: {
        Args: { p_team_id: string }
        Returns: {
          evt_cd: string
          gdr_enm: Database["public"]["Enums"]["gender"]
          mem_id: string
          mem_nm: string
          race_nm: string
          rec_time_sec: number
        }[]
      }
      get_public_team_recent_records: {
        Args: { p_limit?: number; p_team_id: string }
        Returns: {
          evt_cd: string
          mem_id: string
          mem_nm: string
          race_nm: string
          rec_time_sec: number
          upd_at: string
        }[]
      }
      get_public_team_utmb_rankings: {
        Args: { p_team_id: string }
        Returns: {
          mem_id: string
          mem_nm: string
          rct_race_nm: string
          rct_race_rec: string
          utmb_idx: number
          utmb_prf_url: string
        }[]
      }
      is_legacy_platform_admin: { Args: never; Returns: boolean }
      mem_mst_mem_ids_by_norm_phone: {
        Args: { p_input: string }
        Returns: string[]
      }
      migration_v2_map_evt_cd: { Args: { p_raw: string }; Returns: string }
      migration_v2_map_mem_st_cd: {
        Args: { p_status: Database["public"]["Enums"]["member_status"] }
        Returns: string
      }
      migration_v2_norm_email: { Args: { p_input: string }; Returns: string }
      migration_v2_norm_phone: { Args: { p_input: string }; Returns: string }
      rls_is_team_admin: { Args: { p_team_id: string }; Returns: boolean }
      rls_is_team_comp_admin: {
        Args: { p_team_comp_id: string }
        Returns: boolean
      }
      rls_is_team_comp_member: {
        Args: { p_team_comp_id: string }
        Returns: boolean
      }
      rls_is_team_member: { Args: { p_team_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      v2_rls_auth_in_team: { Args: { p_team_id: string }; Returns: boolean }
      v2_rls_auth_shares_team_with_mem: {
        Args: { p_peer_mem_id: string }
        Returns: boolean
      }
      v2_rls_auth_team_owner_or_admin: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      v2_rls_resolve_mem_id: { Args: never; Returns: string }
    }
    Enums: {
      fee_exm_tp_enm: "full" | "part"
      fee_grant_src_enm: "manual" | "rule_attd"
      fee_txn_io_enm: "deposit" | "withdrawal"
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
      fee_exm_tp_enm: ["full", "part"],
      fee_grant_src_enm: ["manual", "rule_attd"],
      fee_txn_io_enm: ["deposit", "withdrawal"],
      gender: ["male", "female"],
      member_status: ["active", "inactive", "banned", "pending"],
      participation_role: ["participant", "cheering", "volunteer"],
    },
  },
} as const
