import type { Metadata } from "next";
import { getBatchJobs } from "@/app/actions/admin/run-batch";
import { AdminBatchClient } from "./admin-batch-client";

export const metadata: Metadata = { title: "배치 관리" };

export default async function AdminBatchPage() {
  const raw = await getBatchJobs();
  // param_schema_json은 DB에서 Json 타입으로 오므로 클라이언트 타입에 맞게 캐스팅
  const jobs = raw.map((job) => ({
    ...job,
    param_schema_json: (job.param_schema_json ?? null) as import("./admin-batch-client").ParamField[] | null,
  }));
  return <AdminBatchClient initialJobs={jobs} />;
}
