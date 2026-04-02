import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const meta = {
  title: "UI/Form",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function SimpleFormExample() {
  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      event: "",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(() => {})}
        className="w-[360px] space-y-6"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이름</FormLabel>
              <FormControl>
                <Input placeholder="이름을 입력하세요" {...field} />
              </FormControl>
              <FormDescription>팀 내에서 사용할 이름입니다.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="example@gigang.team"
                  {...field}
                />
              </FormControl>
              <FormDescription>대회 안내 메일을 받을 주소입니다.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="event"
          render={({ field }) => (
            <FormItem>
              <FormLabel>주 종목</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="종목을 선택하세요" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="running">러닝</SelectItem>
                  <SelectItem value="cycling">자전거</SelectItem>
                  <SelectItem value="swimming">수영</SelectItem>
                  <SelectItem value="trail">트레일러닝</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                가장 자주 참가하는 종목을 선택해주세요.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full">
          가입 신청
        </Button>
      </form>
    </Form>
  );
}

export const SimpleForm: Story = {
  render: () => <SimpleFormExample />,
};

function WithValidationExample() {
  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
    },
  });

  const onSubmit = form.handleSubmit(() => {});

  const handleValidate = async () => {
    const isValid = await form.trigger();
    if (!isValid) return;
    onSubmit();
  };

  // 수동으로 에러를 세팅해서 에러 상태를 보여줌
  useEffect(() => {
    form.setError("name", {
      type: "required",
      message: "이름은 필수 입력 항목입니다.",
    });
    form.setError("email", {
      type: "pattern",
      message: "올바른 이메일 형식이 아닙니다.",
    });
  }, [form]);

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="w-[360px] space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이름</FormLabel>
              <FormControl>
                <Input placeholder="이름을 입력하세요" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="example@gigang.team"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="button" onClick={handleValidate} className="w-full">
          가입 신청
        </Button>
      </form>
    </Form>
  );
}

export const WithValidation: Story = {
  render: () => <WithValidationExample />,
};
