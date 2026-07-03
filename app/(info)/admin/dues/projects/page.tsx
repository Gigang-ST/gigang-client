import { getProjects } from "@/lib/queries/dues";

import { ProjectsClient } from "./projects-client";

/** 회비 프로젝트(모금) 목록 — SP2. 생성·마감과 프로젝트별 모금액 요약. */
export default async function DuesProjectsPage() {
  const projects = await getProjects();
  return <ProjectsClient projects={projects} />;
}
