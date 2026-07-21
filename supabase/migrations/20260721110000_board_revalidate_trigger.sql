-- 게시판(brd_post_mst) 변경 시 revalidation 트리거
-- 기존 revalidate_records() 함수를 재활용 (같은 /api/revalidate 엔드포인트 호출).
-- 함수 body가 TG_TABLE_NAME('brd_post_mst')을 실어 보내므로,
-- /api/revalidate의 BOARD_TABLES 분기가 board-posts 태그만 무효화한다(홈·대회·랭킹 안 건드림).
-- DB 직접 수정(SQL로 공지 편집 등)도 이 트리거를 타므로 앱을 거치지 않아도 캐시가 갱신된다.

-- brd_post_mst (게시글 생성/수정/삭제 — soft delete(del_yn) 포함)
DROP TRIGGER IF EXISTS trg_brd_post_mst_revalidate ON public.brd_post_mst;
CREATE TRIGGER trg_brd_post_mst_revalidate
  AFTER INSERT OR UPDATE OR DELETE ON public.brd_post_mst
  FOR EACH ROW EXECUTE FUNCTION revalidate_records();
