"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import "@uiw/react-md-editor/markdown-editor.css";
import { createPostSchema, type CreatePostInput } from "@/lib/validations/board";
import { createPost } from "@/app/actions/create-post";
import { updatePost } from "@/app/actions/update-post";
import type { BoardPost } from "@/lib/queries/board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type PostFormProps = {
  teamId: string;
  initialData?: BoardPost;
};

export function PostForm({ teamId, initialData }: PostFormProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isEdit = Boolean(initialData);

  const form = useForm<CreatePostInput>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      team_id: teamId,
      post_type_enm: initialData?.post_type_enm ?? "notice",
      post_nm: initialData?.post_nm ?? "",
      post_cont: initialData?.post_cont ?? "",
      pin_yn: initialData?.pin_yn ?? false,
    },
  });

  async function onSubmit(values: CreatePostInput) {
    try {
      if (isEdit && initialData) {
        await updatePost({ post_id: initialData.post_id, ...values });
        router.push(`/board/${initialData.post_id}`);
      } else {
        const result = await createPost({
          post_type_enm: values.post_type_enm,
          post_nm: values.post_nm,
          post_cont: values.post_cont,
          pin_yn: values.pin_yn,
        });
        router.push(`/board/${result.post_id}`);
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류가 발생했습니다.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 px-6 py-4">
        <FormField
          control={form.control}
          name="post_type_enm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>종류</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="종류 선택" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="notice">공지사항</SelectItem>
                  <SelectItem value="update">업데이트</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="post_nm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>제목</FormLabel>
              <FormControl>
                <Input placeholder="게시글 제목을 입력하세요." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-2">
          <Controller
            control={form.control}
            name="pin_yn"
            render={({ field }) => (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                <Label className="cursor-pointer">상단 고정</Label>
              </label>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="post_cont"
          render={({ field }) => (
            <FormItem>
              <FormLabel>내용</FormLabel>
              <FormControl>
                <div data-color-mode={resolvedTheme === "dark" ? "dark" : "light"} className="overflow-hidden rounded-md border border-border">
                  <MDEditor
                    value={field.value}
                    onChange={(val) => field.onChange(val ?? "")}
                    height={320}
                    preview="edit"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={form.formState.isSubmitting}
          >
            취소
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "저장 중..." : isEdit ? "수정" : "등록"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
